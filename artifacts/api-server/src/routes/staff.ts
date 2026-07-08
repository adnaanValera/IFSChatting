import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { ZipArchive } from "archiver";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { db, pool, shipmentsTable, companiesTable, uploadsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, asc, and, or, isNull, sql } from "drizzle-orm";
import { requireAuth, requireStaff, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = process.env.VERCEL
  ? path.resolve("/tmp", "ifs-uploads")
  : path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Fixed path where the report template is stored (overwritten on each upload)
const TEMPLATE_PATH = path.resolve(uploadsDir, "report-template.xlsx");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Template upload uses memory storage so we can copy to the fixed path
const templateStorage = multer.memoryStorage();
const templateUpload = multer({ storage: templateStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

// Expanded field map — covers many real-world Excel column name variations
const FIELD_MAP: Record<string, string> = {
  // IFS Ref
  "ifs ref": "ifsRef", "ifs_ref": "ifsRef", "ifs reference": "ifsRef",
  "ifs no": "ifsRef", "ifs no.": "ifsRef", "ifs number": "ifsRef",
  "ifsref": "ifsRef", "reference": "ifsRef", "ref": "ifsRef",
  "ref no": "ifsRef", "ref no.": "ifsRef", "ref number": "ifsRef",
  "job ref": "ifsRef", "job no": "ifsRef", "job number": "ifsRef",
  "shipment ref": "ifsRef", "shipment no": "ifsRef",
  "file no": "ifsRef", "file ref": "ifsRef",
  // MRA Ref
  "mra ref": "mraRef", "mra_ref": "mraRef", "mra reference": "mraRef",
  "mra no": "mraRef", "mra number": "mraRef", "mraref": "mraRef",
  "customs ref": "mraRef", "entry no": "mraRef", "entry number": "mraRef",
  "customs entry": "mraRef",
  // Container No
  "container no": "containerNo", "container no.": "containerNo",
  "container_no": "containerNo", "container number": "containerNo",
  "container": "containerNo", "cont no": "containerNo", "cont no.": "containerNo",
  "cont number": "containerNo", "container id": "containerNo", "containerid": "containerNo",
  "contr": "containerNo",
  // Shipper
  "shipper": "shipper", "supplier": "shipper", "exporter": "shipper",
  "sender": "shipper", "origin": "shipper", "shipper name": "shipper", "from": "shipper",
  // Consignee
  "consignee": "consignee", "receiver": "consignee", "recipient": "consignee",
  "importer": "consignee", "consignee name": "consignee", "to": "consignee",
  // Cargo Description
  "cargo description": "cargoDescription", "cargo_description": "cargoDescription",
  "cargo desc": "cargoDescription", "goods": "cargoDescription",
  "goods description": "cargoDescription", "description": "cargoDescription",
  "description of goods": "cargoDescription", "commodity": "cargoDescription",
  "item description": "cargoDescription",
  // Invoice No
  "invoice no": "invoiceNo", "invoice no.": "invoiceNo", "invoice_no": "invoiceNo",
  "invoice number": "invoiceNo", "invoice": "invoiceNo",
  "inv no": "invoiceNo", "inv no.": "invoiceNo", "inv number": "invoiceNo",
  // POD
  "pod": "pod", "port of discharge": "pod", "discharge port": "pod",
  "destination port": "pod", "port": "pod",
  // Entry
  "entry": "entry", "entry ref": "entry", "customs entry no": "entry",
  "declaration": "entry", "declaration no": "entry",
  // Final Port Destination
  "final port destination": "finalPortDestination", "fpd": "finalPortDestination",
  "final destination": "finalPortDestination", "destination": "finalPortDestination",
  "final port": "finalPortDestination", "delivery destination": "finalPortDestination",
  // Status
  "status": "status", "shipment status": "status", "container status": "status",
  "current status": "status", "state": "status",
  // Company Name
  "company": "companyName", "company name": "companyName", "company_name": "companyName",
  "client": "companyName", "client name": "companyName",
  "customer": "companyName", "customer name": "companyName",
  "account": "companyName", "account name": "companyName",
  "owner": "companyName", "importer name": "companyName",
};

export function companyFromFilename(filename: string): string | null {
  const match = filename.match(/Status Report\s*-\s*(.+?)\.xlsx?$/i);
  return match?.[1]?.trim() ?? null;
}

function cellStr(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "object" && "richText" in (val as object)) {
    return (val as { richText: { text: string }[] }).richText.map((rt) => rt.text).join("").trim() || undefined;
  }
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val).trim();
  return s || undefined;
}

function detectColOffset(vals: unknown[]): number | null {
  for (let i = 1; i <= 3; i++) {
    if (cellStr(vals[i])?.toLowerCase() === "ifs ref") return i;
  }
  return null;
}

function isSectionTitle(vals: unknown[]): boolean {
  const cells = vals.slice(1).map((v) => cellStr(v)).filter(Boolean) as string[];
  if (cells.length < 2) return false;
  return cells.every((c) => c === cells[0]);
}

function normalizeSectionLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sectionLabelFromRow(vals: unknown[]): string | null {
  const cells = vals.slice(1).map((v) => cellStr(v)).filter(Boolean) as string[];
  if (cells.length === 0) return null;
  const first = cells[0];
  if (cells.every((c) => normalizeSectionLabel(c) === normalizeSectionLabel(first))) {
    return first.toUpperCase().trim();
  }
  return null;
}

function autoIfsRef(companyName: string, rowKey: string): string {
  let h = 0;
  const s = `${companyName}|${rowKey}`;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return `AUTO-${companyName.replace(/\s+/g, "-").toUpperCase()}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameText(a: unknown, b: unknown): boolean {
  return (a ?? "") === (b ?? "");
}

async function pruneUploadHistoryForFilename(filename: string): Promise<void> {
  const sameNameUploads = await db
    .select({ id: uploadsTable.id })
    .from(uploadsTable)
    .where(eq(uploadsTable.filename, filename))
    .orderBy(desc(uploadsTable.uploadedAt));

  const oldUploadIds = sameNameUploads.slice(2).map((upload) => upload.id);
  for (const id of oldUploadIds) {
    await db.delete(uploadsTable).where(eq(uploadsTable.id, id));
  }
}

async function upsertShipment(record: {
  ifsRef: string; mraRef?: string; shipper?: string; consignee?: string;
  containerNo?: string; cargoDescription?: string; invoiceNo?: string;
  pod?: string; entry?: string; finalPortDestination?: string;
  status: string; companyName: string; uploadBatchId?: number;
  extraFields?: Record<string, unknown>;
  matchByContainer?: boolean; // when true, match by (ifsRef, containerNo) pair
}): Promise<"new" | "updated" | "unchanged"> {
  // Build where clause: for master uploads with a container no, use composite key
  // so multiple containers under the same IFS ref are distinct DB rows.
  const whereClause = (record.matchByContainer && record.containerNo)
    ? and(eq(shipmentsTable.ifsRef, record.ifsRef), eq(shipmentsTable.containerNo, record.containerNo))
    : eq(shipmentsTable.ifsRef, record.ifsRef);

  const existing = await db
    .select()
    .from(shipmentsTable)
    .where(whereClause)
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    const extraFieldsChanged = record.extraFields !== undefined
      ? stableJson(current.extraFields) !== stableJson(record.extraFields)
      : false;
    const hasChanges = extraFieldsChanged
      || !sameText(current.mraRef, record.mraRef)
      || !sameText(current.containerNo, record.containerNo)
      || !sameText(current.shipper, record.shipper)
      || !sameText(current.consignee, record.consignee)
      || !sameText(current.cargoDescription, record.cargoDescription)
      || !sameText(current.invoiceNo, record.invoiceNo)
      || !sameText(current.pod, record.pod)
      || !sameText(current.entry, record.entry)
      || !sameText(current.finalPortDestination, record.finalPortDestination)
      || !sameText(current.status, record.status)
      || !sameText(current.companyName, record.companyName);

    if (!hasChanges) return "unchanged";

    await db.update(shipmentsTable).set({
      mraRef: record.mraRef, containerNo: record.containerNo,
      shipper: record.shipper, consignee: record.consignee,
      cargoDescription: record.cargoDescription, invoiceNo: record.invoiceNo,
      pod: record.pod, entry: record.entry,
      finalPortDestination: record.finalPortDestination,
      status: record.status, companyName: record.companyName,
      uploadBatchId: record.uploadBatchId,
      ...(record.extraFields !== undefined ? { extraFields: record.extraFields } : {}),
      lastUpdated: new Date(),
    }).where(eq(shipmentsTable.id, existing[0].id));
    return "updated";
  }

  await db.insert(shipmentsTable).values(record);
  return "new";
}

// ── Status-report worksheet parser (for files named "Status Report - Company.xlsx") ──

export async function processStatusReportWorksheet(
  worksheet: ExcelJS.Worksheet,
  companyName: string,
  uploadBatchId?: number,
): Promise<{ totalRows: number; newRecords: number; updatedRecords: number; failedRows: number; failureReasons: string[] }> {
  let newRecords = 0, updatedRecords = 0, failedRows = 0, totalRows = 0;
  const failureReasons: string[] = [];
  let colOffset: number | null = null;

  for (let r = 1; r <= worksheet.rowCount; r++) {
    const vals = worksheet.getRow(r).values as unknown[];
    if (!vals || vals.length <= 1) continue;
    if (isSectionTitle(vals)) { colOffset = null; continue; }
    const detected = detectColOffset(vals);
    if (detected !== null) { colOffset = detected; continue; }
    if (colOffset === null) continue;

    const o = colOffset;
    const ifsRef      = cellStr(vals[o]);
    const typeField   = cellStr(vals[o + 1]);
    const blManifest  = cellStr(vals[o + 2]);
    const containerNo = cellStr(vals[o + 3]);
    const shipper     = cellStr(vals[o + 4]);
    const consignee   = cellStr(vals[o + 5]);
    const cargoDesc   = cellStr(vals[o + 6]);
    const invoiceNo   = cellStr(vals[o + 7]);
    const pod         = cellStr(vals[o + 8]);
    const fpd         = cellStr(vals[o + 9]);
    const agent       = cellStr(vals[o + 10]);
    const mraRef      = cellStr(vals[o + 11]);
    const entry       = cellStr(vals[o + 12]);
    const status      = cellStr(vals[o + 13]);

    if (![ifsRef, mraRef, shipper, consignee, containerNo, cargoDesc].some(Boolean)) continue;

    const rowKey = [mraRef, containerNo, invoiceNo, `r${r}`].filter(Boolean).join("|");
    const finalIfsRef = ifsRef ?? autoIfsRef(companyName, rowKey);
    const extraFields: Record<string, unknown> = {};
    if (typeField) extraFields["Type"] = typeField;
    if (blManifest) extraFields["BL / Manifest No."] = blManifest;
    if (agent) extraFields["Agent"] = agent;
    totalRows++;
    try {
      const result = await upsertShipment({
        ifsRef: finalIfsRef, mraRef, shipper, consignee, containerNo,
        cargoDescription: cargoDesc, invoiceNo, pod, entry,
        finalPortDestination: fpd, status: status ?? "In Transit",
        companyName, uploadBatchId,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
      });
      await db.insert(companiesTable).values({ companyName }).onConflictDoNothing();
      if (result === "new") newRecords++;
      else if (result === "updated") updatedRecords++;
    } catch (err) {
      failedRows++;
      failureReasons.push(`Row ${r}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { totalRows, newRecords, updatedRecords, failedRows, failureReasons };
}

// ── Tracking Master worksheet parser ─────────────────────────────────────────
// Parses the daily TRACKING_MASTER format: section headers (same value across all cells),
// then a header row (IFS Ref, Type, BL, Contr, Shipper, Consignee, ...), then data rows.
// Uses Consignee as company_name. Matches by (ifsRef, containerNo) so multiple containers
// under the same IFS ref are stored as distinct DB rows.

export async function parseMasterWorksheet(
  worksheet: ExcelJS.Worksheet,
  uploadBatchId?: number,
): Promise<{
  totalRows: number; newRecords: number; updatedRecords: number;
  failedRows: number; failureReasons: string[]; consignees: string[];
}> {
  let newRecords = 0, updatedRecords = 0, failedRows = 0, totalRows = 0;
  const failureReasons: string[] = [];
  let colOffset: number | null = null;
  const consigneeSet = new Set<string>();
  let currentSection: string | null = null;

  for (let r = 1; r <= worksheet.rowCount; r++) {
    const vals = worksheet.getRow(r).values as unknown[];
    if (!vals || vals.length <= 1) continue;
    const sectionLabel = sectionLabelFromRow(vals);
    if (sectionLabel) { currentSection = sectionLabel; colOffset = null; continue; }
    const detected = detectColOffset(vals);
    if (detected !== null) { colOffset = detected; continue; }
    if (colOffset === null) continue;

    const o = colOffset;
    // Tracking master columns: IFS Ref, Type, BL/Manifest No., Contr(ainer), Shipper,
    // Consignee, Cargo Desc, Invoice No., POD, FPD, Agent, MRA Ref, Entry, Status, Docs
    const ifsRef      = cellStr(vals[o]);
    const typeField   = cellStr(vals[o + 1]);
    const blManifest  = cellStr(vals[o + 2]);
    const containerNo = cellStr(vals[o + 3]);
    const shipper     = cellStr(vals[o + 4]);
    const consignee   = cellStr(vals[o + 5]);
    const cargoDesc   = cellStr(vals[o + 6]);
    const invoiceNo   = cellStr(vals[o + 7]);
    const pod         = cellStr(vals[o + 8]);
    const fpd         = cellStr(vals[o + 9]);
    const agent       = cellStr(vals[o + 10]);
    const mraRef      = cellStr(vals[o + 11]);
    const entry       = cellStr(vals[o + 12]);
    const status      = cellStr(vals[o + 13]);
    // o + 14 = Docs (informational, not stored)

    if (![ifsRef, shipper, consignee, containerNo, cargoDesc].some(Boolean)) continue;

    // Use consignee as the company (this is the tracking master — one company per row)
    const companyName = (consignee ?? shipper ?? "Unknown").trim();
    consigneeSet.add(companyName);

    const rowKey = [mraRef, containerNo, invoiceNo, `r${r}`].filter(Boolean).join("|");
    const finalIfsRef = ifsRef ?? autoIfsRef(companyName, rowKey);

    const extraFields: Record<string, unknown> = {};
    if (typeField) extraFields["Type"] = typeField;
    if (blManifest) extraFields["BL / Manifest No."] = blManifest;
    if (agent) extraFields["Agent"] = agent;
    if (currentSection) extraFields["Source Section"] = currentSection;

    totalRows++;
    try {
      const result = await upsertShipment({
        ifsRef: finalIfsRef, mraRef, shipper, consignee, containerNo,
        cargoDescription: cargoDesc, invoiceNo, pod, entry,
        finalPortDestination: fpd, status: status ?? "In Transit",
        companyName, uploadBatchId,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
        matchByContainer: true, // distinguish multiple containers per IFS ref
      });
      await db.insert(companiesTable).values({ companyName }).onConflictDoNothing();
      if (result === "new") newRecords++;
      else if (result === "updated") updatedRecords++;
    } catch (err) {
      failedRows++;
      failureReasons.push(`Row ${r}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { totalRows, newRecords, updatedRecords, failedRows, failureReasons, consignees: [...consigneeSet].sort() };
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function mapHeader(raw: string): string | null {
  return FIELD_MAP[normaliseHeader(raw)] ?? null;
}

async function processGenericWorksheet(
  worksheet: ExcelJS.Worksheet,
  fileIndex: number,
  filenameCompany: string | null,
  uploadBatchId?: number,
): Promise<{ totalRows: number; newRecords: number; updatedRecords: number; failedRows: number; failureReasons: string[]; detectedHeaders: string[] }> {
  const headerRow = worksheet.getRow(1).values as (string | undefined)[];
  const rawHeaders = headerRow.slice(1).map((h) => (h ?? "").toString().trim());
  const mappedHeaders = rawHeaders.map((h) => ({ raw: h, mapped: mapHeader(h) }));
  logger.info({ mappedHeaders }, "Excel upload: detected headers");

  let newRecords = 0, updatedRecords = 0, failedRows = 0, totalRows = 0;
  const failureReasons: string[] = [];

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const vals = worksheet.getRow(r).values as unknown[];
    if (!vals || vals.length <= 1) continue;
    if (!vals.slice(1).some((v) => v !== null && v !== undefined && String(v).trim() !== "")) continue;
    totalRows++;
    try {
      const record: Record<string, unknown> = {};
      const extra: Record<string, unknown> = {};
      mappedHeaders.forEach(({ raw, mapped }, i) => {
        const strVal = cellStr(vals[i + 1]);
        if (mapped) { if (strVal) record[mapped] = strVal; }
        else if (raw && strVal) extra[raw] = strVal;
      });
      if (!record["ifsRef"]) {
        const company = filenameCompany ?? (record["companyName"] as string) ?? "UNKNOWN";
        const rowKey = [record["containerNo"], record["invoiceNo"], record["mraRef"], `r${r}f${fileIndex}`].filter(Boolean).join("|");
        record["ifsRef"] = autoIfsRef(company, rowKey);
      }
      if (!record["companyName"]) {
        record["companyName"] = filenameCompany ?? (record["consignee"] as string) ?? (record["shipper"] as string) ?? "Unknown";
      }
      if (!record["status"]) record["status"] = "In Transit";
      const result = await upsertShipment({
        ifsRef: record["ifsRef"] as string,
        mraRef: record["mraRef"] as string | undefined,
        containerNo: record["containerNo"] as string | undefined,
        shipper: record["shipper"] as string | undefined,
        consignee: record["consignee"] as string | undefined,
        cargoDescription: record["cargoDescription"] as string | undefined,
        invoiceNo: record["invoiceNo"] as string | undefined,
        pod: record["pod"] as string | undefined,
        entry: record["entry"] as string | undefined,
        finalPortDestination: record["finalPortDestination"] as string | undefined,
        status: record["status"] as string,
        companyName: record["companyName"] as string,
        uploadBatchId,
        extraFields: Object.keys(extra).length > 0 ? extra : undefined,
      });
      await db.insert(companiesTable).values({ companyName: record["companyName"] as string }).onConflictDoNothing();
      if (result === "new") newRecords++;
      else if (result === "updated") updatedRecords++;
    } catch (err) {
      failedRows++;
      failureReasons.push(`Row ${r}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { totalRows, newRecords, updatedRecords, failedRows, failureReasons, detectedHeaders: mappedHeaders.map((h) => `${h.raw} → ${h.mapped ?? "(extra field)"}`) };
}

// ── Upload Excel files (staff only) ──────────────────────────────────────────

router.post("/staff/upload", requireAuth, requireStaff, upload.array("files"), async (req, res) => {
  const authReq = req as typeof req & { user: { email: string } };
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) { res.status(400).json({ error: "No files provided" }); return; }

  let totalRows = 0, newRecords = 0, updatedRecords = 0, failedRows = 0;
  const allFailureReasons: string[] = [];
  const allDetectedHeaders: Set<string> = new Set();

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    let worksheet: ExcelJS.Worksheet | undefined;

    try {
      const workbook = new ExcelJS.Workbook();
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".csv") {
        await workbook.csv.readFile(file.path);
      } else {
        await workbook.xlsx.readFile(file.path);
      }
      worksheet = workbook.worksheets[0];
    } catch (parseErr) {
      const reason = parseErr instanceof Error ? parseErr.message : String(parseErr);
      allFailureReasons.push(`${file.originalname}: Failed to parse — ${reason}`);
      logger.warn({ file: file.originalname, parseErr }, "Excel upload: file parse failed");
      continue;
    }

    if (!worksheet) {
      allFailureReasons.push(`${file.originalname}: Empty workbook — skipped`);
      continue;
    }

    const [uploadRecord] = await db.insert(uploadsTable).values({
      filename: file.originalname,
      totalRows: 0,
      newRecords: 0,
      updatedRecords: 0,
      uploadedBy: authReq.user.email,
    }).returning();

    const filenameCompany = companyFromFilename(file.originalname);
    let result: { totalRows: number; newRecords: number; updatedRecords: number; failedRows: number; failureReasons: string[] };

    if (filenameCompany) {
      result = await processStatusReportWorksheet(worksheet, filenameCompany, uploadRecord.id);
    } else {
      result = await processGenericWorksheet(worksheet, fi, null, uploadRecord.id);
    }

    await db.update(uploadsTable).set({
      totalRows: result.totalRows,
      newRecords: result.newRecords,
      updatedRecords: result.updatedRecords,
    }).where(eq(uploadsTable.id, uploadRecord.id));
    await pruneUploadHistoryForFilename(file.originalname);

    // Notify affected customers
    try {
      const processed = await db
        .selectDistinct({ companyName: shipmentsTable.companyName })
        .from(shipmentsTable)
        .where(eq(shipmentsTable.uploadBatchId, uploadRecord.id));

      for (const { companyName } of processed) {
        const customers = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(sql`lower(${usersTable.companyName}) = lower(${companyName})`);

        for (const { id: userId } of customers) {
          const parts: string[] = [];
          if (result.newRecords > 0) parts.push(`${result.newRecords} new`);
          if (result.updatedRecords > 0) parts.push(`${result.updatedRecords} updated`);
          const summary = parts.length > 0 ? parts.join(" and ") + " shipment" + (result.newRecords + result.updatedRecords !== 1 ? "s" : "") : "shipments";
          await db.insert(notificationsTable).values({
            userId,
            title: "Shipment Status Updated",
            message: `A new status report has been uploaded for ${companyName}: ${summary}. Tap to view your dashboard.`,
            companyName,
          });
        }
      }
    } catch (notifErr) {
      logger.warn({ notifErr }, "Failed to create customer notifications after upload");
    }

    totalRows += result.totalRows;
    newRecords += result.newRecords;
    updatedRecords += result.updatedRecords;
    failedRows += result.failedRows;
    result.failureReasons.forEach((r) => allFailureReasons.push(`[${file.originalname}] ${r}`));
    allDetectedHeaders.add(filenameCompany ? `Company: ${filenameCompany}` : "Generic format");
  }

  res.json({
    totalRows, newRecords, updatedRecords, failedRows,
    message: `Processed ${totalRows} rows across ${files.length} file(s): ${newRecords} new, ${updatedRecords} updated${failedRows > 0 ? `, ${failedRows} failed` : ""}`,
    detectedHeaders: [...allDetectedHeaders],
    failureReasons: allFailureReasons.slice(0, 10),
  });
});

// ── Upload Tracking Master (staff only) ──────────────────────────────────────
// Parses the daily TRACKING_MASTER_*.xlsx file. Groups all rows by Consignee and
// upserts them as separate company records. Returns the list of unique consignees
// so the client can prompt a ZIP download of all generated reports.

router.post("/staff/upload-master", requireAuth, requireStaff, upload.single("file"), async (req, res) => {
  const authReq = req as typeof req & { user: { email: string } };
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: "No file provided" }); return; }

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
  } catch (parseErr) {
    res.status(400).json({ error: `Failed to parse file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` });
    return;
  }

  const ws = workbook.worksheets[0]; // Sheet1 — the live shipments sheet
  if (!ws) { res.status(400).json({ error: "No worksheet found in file" }); return; }

  const [uploadRecord] = await db.insert(uploadsTable).values({
    filename: file.originalname,
    totalRows: 0,
    newRecords: 0,
    updatedRecords: 0,
    uploadedBy: authReq.user.email,
  }).returning();

  const result = await parseMasterWorksheet(ws, uploadRecord.id);

  await db.update(uploadsTable).set({
    totalRows: result.totalRows,
    newRecords: result.newRecords,
    updatedRecords: result.updatedRecords,
  }).where(eq(uploadsTable.id, uploadRecord.id));
  await pruneUploadHistoryForFilename(file.originalname);

  res.json({
    totalRows: result.totalRows,
    newRecords: result.newRecords,
    updatedRecords: result.updatedRecords,
    failedRows: result.failedRows,
    failureReasons: result.failureReasons.slice(0, 10),
    consignees: result.consignees,
    message: `Tracking master processed: ${result.totalRows} rows, ${result.consignees.length} companies (${result.newRecords} new, ${result.updatedRecords} updated${result.failedRows > 0 ? `, ${result.failedRows} failed` : ""})`,
  });
});

// ── List uploads (staff only) ─────────────────────────────────────────────────

router.get("/staff/uploads", requireAuth, requireStaff, async (_req, res) => {
  const uploads = await db.select().from(uploadsTable).orderBy(uploadsTable.uploadedAt);
  res.json(uploads);
});

// ── Delete ALL uploads + all shipments (staff only) ──────────────────────────

router.delete("/staff/uploads", requireAuth, requireStaff, async (_req, res) => {
  await db.delete(shipmentsTable);
  await db.delete(uploadsTable);
  await db.delete(companiesTable);
  res.status(204).send();
});

// ── Delete upload + its shipments (staff only) ────────────────────────────────

router.delete("/staff/uploads/:id", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(shipmentsTable).where(eq(shipmentsTable.uploadBatchId, id));
  await db.delete(uploadsTable).where(eq(uploadsTable.id, id));
  res.status(204).send();
});

// ── Report template upload / status ─────────────────────────────────────────

async function getReportTemplate(): Promise<{ buffer: Buffer; uploadedAt?: string } | null> {
  const result = await pool.query<{ content: Buffer; uploaded_at: Date }>(
    "SELECT content, uploaded_at FROM report_templates WHERE id = 1",
  );
  if (result.rows[0]) {
    return { buffer: result.rows[0].content, uploadedAt: result.rows[0].uploaded_at.toISOString() };
  }
  if (fs.existsSync(TEMPLATE_PATH)) {
    const stat = fs.statSync(TEMPLATE_PATH);
    return { buffer: fs.readFileSync(TEMPLATE_PATH), uploadedAt: stat.mtime.toISOString() };
  }
  return null;
}

router.get("/staff/template-status", requireAuth, requireStaff, async (_req, res) => {
  const template = await getReportTemplate();
  res.json(template
    ? { hasTemplate: true, uploadedAt: template.uploadedAt, sizeBytes: template.buffer.length }
    : { hasTemplate: false }
  );
});

router.post("/staff/upload-template", requireAuth, requireStaff, templateUpload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  fs.writeFileSync(TEMPLATE_PATH, req.file.buffer);
  await pool.query(
    `
      INSERT INTO report_templates (id, content, uploaded_at)
      VALUES (1, $1, now())
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, uploaded_at = now()
    `,
    [req.file.buffer],
  );
  res.json({ message: "Template saved", sizeBytes: req.file.buffer.length });
});

// ── Excel report generation helper ───────────────────────────────────────────

const REPORT_KEYS = [
  "ifsRef", "type", "blNo", "containerNo", "shipper", "consignee", "cargoDescription",
  "invoiceNo", "pod", "finalPortDestination", "agent", "mraRef", "entry", "status",
] as const;

const REPORT_WIDTHS: Record<string, { min: number; max: number; wrap?: boolean }> = {
  ifsRef: { min: 24, max: 24 },
  type: { min: 8, max: 8 },
  blNo: { min: 18, max: 18 },
  containerNo: { min: 17, max: 17 },
  shipper: { min: 18, max: 18, wrap: true },
  consignee: { min: 20, max: 20, wrap: true },
  cargoDescription: { min: 24, max: 24, wrap: true },
  invoiceNo: { min: 14, max: 14 },
  pod: { min: 10, max: 10 },
  finalPortDestination: { min: 10, max: 10 },
  agent: { min: 15, max: 15, wrap: true },
  mraRef: { min: 16, max: 16 },
  entry: { min: 16, max: 16 },
  status: { min: 16, max: 16 },
};

function cellTextLength(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (typeof value === "number") return String(value).length;
  if (value instanceof Date) return 10;
  if (typeof value === "object" && (value as any).richText) {
    return ((value as any).richText as any[]).map((r: any) => r.text ?? "").join("").length;
  }
  if (typeof value === "object" && (value as any).text) return String((value as any).text).length;
  return String(value).length;
}

// Auto-fit every column to readable report widths without making the sheet sprawl.
function autoFitWorksheet(ws: ExcelJS.Worksheet): void {
  const maxLen: Record<number, number> = {};
  const columnKeys: Record<number, typeof REPORT_KEYS[number]> = {};

  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
      if (colIdx <= 2) return; // keep spacer cols narrow
      const headerKey = reportKeyFromHeader(cellStr(cell.value) ?? "");
      if (headerKey) columnKeys[colIdx] = headerKey;
      const len = cellTextLength(cell.value);
      maxLen[colIdx] = Math.max(maxLen[colIdx] ?? 0, len);
    });
  });

  ws.columns.forEach((col, idx) => {
    const colIdx = idx + 1;
    if (colIdx <= 2) { col.width = 3; return; }
    const key = columnKeys[colIdx];
    if (key) {
      col.width = REPORT_WIDTHS[key].max;
      return;
    }
    const best = maxLen[colIdx] ?? 0;
    if (best > 0) col.width = Math.min(Math.max(best + 2, 8), 16);
  });

  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
      const key = columnKeys[colIdx];
      if (key) {
        cell.alignment = {
          ...(cell.alignment ?? {}),
          wrapText: Boolean(REPORT_WIDTHS[key]?.wrap),
          vertical: "middle",
        };
      }
    });
  });
}

const SECTION_MAP: { label: string; statuses: string[] }[] = [
  { label: "SHIPMENTS IN MALAWI",  statuses: ["Delivered", "Awaiting Clearance"] },
  { label: "SHIPMENTS ENROUTE",    statuses: ["In Transit", "Enroute LLW", "Enroute BLZ", "Enroute"] },
  { label: "SHIPMENTS AT POD",     statuses: ["At Port", "Offloading", "Offloaded"] },
  { label: "SHIPMENTS ON SEA",     statuses: ["Delayed", "On Sea", "At Sea"] },
];

function extraVal(extra: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = extra[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parseShipmentDate(value: string): Date | null {
  const monthNames: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
    september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const now = new Date();
  const wordDate = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{2,4}))?\b/);
  if (wordDate?.[1] && wordDate[2]) {
    const month = monthNames[wordDate[2].toLowerCase()];
    if (month !== undefined) {
      const year = wordDate[3] ? normalizeYear(wordDate[3]) : now.getFullYear();
      return new Date(year, month, Number(wordDate[1]));
    }
  }
  const slashDate = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slashDate?.[1] && slashDate[2]) {
    const year = slashDate[3] ? normalizeYear(slashDate[3]) : now.getFullYear();
    return new Date(year, Number(slashDate[2]) - 1, Number(slashDate[1]));
  }
  return null;
}

function normalizeYear(value: string): number {
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function sortRowsForSection<T extends { status: string }>(label: string, rows: T[]): T[] {
  if (label !== "SHIPMENTS ON SEA") return rows;
  return [...rows].sort((a, b) => {
    const aDate = parseShipmentDate(a.status)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDate = parseShipmentDate(b.status)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });
}

function todayString(): string {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yy = String(today.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

function shipmentSectionLabel(s: typeof shipmentsTable.$inferSelect): string {
  const extra = (s.extraFields as Record<string, unknown>) ?? {};
  const sourceSection = extraVal(extra, "Source Section", "sourceSection");
  if (sourceSection) {
    const matchingSection = SECTION_MAP.find((section) =>
      normalizeSectionLabel(section.label) === normalizeSectionLabel(sourceSection)
    );
    return matchingSection?.label ?? sourceSection.toUpperCase();
  }

  const status = s.status.toLowerCase();
  return SECTION_MAP.find((section) => section.statuses.some(
    (st) => status.includes(st.toLowerCase()) || st.toLowerCase().includes(status),
  ))?.label ?? "OTHER SHIPMENTS";
}

function shipmentReportValues(s: typeof shipmentsTable.$inferSelect): string[] {
  const extra = (s.extraFields as Record<string, unknown>) ?? {};
  return [
    s.ifsRef,
    extraVal(extra, "Type", "type"),
    extraVal(extra, "BL / Manifest No.", "BL/Manifest No.", "BL", "bl"),
    s.containerNo ?? "",
    s.shipper ?? "",
    s.consignee ?? "",
    s.cargoDescription ?? "",
    s.invoiceNo ?? "",
    s.pod ?? "",
    s.finalPortDestination ?? "",
    extraVal(extra, "Agent", "agent"),
    s.mraRef ?? "",
    s.entry ?? "",
    s.status,
  ];
}

function shipmentReportValueByKey(s: typeof shipmentsTable.$inferSelect, key: string): string {
  const values = shipmentReportValues(s);
  const index = REPORT_KEYS.indexOf(key as typeof REPORT_KEYS[number]);
  return index >= 0 ? values[index] : "";
}

function reportKeyFromHeader(header: string): typeof REPORT_KEYS[number] | null {
  const normalized = normalizeSectionLabel(header);
  if (normalized === "IFS REF" || normalized === "IFS REFERENCE" || normalized.includes("IFS REF")) return "ifsRef";
  if (normalized === "TYPE") return "type";
  if (normalized.includes("BL") || normalized.includes("MANIFEST")) return "blNo";
  if (normalized === "CONTAINER NO" || normalized === "CONTR" || normalized.includes("CONTAINER")) return "containerNo";
  if (normalized === "SHIPPER") return "shipper";
  if (normalized === "CONSIGNEE") return "consignee";
  if (normalized.includes("CARGO")) return "cargoDescription";
  if (normalized.includes("INVOICE")) return "invoiceNo";
  if (normalized === "POD") return "pod";
  if (normalized === "FPD" || normalized.includes("FINAL PORT")) return "finalPortDestination";
  if (normalized === "AGENT") return "agent";
  if (normalized === "MRA REF" || normalized.includes("MRA")) return "mraRef";
  if (normalized === "ENTRY" || normalized.includes("ENTRY")) return "entry";
  if (normalized === "STATUS") return "status";
  return null;
}

function headerColumnMap(row: ExcelJS.Row): Array<{ col: number; key: typeof REPORT_KEYS[number] }> {
  const mappings: Array<{ col: number; key: typeof REPORT_KEYS[number] }> = [];
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = reportKeyFromHeader(cellStr(cell.value) ?? "");
    if (key) mappings.push({ col, key });
  });
  return mappings;
}

function updateTemplateDate(ws: ExcelJS.Worksheet, dateStr: string): void {
  let updated = false;
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const value = cellStr(cell.value);
      if (value && /^date\s*:/i.test(value)) {
        cell.value = value.replace(/^date\s*:.*/i, `Date: ${dateStr}`);
        updated = true;
      }
    });
  });
  if (!updated) ws.getCell("M5").value = `Date: ${dateStr}`;
}

function copyRowStyle(source: ExcelJS.Row, target: ExcelJS.Row): void {
  target.height = source.height;
  source.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const targetCell = target.getCell(colNumber);
    targetCell.style = { ...cell.style };
    targetCell.numFmt = cell.numFmt;
    targetCell.alignment = cell.alignment ? { ...cell.alignment } : cell.alignment;
    targetCell.border = cell.border ? { ...cell.border } : cell.border;
    targetCell.fill = cell.fill ? { ...cell.fill } : cell.fill;
    targetCell.font = cell.font ? { ...cell.font } : cell.font;
  });
}

function findTemplateSections(ws: ExcelJS.Worksheet): Record<string, { sectionRow: number; headerRow: number; dataStart: number; dataEnd: number }> {
  const found: Array<{ label: string; row: number }> = [];
  ws.eachRow((row, rowNumber) => {
    const values = row.values as unknown[];
    const rowText = values.map((v) => cellStr(v)).filter(Boolean).join(" ");
    for (const section of SECTION_MAP) {
      if (normalizeSectionLabel(rowText).includes(normalizeSectionLabel(section.label))) {
        found.push({ label: section.label, row: rowNumber });
      }
    }
  });

  const sections: Record<string, { sectionRow: number; headerRow: number; dataStart: number; dataEnd: number }> = {};
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const nextRow = found[i + 1]?.row ?? ((ws.lastRow?.number ?? current.row) + 1);
    let headerRow = current.row + 1;
    for (let rowNumber = current.row + 1; rowNumber < nextRow; rowNumber++) {
      const row = ws.getRow(rowNumber);
      const values = (row.values as unknown[]).map((v) => normalizeSectionLabel(cellStr(v) ?? ""));
      if (values.some((v) => v === "IFS REF")) {
        headerRow = rowNumber;
        break;
      }
    }
    sections[current.label] = {
      sectionRow: current.row,
      headerRow,
      dataStart: headerRow + 1,
      dataEnd: Math.max(headerRow + 1, nextRow - 1),
    };
  }
  return sections;
}

function fillTemplateSections(ws: ExcelJS.Worksheet, shipments: (typeof shipmentsTable.$inferSelect)[]): boolean {
  const sections = findTemplateSections(ws);
  if (Object.keys(sections).length === 0) return false;

  const grouped = new Map<string, (typeof shipmentsTable.$inferSelect)[]>();
  for (const shipment of shipments) {
    const label = shipmentSectionLabel(shipment);
    grouped.set(label, [...(grouped.get(label) ?? []), shipment]);
  }

  const orderedLabels = SECTION_MAP.map((section) => section.label).filter((label) => sections[label]);
  let rowOffset = 0;
  for (const label of orderedLabels) {
    const section = sections[label];
    const rows = sortRowsForSection(label, grouped.get(label) ?? []);
    const dataStart = section.dataStart + rowOffset;
    const dataEnd = section.dataEnd + rowOffset;
    const columnMap = headerColumnMap(ws.getRow(section.headerRow + rowOffset));
    const columnsToClear = columnMap.length > 0 ? columnMap.map((mapping) => mapping.col) : Array.from({ length: 14 }, (_v, i) => i + 3);
    const availableRows = Math.max(1, dataEnd - dataStart + 1);
    const neededRows = Math.max(1, rows.length);
    const templateRow = ws.getRow(dataStart);

    if (neededRows > availableRows) {
      ws.spliceRows(dataEnd + 1, 0, ...Array.from({ length: neededRows - availableRows }, () => []));
      for (let rowNumber = dataEnd + 1; rowNumber <= dataEnd + neededRows - availableRows; rowNumber++) {
        copyRowStyle(templateRow, ws.getRow(rowNumber));
      }
      rowOffset += neededRows - availableRows;
    }

    for (let rowNumber = dataStart; rowNumber < dataStart + neededRows; rowNumber++) {
      const row = ws.getRow(rowNumber);
      columnsToClear.forEach((col) => { row.getCell(col).value = ""; });
      const shipment = rows[rowNumber - dataStart];
      if (shipment) {
        if (columnMap.length > 0) {
          columnMap.forEach(({ col, key }) => {
            row.getCell(col).value = shipmentReportValueByKey(shipment, key);
          });
        } else {
          shipmentReportValues(shipment).forEach((value, i) => {
            row.getCell(i + 3).value = value;
          });
        }
      }
      row.commit();
    }
  }

  return true;
}

async function generateCompanyReportWorkbook(
  companyName: string,
  shipments: (typeof shipmentsTable.$inferSelect)[],
  templateBuf?: Buffer | null,
): Promise<ExcelJS.Workbook> {
  const dateStr = todayString();

  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet;

  if (templateBuf) {
    // ── Template-based path ───────────────────────────────────────────────
    await wb.xlsx.load(templateBuf);
    ws = wb.worksheets[0];
    updateTemplateDate(ws, dateStr);
    if (fillTemplateSections(ws, shipments)) {
      autoFitWorksheet(ws);
      return wb;
    }
  } else {
    // ── Scratch path (no template) ────────────────────────────────────────
    ws = wb.addWorksheet("Status Report");

    ws.columns = [
      { width: 3 },   // A spacer
      { width: 3 },   // B spacer
      { width: 15 },  // C IFS Ref
      { width: 10 },  // D Type
      { width: 20 },  // E BL / Manifest No.
      { width: 16 },  // F Container No.
      { width: 20 },  // G Shipper
      { width: 22 },  // H Consignee
      { width: 24 },  // I Cargo Desc
      { width: 16 },  // J Invoice No.
      { width: 10 },  // K POD
      { width: 10 },  // L FPD
      { width: 18 },  // M Agent
      { width: 16 },  // N MRA Ref
      { width: 16 },  // O Entry
      { width: 18 },  // P Status
    ];
  }

  const RED = "FFC00000";
  const DARK_BLUE = "FF1F3864";
  const HEADER_BG = "FFD6DCE4";
  const ROW_ALT = "FFF2F2F2";
  const WHITE = "FFFFFFFF";

  const addSectionHeader = (title: string) => {
    const r = ws.addRow(["", "", title]);
    const rn = r.number;
    ws.mergeCells(`C${rn}:P${rn}`);
    const cell = ws.getCell(`C${rn}`);
    cell.value = title;
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BLUE } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    r.height = 22;
  };

  const addColHeaders = () => {
    const labels = ["", "", "IFS Ref", "Type", "BL / Manifest No.", "Container No.", "Shipper", "Consignee", "Cargo Desc", "Invoice No.", "POD", "FPD", "Agent", "MRA Ref", "Entry", "Status"];
    const r = ws.addRow(labels);
    r.height = 16;
    r.font = { bold: true, size: 9 };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    for (let c = 3; c <= 16; c++) {
      const cell = r.getCell(c);
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  };

  const addShipmentRow = (s: typeof shipments[0], rowIdx: number) => {
    const extra = (s.extraFields as Record<string, unknown>) ?? {};
    const r = ws.addRow([
      "", "",
      s.ifsRef,
      extraVal(extra, "Type", "type"),
      extraVal(extra, "BL / Manifest No.", "BL/Manifest No.", "BL", "bl"),
      s.containerNo ?? "",
      s.shipper ?? "",
      s.consignee ?? "",
      s.cargoDescription ?? "",
      s.invoiceNo ?? "",
      s.pod ?? "",
      s.finalPortDestination ?? "",
      extraVal(extra, "Agent", "agent"),
      s.mraRef ?? "",
      s.entry ?? "",
      s.status,
    ]);
    r.height = 14;
    r.font = { size: 9 };
    const bg = rowIdx % 2 === 1 ? ROW_ALT : WHITE;
    for (let c = 3; c <= 16; c++) {
      const cell = r.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { vertical: "middle", wrapText: false };
    }
  };

  if (!templateBuf) {
    // Scratch path: build the branding header rows
    ws.addRow([]); ws.addRow([]); ws.addRow([]);

    const r4 = ws.addRow(["", "", "InterFreight Solutions", "", "", "", "", "", "", "", "", "", "Status Report", "", "", ""]);
    ws.mergeCells("C4:L4"); ws.mergeCells("M4:P4");
    ws.getCell("C4").font = { bold: true, size: 16, color: { argb: RED } };
    ws.getCell("C4").alignment = { horizontal: "left", vertical: "middle" };
    ws.getCell("M4").font = { bold: true, size: 13, color: { argb: DARK_BLUE } };
    ws.getCell("M4").alignment = { horizontal: "right", vertical: "middle" };
    r4.height = 28;

    const r5 = ws.addRow(["", "", companyName, "", "", "", "", "", "", "", "", "", `Date: ${dateStr}`, "", "", ""]);
    ws.mergeCells("C5:L5"); ws.mergeCells("M5:P5");
    ws.getCell("C5").font = { bold: true, size: 11 };
    ws.getCell("M5").font = { size: 10 };
    ws.getCell("M5").alignment = { horizontal: "right" };
    r5.height = 20;

    ws.addRow([]);
  }

  // Sections (same logic for both paths)
  const usedStatuses = new Set<string>();
  for (const section of SECTION_MAP) {
    const rows = sortRowsForSection(section.label, shipments.filter((s) => section.statuses.some(
      (st) => s.status.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(s.status.toLowerCase())
    )));
    rows.forEach((s) => usedStatuses.add(s.status));
    addSectionHeader(section.label);
    addColHeaders();
    if (rows.length === 0) {
      const empty = ws.addRow(["", "", "—"]);
      ws.mergeCells(`C${empty.number}:P${empty.number}`);
      ws.getCell(`C${empty.number}`).alignment = { horizontal: "center" };
      ws.getCell(`C${empty.number}`).font = { italic: true, color: { argb: "FF888888" }, size: 9 };
    } else {
      rows.forEach((s, i) => addShipmentRow(s, i));
    }
    ws.addRow([]);
  }

  const other = shipments.filter((s) => !usedStatuses.has(s.status));
  if (other.length > 0) {
    addSectionHeader("OTHER SHIPMENTS");
    addColHeaders();
    other.forEach((s, i) => addShipmentRow(s, i));
    ws.addRow([]);
  }

  // Auto-fit column widths to content
  autoFitWorksheet(ws);

  return wb;
}

// ── Company Status Report Excel download (staff only) ────────────────────────

router.get("/staff/company-report/:company/excel", requireAuth, requireStaff, async (req, res) => {
  const companyName = decodeURIComponent(req.params["company"] as string);
  const shipments = await db.select().from(shipmentsTable).where(sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`).orderBy(asc(shipmentsTable.ifsRef));
  const template = await getReportTemplate();
  const wb = await generateCompanyReportWorkbook(companyName, shipments, template?.buffer ?? null);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Status Report - ${companyName}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ── Consignee-scoped Status Report Excel download (staff only) ───────────────
// Same report format as the company-level download, but filtered to a single
// consignee within that company.

router.get("/staff/company-report/:company/consignee/:consignee/excel", requireAuth, requireStaff, async (req, res) => {
  const companyName = decodeURIComponent(req.params["company"] as string);
  const consigneeName = decodeURIComponent(req.params["consignee"] as string);
  const isUnspecified = consigneeName === "__unspecified__";

  const shipments = await db
    .select()
    .from(shipmentsTable)
    .where(
      isUnspecified
        ? and(
            sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`,
            or(eq(shipmentsTable.consignee, ""), isNull(shipmentsTable.consignee)),
          )
        : and(
            sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`,
            sql`lower(${shipmentsTable.consignee}) = lower(${consigneeName})`,
          ),
    )
    .orderBy(asc(shipmentsTable.ifsRef));

  const template = await getReportTemplate();
  const reportLabel = isUnspecified ? companyName : (shipments[0]?.consignee ?? consigneeName);
  const wb = await generateCompanyReportWorkbook(reportLabel, shipments, template?.buffer ?? null);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Status Report - ${companyName} - ${reportLabel}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ── All-company ZIP download (staff only) ────────────────────────────────────
// Generates one Status Report Excel per company and bundles them into a ZIP.

router.get("/staff/all-reports-zip", requireAuth, requireStaff, async (_req, res) => {
  const companies = await db
    .select({ companyName: sql<string>`min(${shipmentsTable.companyName})` })
    .from(shipmentsTable)
    .groupBy(sql`lower(${shipmentsTable.companyName})`)
    .orderBy(sql`min(${shipmentsTable.companyName})`);

  if (companies.length === 0) {
    res.status(404).json({ error: "No company data found. Upload a tracking master first." });
    return;
  }

  // Load template once (null = fall back to built-in format)
  const template = await getReportTemplate();

  const dateStr = todayString();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="IFS-Status-Reports-${dateStr}.zip"`);

  const arc = new ZipArchive({ zlib: { level: 6 } });
  arc.pipe(res);

  for (const { companyName } of companies) {
    const shipments = await db
      .select()
      .from(shipmentsTable)
      .where(sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`)
      .orderBy(asc(shipmentsTable.ifsRef));

    const wb = await generateCompanyReportWorkbook(companyName, shipments, template?.buffer ?? null);
    const buf = await wb.xlsx.writeBuffer();
    const safeName = companyName.replace(/[/\\?%*:|"<>]/g, "-").trim();
    arc.append(Buffer.from(buf), { name: `Status Report - ${safeName}.xlsx` });
  }

  await arc.finalize();
});

// ── List all users (admin only) ───────────────────────────────────────────────

router.get("/staff/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName, companyName: usersTable.companyName, email: usersTable.email, role: usersTable.role })
    .from(usersTable);
  res.json(users);
});

router.delete("/staff/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number } };
  const id = parseInt(req.params["id"] as string);
  const { password } = req.body as { password?: string };

  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }
  if (!password) { res.status(400).json({ error: "Admin password is required" }); return; }
  if (id === authReq.user.userId) { res.status(400).json({ error: "You cannot delete your own admin account while logged in." }); return; }

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.userId)).limit(1);
  if (!admin || admin.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }

  const validPassword = await bcrypt.compare(password, admin.passwordHash);
  if (!validPassword) { res.status(401).json({ error: "Incorrect admin password" }); return; }

  await db.delete(notificationsTable).where(eq(notificationsTable.userId, id));
  const deleted = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "User not found" }); return; }

  res.status(204).send();
});

router.patch("/staff/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number } };
  const id = parseInt(req.params["id"] as string);
  const { adminPassword, newPassword } = req.body as { adminPassword?: string; newPassword?: string };

  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }
  if (!adminPassword) { res.status(400).json({ error: "Admin password is required" }); return; }
  if (!newPassword || newPassword.length < 6) { res.status(400).json({ error: "New password must be at least 6 characters" }); return; }

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.userId)).limit(1);
  if (!admin || admin.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }

  const validPassword = await bcrypt.compare(adminPassword, admin.passwordHash);
  if (!validPassword) { res.status(401).json({ error: "Incorrect admin password" }); return; }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });

  if (updated.length === 0) { res.status(404).json({ error: "User not found" }); return; }

  res.status(204).send();
});

export default router;

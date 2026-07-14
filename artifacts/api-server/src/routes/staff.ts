import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { ZipArchive } from "archiver";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { db, pool, shipmentsTable, companiesTable, uploadsTable, usersTable, notificationsTable, sessionsTable, pendingSignupsTable } from "@workspace/db";
import { eq, asc, desc, and, or, isNull, ilike, sql } from "drizzle-orm";
import { requireAuth, requireStaff, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendPushToPendingSignup, sendPushToUser, transferPendingPushSubscriptionsToUser } from "../lib/push";

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
const asycudaUpload = multer({ storage: templateStorage, limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

function safeDownloadName(value: string): string {
  return value.replace(/[\/\\?%*:|"<>]/g, "-").trim() || "download.xlsx";
}

function contentDispositionFilename(filename: string): string {
  return `attachment; filename="${safeDownloadName(filename).replace(/"/g, "")}"`;
}

function appendDateToFilename(filename: string, date: Date | string): string {
  const stamp = new Date(date).toISOString().slice(0, 10);
  const safe = safeDownloadName(filename);
  const dot = safe.lastIndexOf(".");
  if (dot <= 0) return `${safe}-${stamp}`;
  return `${safe.slice(0, dot)}-${stamp}${safe.slice(dot)}`;
}

function normalizeUploadFamily(filename: string): string {
  const safe = safeDownloadName(filename).toLowerCase();
  const withoutExtension = safe.replace(/\.[^.]+$/, "");
  const compact = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (compact.includes("tracking master")) return "tracking master";

  return compact
    .replace(/\b\d{1,2}[./ -]\d{1,2}[./ -]\d{2,4}\b/g, "")
    .replace(/\b\d{4}[./ -]\d{1,2}[./ -]\d{1,2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function saveOriginalUploadFile(uploadId: number, file: Express.Multer.File): Promise<void> {
  const fileData = await fs.promises.readFile(file.path);
  await pool.query(
    "UPDATE uploads SET file_data = $1, mime_type = $2, file_size = $3 WHERE id = $4",
    [fileData, file.mimetype || "application/octet-stream", file.size ?? fileData.length, uploadId],
  );
}

type ChangeLogEntry = { field: string; oldValue: string; newValue: string };

async function recordShipmentChangeLog(args: {
  shipmentId?: number;
  uploadBatchId?: number;
  changeType: "new" | "updated";
  ifsRef: string;
  companyName: string;
  status?: string;
  changes: ChangeLogEntry[];
}): Promise<void> {
  if (!args.uploadBatchId) return;
  await pool.query(
    `INSERT INTO shipment_change_logs
      (shipment_id, upload_batch_id, change_type, ifs_ref, company_name, status, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      args.shipmentId ?? null,
      args.uploadBatchId,
      args.changeType,
      args.ifsRef,
      args.companyName,
      args.status ?? null,
      JSON.stringify(args.changes),
    ],
  );
}

function displayText(value: unknown): string {
  if (value === undefined || value === null || String(value).trim() === "") return "N/A";
  return String(value).trim();
}

const asycudaAliasPairs = [
  ["Petroda", "Namadzi"],
  ["Amin", "Office Zone"],
  ["Easy Pack", "Easypark"],
  ["Mothers Food", "Mothers Foods"],
  ["Mkango Allied", "Mkango Allied Industries"],
  ["Kris Offset", "Kris Offset and Screen Printers"],
  ["Imran", "DIK"],
  ["Chikondi", "Easy Pack"],
  ["AD Consult", "Easy Pack"],
  ["Osman", "Interglobe"],
  ["Sukhera", "Super Criss Cross"],
  ["Ibrahim Patel", "Medicure"],
  ["Mtisunge Mipando", "Barons Car Hire"],
  ["Aniz", "Auto"],
  ["Zainulabedin", "Crown"],
  ["Shaesta", "KNO"],
  ["Mahomed Patel", "Agri"],
  ["Naeem", "Gabs"],
] as const;

const asycudaStopWords = new Set([
  "LIMITED", "LTD", "PTY", "LLC", "INC", "THE", "AND", "OF", "PO", "BOX", "PRIVATE",
  "COMPANY", "CO", "MR", "MS", "MRS", "MALAWI", "BLANTYRE", "LILONGWE", "LIMBE",
  "SOUTH", "AFRICA", "TRADING", "INDUSTRIES", "INDUSTRY", "INVESTMENTS", "INVESTMENT",
  "GROUP", "INTERNATIONAL", "CORPORATION", "CORP", "ENTERPRISE", "ENTERPRISES",
] as const);

function asycudaValueString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asycudaNormalizeKey(value: unknown): string {
  return asycudaValueString(value).replace(/\s+/g, "").toUpperCase();
}

function asycudaNormalizeWords(value: unknown): string {
  return asycudaValueString(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function asycudaCanonicalToken(token: string): string {
  if (token === "MOTHERS") return "MOTHER";
  if (token === "FOODS") return "FOOD";
  return token.length > 4 && token.endsWith("S") && !token.endsWith("SS") ? token.slice(0, -1) : token;
}

function asycudaCompactName(value: unknown): string {
  let text = asycudaNormalizeWords(value);
  const canonical: Array<[RegExp, string]> = [
    [/\bMOTHERS? FOODS?\b/g, "MOTHERSFOOD"],
    [/\bMKANGO ALLIED(?: INDUSTRIES)?\b/g, "MKANGOALLIED"],
    [/\bKRIS OFFSET(?: AND SCREEN PRINTERS)?\b/g, "KRISOFFSET"],
    [/\bPETRODA\b/g, "NAMADZI"],
    [/\bAMIN\b/g, "OFFICEZONE"],
    [/\bOFFICE ZONE\b/g, "OFFICEZONE"],
    [/\bEASY ?PARK\b/g, "EASYPACK"],
    [/\bEASY PACK\b/g, "EASYPACK"],
  ];
  canonical.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text.replace(/[^A-Z0-9]/g, "");
}

function asycudaNameTokens(value: unknown): string[] {
  return [...new Set(
    asycudaNormalizeWords(value)
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length >= 3 && !asycudaStopWords.has(token))
      .map(asycudaCanonicalToken),
  )];
}

function asycudaLevenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function asycudaSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const distance = asycudaLevenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length, 1);
}

function asycudaPairedMatch(aText: unknown, bText: unknown, left: string, right: string): boolean {
  const a = ` ${asycudaNormalizeWords(aText)} `;
  const b = ` ${asycudaNormalizeWords(bText)} `;
  const l = asycudaNormalizeWords(left);
  const r = asycudaNormalizeWords(right);
  return (a.includes(` ${l} `) && b.includes(` ${r} `)) || (a.includes(` ${r} `) && b.includes(` ${l} `));
}

function asycudaNamesMatch(party: unknown, client: unknown): boolean {
  if (!asycudaValueString(party) || !asycudaValueString(client)) return false;
  if (asycudaAliasPairs.some(([a, b]) => asycudaPairedMatch(party, client, a, b))) return true;
  const compactParty = asycudaCompactName(party);
  const compactClient = asycudaCompactName(client);
  if (
    Math.min(compactParty.length, compactClient.length) >= 4 &&
    (compactParty.includes(compactClient) || compactClient.includes(compactParty))
  ) return true;
  const partyTokens = asycudaNameTokens(party);
  const clientTokens = asycudaNameTokens(client);
  if (partyTokens.some((token) => clientTokens.includes(token))) return true;
  if (!partyTokens.length || !clientTokens.length) return false;
  const average = clientTokens.reduce((sum, clientToken) => {
    const best = Math.max(...partyTokens.map((partyToken) => asycudaSimilarity(clientToken, partyToken)));
    return sum + best;
  }, 0) / clientTokens.length;
  return average >= 0.9;
}

function asycudaFindHeaderRow(rows: unknown[][], required: string[]): number {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const values = rows[r]?.map(asycudaValueString) ?? [];
    if (required.every((heading) => values.includes(heading))) return r;
  }
  return -1;
}

type AsycudaMasterEntry = { client: string; invoice: unknown; order: number };

function asycudaSetGreenCell(cell: ExcelJS.Cell, value: unknown) {
  const normalizedValue = typeof value === "number" ? value : asycudaValueString(value);
  const baseStyle = {
    ...(cell.style ?? {}),
  };

  // Some ASYCUDA templates use shared-formula clone cells. Replacing the cell
  // model with a plain value cell avoids ExcelJS throwing when we overwrite
  // those clones directly.
  (cell as ExcelJS.Cell & { model: Record<string, unknown> }).model = {
    address: cell.address,
    style: baseStyle,
    type: typeof normalizedValue === "number" ? ExcelJS.ValueType.Number : ExcelJS.ValueType.String,
    value: normalizedValue,
  };

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF00B050" },
    bgColor: { argb: "FF00B050" },
  };
}

async function buildAsycudaMasterIndex(workbook: ExcelJS.Workbook): Promise<Map<string, AsycudaMasterEntry[]>> {
  const sheet = workbook.worksheets.find((ws) => ws.name.toLowerCase() === "list") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("The master workbook has no worksheets.");
  const rows = sheet.getSheetValues().slice(1) as unknown[][];
  const headerRow = asycudaFindHeaderRow(rows, ["Client", "IFS Inv No.", "MRA Ref"]);
  if (headerRow < 0) throw new Error("Could not find Client, IFS Inv No. and MRA Ref headers in the master workbook.");
  const header = (rows[headerRow] ?? []).map(asycudaValueString);
  const clientCol = header.indexOf("Client");
  const invoiceCol = header.indexOf("IFS Inv No.");
  const refCol = header.indexOf("MRA Ref");
  const index = new Map<string, AsycudaMasterEntry[]>();
  rows.slice(headerRow + 1).forEach((row, offset) => {
    const rawRefs = asycudaValueString(row?.[refCol]);
    const invoice = row?.[invoiceCol];
    if (!rawRefs || asycudaValueString(invoice) === "") return;
    const entry = { client: asycudaValueString(row?.[clientCol]), invoice, order: headerRow + 1 + offset };
    [...new Set(rawRefs.split(/[,;\r\n]+/).map(asycudaNormalizeKey).filter(Boolean))].forEach((key) => {
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(entry);
    });
  });
  return index;
}

async function processAsycudaWorkbook(
  asycudaWb: ExcelJS.Workbook,
  masterIndex: Map<string, AsycudaMasterEntry[]>,
  filterBlanks: boolean,
) {
  const summary = { charges: 0, freight: 0, sheets: 0, remaining: 0, missing: 0, mismatch: 0, ambiguous: 0 };
  for (const sheet of asycudaWb.worksheets) {
    const rows = sheet.getSheetValues().slice(1) as unknown[][];
    const headerRow = asycudaFindHeaderRow(rows, ["Shipper", "Consignee", "IFS Inv L/Chgs", "IFS Inv Freight"]);
    if (headerRow < 0) continue;
    const header = (rows[headerRow] ?? []).map(asycudaValueString);
    const shipCol = header.indexOf("Shipper");
    const consCol = header.indexOf("Consignee");
    const chargeCol = header.indexOf("IFS Inv L/Chgs");
    const freightCol = header.indexOf("IFS Inv Freight");
    const typeCol = shipCol - 6;
    const numberCol = typeCol + 1;
    summary.sheets++;

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const chargeBlank = asycudaValueString(row[chargeCol]) === "";
      const freightBlank = asycudaValueString(row[freightCol]) === "";
      if (!chargeBlank && !freightBlank) continue;
      const type = asycudaValueString(row[typeCol]).toUpperCase();
      const number = asycudaValueString(row[numberCol]);
      if (!["C", "E", "S"].includes(type) || !number) continue;
      const key = asycudaNormalizeKey(type + number);
      const entries = masterIndex.get(key) ?? [];
      if (!entries.length) {
        summary.missing++;
        continue;
      }
      const party = asycudaValueString(row[type === "E" ? shipCol : consCol]);
      const matches = entries.filter((entry) => asycudaNamesMatch(party, entry.client));
      if (!matches.length) {
        summary.mismatch++;
        continue;
      }
      if (matches.length > 2) {
        summary.ambiguous++;
        continue;
      }
      const excelRow = sheet.getRow(r + 1);
      if (chargeBlank) {
        asycudaSetGreenCell(excelRow.getCell(chargeCol + 1), matches[0]!.invoice);
        summary.charges++;
      }
      if (matches.length >= 2 && freightBlank) {
        asycudaSetGreenCell(excelRow.getCell(freightCol + 1), matches[1]!.invoice);
        summary.freight++;
      }
    }

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const chargeBlank = asycudaValueString(row[chargeCol]) === "";
      if (chargeBlank) summary.remaining++;
      sheet.getRow(r + 1).hidden = filterBlanks ? !chargeBlank : false;
    }
    if (filterBlanks && sheet.dimensions) {
      sheet.autoFilter = {
        from: { row: sheet.dimensions.top, column: sheet.dimensions.left },
        to: { row: sheet.dimensions.bottom, column: sheet.dimensions.right },
      };
    } else {
      sheet.autoFilter = undefined;
    }
  }
  return summary;
}

function smartChangeValues(oldValue: unknown, newValue: unknown): { oldValue: string; newValue: string } {
  const oldText = displayText(oldValue);
  const newText = displayText(newValue);
  if (oldText === "N/A" || newText === "N/A") return { oldValue: oldText, newValue: newText };

  const oldParts = oldText.split(/\s+/);
  const newParts = newText.split(/\s+/);
  let prefixLength = 0;
  while (
    prefixLength < oldParts.length - 1 &&
    prefixLength < newParts.length - 1 &&
    oldParts[prefixLength].toLowerCase() === newParts[prefixLength].toLowerCase()
  ) {
    prefixLength += 1;
  }

  if (prefixLength >= 2) {
    return {
      oldValue: oldParts.slice(0, prefixLength + 1).join(" "),
      newValue: newParts.slice(prefixLength).join(" "),
    };
  }

  return { oldValue: oldText, newValue: newText };
}

function pushTextChange(changes: ChangeLogEntry[], field: string, oldValue: unknown, newValue: unknown): void {
  if (!sameText(oldValue as string | null | undefined, newValue as string | null | undefined)) {
    changes.push({ field, ...smartChangeValues(oldValue, newValue) });
  }
}

function isIgnoredShipmentStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("completed")) return true;
  if (normalized.includes("offloaded")) return true;
  if (normalized === "mt") return true;
  if (normalized.startsWith("mt ")) return true;
  if (normalized.includes("mt turn")) return true;
  return false;
}

function isCompletedSection(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase().includes("completed");
}

const activeShipmentSql = sql`NOT (
  lower(${shipmentsTable.status}) LIKE '%completed%'
  OR lower(coalesce(${shipmentsTable.extraFields}->>'Source Section', '')) LIKE '%completed%'
  OR lower(coalesce(${shipmentsTable.extraFields}->>'sourceSection', '')) LIKE '%completed%'
  OR lower(coalesce(${shipmentsTable.extraFields}->>'Section', '')) LIKE '%completed%'
  OR lower(${shipmentsTable.status}) LIKE '%offloaded%'
  OR lower(trim(${shipmentsTable.status})) = 'mt'
  OR lower(${shipmentsTable.status}) LIKE 'mt %'
  OR lower(${shipmentsTable.status}) LIKE '%mt turn%'
)`;

async function pruneCompletedShipments(): Promise<number> {
  await pool.query(`
    DELETE FROM shipment_change_logs
    WHERE lower(coalesce(status, '')) LIKE '%completed%'
       OR lower(coalesce(changes::text, '')) LIKE '%completed%'
       OR shipment_id IN (
        SELECT id FROM shipments
        WHERE lower(status) LIKE '%completed%'
           OR lower(coalesce(extra_fields->>'Source Section', '')) LIKE '%completed%'
           OR lower(coalesce(extra_fields->>'sourceSection', '')) LIKE '%completed%'
           OR lower(coalesce(extra_fields->>'Section', '')) LIKE '%completed%'
      )
  `);

  const result = await pool.query(`
    DELETE FROM shipments
    WHERE lower(status) LIKE '%completed%'
       OR lower(coalesce(extra_fields->>'Source Section', '')) LIKE '%completed%'
       OR lower(coalesce(extra_fields->>'sourceSection', '')) LIKE '%completed%'
       OR lower(coalesce(extra_fields->>'Section', '')) LIKE '%completed%'
  `);
  return result.rowCount ?? 0;
}

async function pruneShipmentsNotInUpload(uploadBatchId: number): Promise<number> {
  await pool.query(
    `DELETE FROM shipment_change_logs
     WHERE shipment_id IN (
      SELECT id FROM shipments
      WHERE upload_batch_id IS DISTINCT FROM $1
     )`,
    [uploadBatchId],
  );

  const result = await pool.query(
    "DELETE FROM shipments WHERE upload_batch_id IS DISTINCT FROM $1",
    [uploadBatchId],
  );
  await pool.query(`
    DELETE FROM companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM shipments s WHERE lower(s.company_name) = lower(c.company_name)
    )
  `);
  return result.rowCount ?? 0;
}

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

function matchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function matchContainer(value: unknown): string {
  return matchText(value).replace(/[^a-z0-9]/g, "");
}

function recordBlManifest(record: { extraFields?: Record<string, unknown> }): string {
  return matchContainer(
    record.extraFields?.["BL / Manifest No."] ??
    record.extraFields?.["BL/Manifest No."] ??
    record.extraFields?.["BL"] ??
    record.extraFields?.["bl"],
  );
}

function shipmentBlManifest(shipment: { extraFields?: unknown }): string {
  const extra = (shipment.extraFields as Record<string, unknown>) ?? {};
  return matchContainer(
    extra["BL / Manifest No."] ??
    extra["BL/Manifest No."] ??
    extra["BL"] ??
    extra["bl"],
  );
}

function shipmentIdentifier(record: {
  ifsRef?: string;
  containerNo?: string | null;
  extraFields?: Record<string, unknown> | unknown;
}): string {
  const extra = (record.extraFields as Record<string, unknown>) ?? {};
  return displayText(
    extra["BL / Manifest No."] ??
    extra["BL/Manifest No."] ??
    extra["BL"] ??
    record.containerNo ??
    record.ifsRef,
  );
}

async function notifyCustomersOfStatusChange(args: {
  companyName: string;
  consignee?: string;
  ifsRef: string;
  containerNo?: string | null;
  extraFields?: Record<string, unknown>;
  change: ChangeLogEntry;
}): Promise<void> {
  const companyKey = matchText(args.companyName);
  const consigneeKey = matchText(args.consignee);
  const customers = (await db
    .select({ id: usersTable.id, companyName: usersTable.companyName, role: usersTable.role })
    .from(usersTable))
    .filter((user) => user.role === "customer")
    .filter((user) => {
      const userKey = matchText(user.companyName);
      return Boolean(userKey && (userKey === companyKey || (consigneeKey && userKey === consigneeKey)));
    });

  for (const { id: userId } of customers) {
    await db.insert(notificationsTable).values({
      userId,
      title: "InterFreight Alert: Status Changed",
      message: `${shipmentIdentifier(args)} status changed: ${args.change.oldValue} -> ${args.change.newValue}. Tap to view your dashboard.`,
      ifsRef: args.ifsRef,
      companyName: args.companyName,
      status: args.change.newValue,
    });
    await sendPushToUser(userId, {
      title: "InterFreight Alert: Status Changed",
      body: `${shipmentIdentifier(args)} is now ${args.change.newValue}. Tap to view.`,
      url: "/dashboard",
      tag: `shipment-${args.ifsRef}-${Date.now()}`,
    });
  }
}

async function notifyCustomersOfNewShipment(args: {
  companyName: string;
  consignee?: string;
  ifsRef: string;
  containerNo?: string | null;
  cargoDescription?: string;
  status: string;
  extraFields?: Record<string, unknown>;
}): Promise<void> {
  const companyKey = matchText(args.companyName);
  const consigneeKey = matchText(args.consignee);
  const customers = (await db
    .select({ id: usersTable.id, companyName: usersTable.companyName, role: usersTable.role })
    .from(usersTable))
    .filter((user) => user.role === "customer")
    .filter((user) => {
      const userKey = matchText(user.companyName);
      return Boolean(userKey && (userKey === companyKey || (consigneeKey && userKey === consigneeKey)));
    });

  for (const { id: userId } of customers) {
    await db.insert(notificationsTable).values({
      userId,
      title: "InterFreight Alert: New Shipment",
      message: `${shipmentIdentifier(args)} was added to your dashboard with status ${displayText(args.status)}.`,
      ifsRef: args.ifsRef,
      companyName: args.companyName,
      status: args.status,
    });
    await sendPushToUser(userId, {
      title: "InterFreight Alert: New Shipment",
      body: `${shipmentIdentifier(args)} was added to your dashboard. Tap to view.`,
      url: "/dashboard",
      tag: `shipment-new-${args.ifsRef}-${Date.now()}`,
    });
  }
}

async function pruneUploadHistoryForFilename(filename: string): Promise<void> {
  const targetFamily = normalizeUploadFamily(filename);
  const allNamedUploads = await db
    .select({ id: uploadsTable.id, filename: uploadsTable.filename })
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.uploadedAt));

  const sameFamilyUploads = allNamedUploads.filter((upload) => normalizeUploadFamily(upload.filename) === targetFamily);
  const oldUploadIds = sameFamilyUploads.slice(2).map((upload) => upload.id);
  for (const id of oldUploadIds) {
    await pool.query("DELETE FROM shipment_change_logs WHERE upload_batch_id = $1", [id]);
    await db.delete(uploadsTable).where(eq(uploadsTable.id, id));
  }

  const allUploads = await db
    .select({ id: uploadsTable.id })
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.uploadedAt));
  const olderUploadIds = allUploads.slice(10).map((upload) => upload.id);
  for (const id of olderUploadIds) {
    await pool.query("DELETE FROM shipment_change_logs WHERE upload_batch_id = $1", [id]);
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
  const ignoredRecord = isIgnoredShipmentStatus(record.status);
  const exactWhereClause = (record.matchByContainer && record.containerNo)
    ? and(eq(shipmentsTable.ifsRef, record.ifsRef), eq(shipmentsTable.containerNo, record.containerNo))
    : eq(shipmentsTable.ifsRef, record.ifsRef);

  let existing = await db
    .select()
    .from(shipmentsTable)
    .where(exactWhereClause)
    .limit(1);

  if (existing.length === 0) {
    const candidates = await db
      .select()
      .from(shipmentsTable)
      .where(sql`lower(${shipmentsTable.companyName}) = lower(${record.companyName}) OR lower(${shipmentsTable.consignee}) = lower(${record.consignee ?? ""})`)
      .limit(250);

    const incoming = {
      ifsRef: matchText(record.ifsRef),
      containerNo: matchContainer(record.containerNo),
      mraRef: matchContainer(record.mraRef),
      invoiceNo: matchContainer(record.invoiceNo),
      consignee: matchText(record.consignee ?? record.companyName),
      shipper: matchText(record.shipper),
      blManifest: recordBlManifest(record),
    };

    const matched = candidates.find((candidate) => {
      const candidateValues = {
        ifsRef: matchText(candidate.ifsRef),
        containerNo: matchContainer(candidate.containerNo),
        mraRef: matchContainer(candidate.mraRef),
        invoiceNo: matchContainer(candidate.invoiceNo),
        consignee: matchText(candidate.consignee ?? candidate.companyName),
        shipper: matchText(candidate.shipper),
        blManifest: shipmentBlManifest(candidate),
      };

      if (incoming.mraRef && candidateValues.mraRef && incoming.mraRef === candidateValues.mraRef) return true;
      if (incoming.blManifest && candidateValues.blManifest && incoming.blManifest === candidateValues.blManifest) {
        return (
          (incoming.containerNo && candidateValues.containerNo && incoming.containerNo === candidateValues.containerNo) ||
          (incoming.invoiceNo && candidateValues.invoiceNo && incoming.invoiceNo === candidateValues.invoiceNo) ||
          (!incoming.containerNo && !candidateValues.containerNo && incoming.consignee === candidateValues.consignee)
        );
      }
      if (incoming.invoiceNo && candidateValues.invoiceNo && incoming.invoiceNo === candidateValues.invoiceNo) {
        return incoming.consignee === candidateValues.consignee || incoming.shipper === candidateValues.shipper;
      }
      if (incoming.ifsRef && candidateValues.ifsRef && incoming.ifsRef === candidateValues.ifsRef) {
        return !incoming.containerNo || !candidateValues.containerNo || incoming.containerNo === candidateValues.containerNo || incoming.invoiceNo === candidateValues.invoiceNo;
      }
      return false;
    });

    if (matched) existing = [matched];
  }

  if (existing.length > 0) {
    const current = existing[0];
    if (ignoredRecord) {
      await db.delete(shipmentsTable).where(eq(shipmentsTable.id, existing[0].id));
      return "updated";
    }
    const extraFieldsChanged = record.extraFields !== undefined
      ? stableJson(current.extraFields) !== stableJson(record.extraFields)
      : false;
    const changes: ChangeLogEntry[] = [];
    pushTextChange(changes, "Status", current.status, record.status);
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

    if (!hasChanges) {
      if (record.uploadBatchId !== undefined && current.uploadBatchId !== record.uploadBatchId) {
        await db.update(shipmentsTable).set({ uploadBatchId: record.uploadBatchId }).where(eq(shipmentsTable.id, existing[0].id));
      }
      return "unchanged";
    }

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
    if (changes.length > 0) {
      const statusChange = changes[0];
      if (!statusChange) return "updated";
      await recordShipmentChangeLog({
        shipmentId: existing[0].id,
        uploadBatchId: record.uploadBatchId,
        changeType: "updated",
        ifsRef: record.ifsRef,
        companyName: record.companyName,
        status: record.status,
        changes,
      });
      try {
        await notifyCustomersOfStatusChange({
          companyName: record.companyName,
          consignee: record.consignee,
          ifsRef: record.ifsRef,
          containerNo: record.containerNo,
          extraFields: record.extraFields,
          change: statusChange,
        });
      } catch (notifErr) {
        logger.warn({ notifErr, ifsRef: record.ifsRef }, "Failed to create status-change notification");
      }
    }
    return "updated";
  }

  if (ignoredRecord) return "unchanged";

  const [inserted] = await db.insert(shipmentsTable).values(record).returning({ id: shipmentsTable.id });
  await recordShipmentChangeLog({
    shipmentId: inserted?.id,
    uploadBatchId: record.uploadBatchId,
    changeType: "new",
    ifsRef: record.ifsRef,
    companyName: record.companyName,
    status: record.status,
    changes: [
      { field: "Status", oldValue: "N/A", newValue: displayText(record.status) },
      { field: "Consignee", oldValue: "N/A", newValue: displayText(record.consignee ?? record.companyName) },
      { field: "Cargo Description", oldValue: "N/A", newValue: displayText(record.cargoDescription) },
    ],
  });
  try {
    await notifyCustomersOfNewShipment({
      companyName: record.companyName,
      consignee: record.consignee,
      ifsRef: record.ifsRef,
      containerNo: record.containerNo,
      cargoDescription: record.cargoDescription,
      status: record.status,
      extraFields: record.extraFields,
    });
  } catch (notifErr) {
    logger.warn({ notifErr, ifsRef: record.ifsRef }, "Failed to create new-shipment notification");
  }
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
  defaultSection?: string | null,
): Promise<{
  totalRows: number; newRecords: number; updatedRecords: number;
  failedRows: number; failureReasons: string[]; consignees: string[];
}> {
  let newRecords = 0, updatedRecords = 0, failedRows = 0, totalRows = 0;
  const failureReasons: string[] = [];
  let colOffset: number | null = null;
  const consigneeSet = new Set<string>();
  let currentSection: string | null = defaultSection ?? null;

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
    if (isCompletedSection(currentSection) || isCompletedSection(defaultSection)) continue;

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

  await pruneCompletedShipments();

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
    await saveOriginalUploadFile(uploadRecord.id, file);

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

  if (workbook.worksheets.length === 0) { res.status(400).json({ error: "No worksheet found in file" }); return; }

  await pruneCompletedShipments();

  const [uploadRecord] = await db.insert(uploadsTable).values({
    filename: file.originalname,
    totalRows: 0,
    newRecords: 0,
    updatedRecords: 0,
    uploadedBy: authReq.user.email,
  }).returning();
  await saveOriginalUploadFile(uploadRecord.id, file);

  const result = {
    totalRows: 0,
    newRecords: 0,
    updatedRecords: 0,
    failedRows: 0,
    failureReasons: [] as string[],
    consignees: [] as string[],
  };
  const consigneeSet = new Set<string>();

  const activeWorksheets = workbook.worksheets.filter((sheet) => !/completed/i.test(sheet.name));
  if (activeWorksheets.length === 0) {
    res.status(400).json({ error: "No active worksheet found. Shipments completed sheets are ignored." });
    return;
  }

  for (const sheet of activeWorksheets) {
    const sheetResult = await parseMasterWorksheet(sheet, uploadRecord.id, sheet.name);
    result.totalRows += sheetResult.totalRows;
    result.newRecords += sheetResult.newRecords;
    result.updatedRecords += sheetResult.updatedRecords;
    result.failedRows += sheetResult.failedRows;
    sheetResult.failureReasons.forEach((reason) => result.failureReasons.push(`[${sheet.name}] ${reason}`));
    sheetResult.consignees.forEach((name) => consigneeSet.add(name));
  }
  result.consignees = [...consigneeSet].sort();
  const removedStaleRows = await pruneShipmentsNotInUpload(uploadRecord.id);

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
    message: `Tracking master processed: ${result.totalRows} rows, ${result.consignees.length} companies (${result.newRecords} new, ${result.updatedRecords} updated, ${removedStaleRows} closed/old removed${result.failedRows > 0 ? `, ${result.failedRows} failed` : ""})`,
  });
});

// ── List uploads (staff only) ─────────────────────────────────────────────────

router.get("/staff/uploads", requireAuth, requireStaff, async (_req, res) => {
  const uploads = await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt));
  res.json(uploads);
});

router.get("/staff/uploads/:id/download", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid upload id" });
    return;
  }

  const result = await pool.query<{
    filename: string;
    file_data: Buffer | null;
    mime_type: string | null;
    uploaded_at: Date;
  }>("SELECT filename, file_data, mime_type, uploaded_at FROM uploads WHERE id = $1 LIMIT 1", [id]);
  const uploadRecord = result.rows[0];
  if (!uploadRecord) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  if (!uploadRecord.file_data) {
    const candidates = await fs.promises.readdir(uploadsDir).catch(() => []);
    const storedName = candidates
      .filter((name) => name.endsWith(`-${uploadRecord.filename}`))
      .sort()
      .at(-1);

    if (!storedName) {
      res.status(404).json({ error: "Original uploaded file is not available. Please re-upload the tracking master once, then it can be downloaded here." });
      return;
    }

    const fallbackPath = path.resolve(uploadsDir, storedName);
    const fallbackData = await fs.promises.readFile(fallbackPath).catch(() => null);
    if (!fallbackData) {
      res.status(404).json({ error: "Original uploaded file is not available. Please re-upload the tracking master once, then it can be downloaded here." });
      return;
    }

    res.setHeader("Content-Type", uploadRecord.mime_type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", contentDispositionFilename(appendDateToFilename(uploadRecord.filename, uploadRecord.uploaded_at)));
    res.setHeader("Content-Length", String(fallbackData.length));
    res.end(fallbackData);
    return;
  }

  res.setHeader("Content-Type", uploadRecord.mime_type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", contentDispositionFilename(appendDateToFilename(uploadRecord.filename, uploadRecord.uploaded_at)));
  res.setHeader("Content-Length", String(uploadRecord.file_data.length));
  res.end(uploadRecord.file_data);
});

// ── Delete ALL uploads + all shipments (staff only) ──────────────────────────

router.delete("/staff/uploads", requireAuth, requireStaff, async (_req, res) => {
  await pool.query("DELETE FROM shipment_change_logs");
  await db.delete(shipmentsTable);
  await db.delete(uploadsTable);
  await db.delete(companiesTable);
  res.status(204).send();
});

// ── Delete upload + its shipments (staff only) ────────────────────────────────

router.delete("/staff/uploads/:id", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await pool.query("DELETE FROM shipment_change_logs WHERE upload_batch_id = $1", [id]);
  await db.delete(shipmentsTable).where(eq(shipmentsTable.uploadBatchId, id));
  await db.delete(uploadsTable).where(eq(uploadsTable.id, id));
  res.status(204).send();
});

// ── Report template upload / status ─────────────────────────────────────────

async function getReportTemplate(): Promise<{ buffer: Buffer; uploadedAt?: string } | null> {
  if (fs.existsSync(TEMPLATE_PATH)) {
    const stat = fs.statSync(TEMPLATE_PATH);
    return { buffer: fs.readFileSync(TEMPLATE_PATH), uploadedAt: stat.mtime.toISOString() };
  }
  const result = await pool.query<{ content: Buffer; uploaded_at: Date }>(
    "SELECT content, uploaded_at FROM report_templates WHERE id = 1",
  );
  if (result.rows[0]) {
    return { buffer: result.rows[0].content, uploadedAt: result.rows[0].uploaded_at.toISOString() };
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

router.post(
  "/staff/asycuda/process",
  requireAuth,
  requireAdmin,
  asycudaUpload.fields([
    { name: "asycudaFile", maxCount: 1 },
    { name: "masterFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const asycudaFile = files?.asycudaFile?.[0];
      const masterFile = files?.masterFile?.[0];
      if (!asycudaFile || !masterFile) {
        return res.status(400).json({ error: "Both ASYCUDA and Master Invoicing files are required." });
      }

      const filterBlanks = String(req.body?.filterBlanks ?? "false") === "true";
      const asycudaWb = new ExcelJS.Workbook();
      const masterWb = new ExcelJS.Workbook();
      await asycudaWb.xlsx.load(asycudaFile.buffer);
      await masterWb.xlsx.load(masterFile.buffer);

      const masterIndex = await buildAsycudaMasterIndex(masterWb);
      const summary = await processAsycudaWorkbook(asycudaWb, masterIndex, filterBlanks);
      const output = Buffer.from(await asycudaWb.xlsx.writeBuffer());
      const outputName = `${safeDownloadName(asycudaFile.originalname).replace(/\.(xlsx?|xls)$/i, "")} - matched.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", contentDispositionFilename(outputName));
      res.setHeader("X-Asycuda-Summary", encodeURIComponent(JSON.stringify(summary)));
      res.setHeader("Content-Length", String(output.length));
      res.end(output);
    } catch (error: any) {
      logger.error({ err: error }, "ASYCUDA processing failed");
      res.status(500).json({ error: error?.message || "ASYCUDA processing failed." });
    }
  },
);

// ── Excel report generation helper ───────────────────────────────────────────

const REPORT_KEYS = [
  "ifsRef", "type", "blNo", "containerNo", "shipper", "consignee", "cargoDescription",
  "invoiceNo", "pod", "finalPortDestination", "agent", "mraRef", "entry", "status",
] as const;

const REPORT_WIDTHS: Record<string, { min: number; max: number; wrap?: boolean }> = {
  ifsRef: { min: 10, max: 80 },
  type: { min: 6, max: 16 },
  blNo: { min: 8, max: 40 },
  containerNo: { min: 8, max: 32 },
  shipper: { min: 8, max: 40, wrap: true },
  consignee: { min: 8, max: 40, wrap: true },
  cargoDescription: { min: 10, max: 52, wrap: true },
  invoiceNo: { min: 8, max: 24 },
  pod: { min: 6, max: 18 },
  finalPortDestination: { min: 6, max: 24 },
  agent: { min: 8, max: 28, wrap: true },
  mraRef: { min: 8, max: 30 },
  entry: { min: 8, max: 24 },
  status: { min: 8, max: 36, wrap: true },
};

const SAMPLE_TEMPLATE_BASE_WIDTHS: Record<number, number> = {
  2: 22.14, // B 160px
  3: 6.71,  // C 52px
  4: 20.71, // D 150px
  5: 22.86, // E 165px
  6: 27.86, // F 200px
  7: 27.86, // G 200px
  8: 27.86, // H 200px
  9: 23.57, // I 170px
  10: 7.86, // J 60px
  11: 7.86, // K 60px
  12: 13.57, // L 100px
  13: 13.57, // M 100px
  14: 12.14, // N 90px
  15: 27.86, // O 200px
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

// Auto-fit report columns by content.
function autoFitWorksheet(ws: ExcelJS.Worksheet): void {
  const maxLen: Record<number, number> = {};
  const columnKeys: Record<number, typeof REPORT_KEYS[number]> = {};

  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
      const headerKey = reportKeyFromHeader(cellStr(cell.value) ?? "");
      if (headerKey) columnKeys[colIdx] = headerKey;
      const len = cellTextLength(cell.value);
      maxLen[colIdx] = Math.max(maxLen[colIdx] ?? 0, len);
    });
  });

  const mappedColumnIndexes = Object.keys(columnKeys).map((key) => Number(key)).filter((value) => Number.isFinite(value));
  const firstDataColumn = mappedColumnIndexes.length > 0 ? Math.min(...mappedColumnIndexes) : 3;

  const usedColumnIndexes = new Set<number>([
    ...Object.keys(maxLen).map((key) => Number(key)),
    ...Object.keys(columnKeys).map((key) => Number(key)),
    1,
  ]);

  for (const colIdx of [...usedColumnIndexes].sort((a, b) => a - b)) {
    const col = ws.getColumn(colIdx);
    if (colIdx < firstDataColumn) {
      col.width = 3;
      continue;
    }

    const key = columnKeys[colIdx];
    if (key) {
      const limits = REPORT_WIDTHS[key];
      const best = maxLen[colIdx] ?? 0;
      const padding = key === "ifsRef" ? 6 : 2;
      const computedWidth = Math.min(Math.max(best + padding, limits.min), limits.max);
      col.width = computedWidth;
      continue;
    }

    const best = maxLen[colIdx] ?? 0;
    const computedWidth = best > 0 ? Math.min(Math.max(best + 2, 8), 24) : 0;
    if (computedWidth > 0) col.width = computedWidth;
  }

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
  { label: "SHIPMENTS AT POD",     statuses: ["At Port", "Offloading"] },
  { label: "SHIPMENTS ON SEA",     statuses: ["Delayed", "On Sea", "At Sea"] },
];

function extraVal(extra: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = extra[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function shipmentDateSortKey(value: string): number | null {
  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const wordDate = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]+)\b/);
  if (wordDate?.[1] && wordDate[2]) {
    const month = monthNames[wordDate[2].toLowerCase()];
    if (month !== undefined) return month * 100 + Number(wordDate[1]);
  }
  const monthFirstDate = value.match(/\b([A-Za-z]+)[\s-]+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthFirstDate?.[1] && monthFirstDate[2]) {
    const month = monthNames[monthFirstDate[1].toLowerCase()];
    if (month !== undefined) return month * 100 + Number(monthFirstDate[2]);
  }
  const slashDate = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/);
  if (slashDate?.[1] && slashDate[2]) {
    return Number(slashDate[2]) * 100 + Number(slashDate[1]);
  }
  return null;
}

function shipmentSortText(shipment: {
  status: string;
  pod?: string | null;
  finalPortDestination?: string | null;
  cargoDescription?: string | null;
  extraFields?: unknown;
}): string {
  const extra = (shipment.extraFields as Record<string, unknown>) ?? {};
  return [
    shipment.status,
    shipment.pod ?? "",
    shipment.finalPortDestination ?? "",
    shipment.cargoDescription ?? "",
    ...Object.values(extra).map((value) => String(value ?? "")),
  ].join(" ");
}

function sortRowsForSection<T extends {
  status: string;
  pod?: string | null;
  finalPortDestination?: string | null;
  cargoDescription?: string | null;
  extraFields?: unknown;
}>(label: string, rows: T[]): T[] {
  if (label !== "SHIPMENTS ON SEA") return rows;
  return [...rows].sort((a, b) => {
    const aKey = shipmentDateSortKey(shipmentSortText(a)) ?? Number.MAX_SAFE_INTEGER;
    const bKey = shipmentDateSortKey(shipmentSortText(b)) ?? Number.MAX_SAFE_INTEGER;
    return aKey - bKey;
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

function findTemplateSections(ws: ExcelJS.Worksheet): Record<string, {
  sectionRow: number;
  headerRow: number;
  firstDataRow: number;
  extraDataStart: number;
  extraDataEnd: number;
  footerRow: number;
}> {
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

  const sections: Record<string, {
    sectionRow: number;
    headerRow: number;
    firstDataRow: number;
    extraDataStart: number;
    extraDataEnd: number;
    footerRow: number;
  }> = {};
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const nextRow = found[i + 1]?.row ?? ((ws.lastRow?.number ?? current.row));
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
      firstDataRow: headerRow + 1,
      extraDataStart: headerRow + 2,
      extraDataEnd: Math.max(headerRow + 2, nextRow - 2),
      footerRow: Math.max(headerRow + 1, nextRow - 1),
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
    const sectionRow = section.sectionRow + rowOffset;
    const firstDataRow = section.firstDataRow + rowOffset;
    const extraDataStart = section.extraDataStart + rowOffset;
    const extraDataEnd = section.extraDataEnd + rowOffset;
    const footerRow = section.footerRow + rowOffset;
    const columnMap = headerColumnMap(ws.getRow(section.headerRow + rowOffset));
    const columnsToClear = columnMap.length > 0 ? columnMap.map((mapping) => mapping.col) : Array.from({ length: 14 }, (_v, i) => i + 3);

    try {
      ws.mergeCells(`B${sectionRow}:O${sectionRow}`);
    } catch {}
    const titleCell = ws.getCell(`B${sectionRow}`);
    titleCell.alignment = { ...(titleCell.alignment ?? {}), horizontal: "center", vertical: "middle" };

    const firstRow = ws.getRow(firstDataRow);
    columnsToClear.forEach((col) => { firstRow.getCell(col).value = ""; });
    const firstShipment = rows[0];
    if (firstShipment) {
      if (columnMap.length > 0) {
        columnMap.forEach(({ col, key }) => {
          firstRow.getCell(col).value = shipmentReportValueByKey(firstShipment, key);
        });
      } else {
        shipmentReportValues(firstShipment).forEach((value, i) => {
          firstRow.getCell(i + 3).value = value;
        });
      }
    }
    firstRow.commit();

    const availableExtraRows = Math.max(0, extraDataEnd - extraDataStart + 1);
    const extraRowsToWrite = rows.slice(1, 1 + availableExtraRows);

    for (let rowNumber = extraDataStart; rowNumber < extraDataStart + extraRowsToWrite.length; rowNumber++) {
      const row = ws.getRow(rowNumber);
      columnsToClear.forEach((col) => { row.getCell(col).value = ""; });
      const shipment = extraRowsToWrite[rowNumber - extraDataStart];
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

    const unusedRows = Math.max(0, availableExtraRows - extraRowsToWrite.length);
    if (unusedRows > 0) {
      ws.spliceRows(extraDataStart + extraRowsToWrite.length, unusedRows);
      rowOffset -= unusedRows;
    }

    const footer = ws.getRow(footerRow + Math.min(0, rowOffset));
    footer.commit();
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
      { width: 42 },  // C IFS Ref
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

function pdfEscape(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function pdfColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function truncatePdfText(value: string, maxChars: number): string {
  const clean = (value || "").replace(/\s+/g, " ").trim();
  return clean.length > maxChars ? `${clean.slice(0, Math.max(0, maxChars - 3))}...` : clean;
}

function generateCompanyReportPdfBuffer(
  companyName: string,
  shipments: (typeof shipmentsTable.$inferSelect)[],
): Buffer {
  const pageWidth = 842;
  const pageHeight = 595;
  const RED = pdfColor("#C00000");
  const DARK_BLUE = pdfColor("#1F3864");
  const HEADER_BG = pdfColor("#D6DCE4");
  const ROW_ALT = pdfColor("#F2F2F2");
  const WHITE = pdfColor("#FFFFFF");
  const BLACK = pdfColor("#000000");
  const GREY = pdfColor("#888888");
  const BORDER = pdfColor("#808080");
  const dateStr = todayString();
  const left = 24;
  const right = 24;
  const top = 26;
  const contentWidth = pageWidth - left - right;
  const bottom = pageHeight - 28;
  const colWidths = [90, 34, 82, 72, 76, 84, 112, 66, 38, 38, 54, 68, 56, 70];
  const labels = ["IFS Ref", "Type", "BL / Manifest No.", "Container No.", "Shipper", "Consignee", "Cargo Desc", "Invoice No.", "POD", "FPD", "Agent", "MRA Ref", "Entry", "Status"];
  const pages: string[] = [];
  let content = "";
  let y = top;

  const py = (value: number) => pageHeight - value;
  const add = (value: string) => { content += value; };
  const page = () => { content = ""; y = top; };
  const finishPage = () => { pages.push(content); };
  const rect = (x: number, topY: number, width: number, height: number, fill: string, stroke = BORDER) => {
    add(`q ${fill} rg ${stroke} RG 0.5 w ${x.toFixed(2)} ${py(topY + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re B Q\n`);
  };
  const text = (value: string, x: number, topY: number, size: number, font: "F1" | "F2" | "F3", color: string, width: number, align: "left" | "center" | "right" = "left") => {
    const maxChars = Math.max(4, Math.floor(width / (size * 0.48)));
    const clean = truncatePdfText(value, maxChars);
    const approxWidth = clean.length * size * 0.48;
    const tx = align === "center" ? x + Math.max(0, (width - approxWidth) / 2) : align === "right" ? x + Math.max(0, width - approxWidth) : x;
    add(`BT /${font} ${size} Tf ${color} rg ${tx.toFixed(2)} ${py(topY).toFixed(2)} Td (${pdfEscape(clean)}) Tj ET\n`);
  };

  const drawTitle = () => {
    text("InterFreight Solutions", left, y + 16, 16, "F2", RED, contentWidth * 0.66);
    text("Status Report", left + contentWidth * 0.66, y + 15, 13, "F2", DARK_BLUE, contentWidth * 0.34, "right");
    y += 24;
    text(companyName, left, y + 10, 10, "F2", BLACK, contentWidth * 0.66);
    text(`Date: ${dateStr}`, left + contentWidth * 0.66, y + 10, 9, "F1", BLACK, contentWidth * 0.34, "right");
    y += 24;
  };
  const ensureSpace = (height: number) => {
    if (y + height <= bottom) return;
    finishPage();
    page();
    drawTitle();
  };
  const drawSectionHeader = (title: string) => {
    ensureSpace(40);
    rect(left, y, contentWidth, 20, DARK_BLUE, DARK_BLUE);
    text(title, left, y + 13, 9, "F2", WHITE, contentWidth, "center");
    y += 20;
  };
  const drawColumnHeaders = () => {
    let x = left;
    for (let i = 0; i < labels.length; i++) {
      const width = colWidths[i] ?? 40;
      rect(x, y, width, 18, HEADER_BG);
      text(labels[i] ?? "", x + 3, y + 12, 6.6, "F2", BLACK, width - 6, "center");
      x += width;
    }
    y += 18;
  };
  const drawShipmentRow = (shipment: typeof shipments[number], rowIndex: number) => {
    ensureSpace(23);
    const values = shipmentReportValues(shipment);
    let x = left;
    for (let i = 0; i < values.length; i++) {
      const width = colWidths[i] ?? 40;
      rect(x, y, width, 22, rowIndex % 2 === 1 ? ROW_ALT : WHITE);
      text(values[i] || "", x + 3, y + 13, 6.8, "F1", BLACK, width - 6, i <= 3 || i >= 7 ? "center" : "left");
      x += width;
    }
    y += 22;
  };

  page();
  drawTitle();
  const usedStatuses = new Set<string>();
  for (const section of SECTION_MAP) {
    const rows = sortRowsForSection(section.label, shipments.filter((s) => section.statuses.some(
      (st) => s.status.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(s.status.toLowerCase())
    )));
    rows.forEach((s) => usedStatuses.add(s.status));
    drawSectionHeader(section.label);
    drawColumnHeaders();
    if (rows.length === 0) {
      ensureSpace(20);
      rect(left, y, contentWidth, 20, WHITE);
      text("-", left, y + 13, 8, "F3", GREY, contentWidth, "center");
      y += 20;
    } else {
      rows.forEach((shipment, index) => drawShipmentRow(shipment, index));
    }
    y += 8;
  }

  const other = shipments.filter((s) => !usedStatuses.has(s.status));
  if (other.length > 0) {
    drawSectionHeader("OTHER SHIPMENTS");
    drawColumnHeaders();
    other.forEach((shipment, index) => drawShipmentRow(shipment, index));
  }
  finishPage();

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const fontNormal = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const fontOblique = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");
  const pageRefs: number[] = [];
  const pageObjectIndexes: number[] = [];
  for (const pageContent of pages) {
    const stream = Buffer.from(pageContent, "utf8");
    const contentObject = addObject(`<< /Length ${stream.length} >>\nstream\n${pageContent}endstream`);
    const pageObject = addObject("");
    pageObjectIndexes.push(pageObject);
    pageRefs.push(contentObject);
  }
  const pagesObject = addObject("");
  pageObjectIndexes.forEach((pageObject, index) => {
    objects[pageObject - 1] = `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontNormal} 0 R /F2 ${fontBold} 0 R /F3 ${fontOblique} 0 R >> >> /Contents ${pageRefs[index]} 0 R >>`;
  });
  objects[pagesObject - 1] = `<< /Type /Pages /Kids [${pageObjectIndexes.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIndexes.length} >>`;
  const catalogObject = addObject(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function streamCompanyReportPdf(
  res: any,
  reportLabel: string,
  fileName: string,
  shipments: (typeof shipmentsTable.$inferSelect)[],
): void {
  const pdf = generateCompanyReportPdfBuffer(reportLabel, shipments);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", String(pdf.length));
  res.end(pdf);
}

async function convertWorkbookToPdfBuffer(wb: ExcelJS.Workbook, fileName: string): Promise<Buffer> {
  const secret = (
    process.env.CONVERTAPI_SECRET
    ?? process.env.CONVERT_API_SECRET
    ?? process.env.CONVERTAPI_TOKEN
    ?? process.env.CONVERT_API_TOKEN
    ?? ""
  ).trim();
  if (!secret) {
    throw new Error("ConvertAPI secret is not set. Add CONVERTAPI_SECRET in Vercel Environment Variables and redeploy.");
  }

  const workbookData = await wb.xlsx.writeBuffer();
  const workbookBuffer = Buffer.isBuffer(workbookData)
    ? workbookData
    : Buffer.from(workbookData as ArrayBuffer);
  const form = new FormData();
  form.append(
    "File",
    new Blob([workbookBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName,
  );
  form.append("StoreFile", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  let response: Response;
  try {
    response = await fetch("https://v2.convertapi.com/convert/xlsx/to/pdf", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const json = contentType.includes("application/json")
      ? await response.json().catch(() => ({})) as any
      : {};
    const text = contentType.includes("application/json") ? "" : await response.text().catch(() => "");
    const message = json?.Message || json?.message || text || `ConvertAPI failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!contentType.includes("application/json")) {
    return Buffer.from(await response.arrayBuffer());
  }

  const json = await response.json().catch(() => ({})) as any;
  const file = json?.Files?.[0];
  if (file?.FileData) {
    return Buffer.from(file.FileData, "base64");
  }
  if (file?.Url) {
    const pdfResponse = await fetch(file.Url);
    if (!pdfResponse.ok) throw new Error(`ConvertAPI PDF download failed with status ${pdfResponse.status}`);
    return Buffer.from(await pdfResponse.arrayBuffer());
  }

  throw new Error("ConvertAPI did not return a PDF file.");
}

async function streamCompanyReportPdfFromExcel(
  res: any,
  reportLabel: string,
  fileName: string,
  shipments: (typeof shipmentsTable.$inferSelect)[],
): Promise<void> {
  const template = await getReportTemplate();
  const wb = await generateCompanyReportWorkbook(reportLabel, shipments, template?.buffer ?? null);
  const xlsxName = fileName.replace(/\.pdf$/i, ".xlsx");
  const pdf = await convertWorkbookToPdfBuffer(wb, xlsxName);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", String(pdf.length));
  res.end(pdf);
}

function handlePdfRouteError(res: any, err: unknown) {
  const message = err instanceof Error ? err.message : "PDF generation failed";
  logger.error({ err, message }, "PDF conversion failed");
  res.status(500).json({ error: message });
}

router.get("/staff/company-report/:company/excel", requireAuth, requireStaff, async (req, res) => {
  const companyName = decodeURIComponent(req.params["company"] as string);
  const shipments = await db.select().from(shipmentsTable).where(and(sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`, activeShipmentSql)).orderBy(asc(shipmentsTable.ifsRef));
  const template = await getReportTemplate();
  const wb = await generateCompanyReportWorkbook(companyName, shipments, template?.buffer ?? null);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Status Report - ${companyName} (${todayString()}).xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/staff/company-report/:company/pdf", requireAuth, requireStaff, async (req, res) => {
  try {
    const companyName = decodeURIComponent(req.params["company"] as string);
    const shipments = await db.select().from(shipmentsTable).where(and(sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`, activeShipmentSql)).orderBy(asc(shipmentsTable.ifsRef));
    await streamCompanyReportPdfFromExcel(res, companyName, `Status Report - ${companyName} (${todayString()}).pdf`, shipments);
  } catch (err) {
    handlePdfRouteError(res, err);
  }
});

router.get("/customer/company-report/pdf", requireAuth, async (req, res) => {
  try {
    const authReq = req as typeof req & { user: { role: string; companyName: string } };
    if (authReq.user.role !== "customer") {
      res.status(403).send("Customer access required");
      return;
    }

    const companyName = authReq.user.companyName;
    const shipments = await db
      .select()
      .from(shipmentsTable)
      .where(and(sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`, activeShipmentSql))
      .orderBy(asc(shipmentsTable.ifsRef));

    await streamCompanyReportPdfFromExcel(res, companyName, `Status Report - ${companyName} (${todayString()}).pdf`, shipments);
  } catch (err) {
    handlePdfRouteError(res, err);
  }
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
            activeShipmentSql,
          )
        : and(
            sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`,
            sql`lower(${shipmentsTable.consignee}) = lower(${consigneeName})`,
            activeShipmentSql,
          ),
    )
    .orderBy(asc(shipmentsTable.ifsRef));

  const template = await getReportTemplate();
  const reportLabel = isUnspecified ? companyName : (shipments[0]?.consignee ?? consigneeName);
  const wb = await generateCompanyReportWorkbook(reportLabel, shipments, template?.buffer ?? null);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Status Report - ${companyName} - ${reportLabel} (${todayString()}).xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/staff/company-report/:company/consignee/:consignee/pdf", requireAuth, requireStaff, async (req, res) => {
  try {
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
              activeShipmentSql,
            )
          : and(
              sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`,
              sql`lower(${shipmentsTable.consignee}) = lower(${consigneeName})`,
              activeShipmentSql,
            ),
      )
      .orderBy(asc(shipmentsTable.ifsRef));

    const reportLabel = isUnspecified ? companyName : (shipments[0]?.consignee ?? consigneeName);
    await streamCompanyReportPdfFromExcel(res, reportLabel, `Status Report - ${companyName} - ${reportLabel} (${todayString()}).pdf`, shipments);
  } catch (err) {
    handlePdfRouteError(res, err);
  }
});

// ── All-company ZIP download (staff only) ────────────────────────────────────
// Generates one Status Report Excel per company and bundles them into a ZIP.

router.get("/staff/all-reports-zip", requireAuth, requireStaff, async (_req, res) => {
  const companies = await db
    .select({ companyName: sql<string>`min(${shipmentsTable.companyName})` })
    .from(shipmentsTable)
    .where(activeShipmentSql)
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
      .where(and(sql`lower(${shipmentsTable.companyName}) = lower(${companyName})`, activeShipmentSql))
      .orderBy(asc(shipmentsTable.ifsRef));

    const wb = await generateCompanyReportWorkbook(companyName, shipments, template?.buffer ?? null);
    const buf = await wb.xlsx.writeBuffer();
    const safeName = companyName.replace(/[/\\?%*:|"<>]/g, "-").trim();
    arc.append(Buffer.from(buf), { name: `Status Report - ${safeName} (${dateStr}).xlsx` });
  }

  await arc.finalize();
});

// ── List all users (admin only) ───────────────────────────────────────────────

router.get("/staff/pending-signups", requireAuth, requireStaff, async (_req, res) => {
  const rows = await db
    .select({
      id: pendingSignupsTable.id,
      fullName: pendingSignupsTable.fullName,
      companyName: pendingSignupsTable.companyName,
      email: pendingSignupsTable.email,
      phoneNumber: pendingSignupsTable.phoneNumber,
      profilePictureUrl: pendingSignupsTable.profilePictureUrl,
      role: pendingSignupsTable.role,
      status: pendingSignupsTable.status,
      createdAt: pendingSignupsTable.createdAt,
    })
    .from(pendingSignupsTable)
    .where(eq(pendingSignupsTable.status, "pending"))
    .orderBy(desc(pendingSignupsTable.createdAt));

  res.json(rows);
});

router.get("/staff/signup-history", requireAuth, requireStaff, async (_req, res) => {
  const rows = await db
    .select({
      id: pendingSignupsTable.id,
      fullName: pendingSignupsTable.fullName,
      companyName: pendingSignupsTable.companyName,
      email: pendingSignupsTable.email,
      phoneNumber: pendingSignupsTable.phoneNumber,
      profilePictureUrl: pendingSignupsTable.profilePictureUrl,
      role: pendingSignupsTable.role,
      status: pendingSignupsTable.status,
      reviewedBy: pendingSignupsTable.reviewedBy,
      reviewedAt: pendingSignupsTable.reviewedAt,
      createdAt: pendingSignupsTable.createdAt,
    })
    .from(pendingSignupsTable)
    .orderBy(desc(pendingSignupsTable.createdAt));

  res.json(rows);
});

router.post("/staff/pending-signups/:id/approve", requireAuth, requireStaff, async (req, res) => {
  const authReq = req as typeof req & { user: { email: string } };
  const id = Number(req.params["id"]);
  const profilePictureUrl = typeof req.body?.profilePictureUrl === "string" ? req.body.profilePictureUrl.trim() : "";
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid pending signup id" }); return; }

  const [pending] = await db.select().from(pendingSignupsTable).where(eq(pendingSignupsTable.id, id)).limit(1);
  if (!pending || pending.status !== "pending") { res.status(404).json({ error: "Pending signup not found" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.email, pending.email)).limit(1);
  if (existing) {
    await db
      .update(pendingSignupsTable)
      .set({ status: "rejected", reviewedBy: authReq.user.email, reviewedAt: new Date() })
      .where(eq(pendingSignupsTable.id, id));
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      fullName: pending.fullName,
      companyName: pending.companyName,
      email: pending.email.toLowerCase(),
      phoneNumber: pending.phoneNumber,
      profilePictureUrl: profilePictureUrl || pending.profilePictureUrl || null,
      passwordHash: pending.passwordHash,
      role: pending.role,
    })
    .returning({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, profilePictureUrl: usersTable.profilePictureUrl });

  await db
    .update(pendingSignupsTable)
    .set({ status: "approved", reviewedBy: authReq.user.email, reviewedAt: new Date() })
    .where(eq(pendingSignupsTable.id, id));

  if (pending.approvalToken) {
    await sendPushToPendingSignup(pending.approvalToken, {
      title: "Signup Approved",
      body: "Your InterFreight account has been approved. Open the app to continue.",
      url: "/auth/waiting",
      tag: `signup-approved-${pending.id}`,
    });
    await transferPendingPushSubscriptionsToUser(pending.approvalToken, user.id);
  }

  res.status(201).json(user);
});

router.post("/staff/pending-signups/:id/reject", requireAuth, requireStaff, async (req, res) => {
  const authReq = req as typeof req & { user: { email: string } };
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid pending signup id" }); return; }

  const [pending] = await db.select().from(pendingSignupsTable).where(eq(pendingSignupsTable.id, id)).limit(1);
  if (!pending || pending.status !== "pending") { res.status(404).json({ error: "Pending signup not found" }); return; }

  await db
    .update(pendingSignupsTable)
    .set({ status: "rejected", reviewedBy: authReq.user.email, reviewedAt: new Date() })
    .where(eq(pendingSignupsTable.id, id));

  if (pending.approvalToken) {
    await sendPushToPendingSignup(pending.approvalToken, {
      title: "Signup Rejected",
      body: "Your signup request was rejected. Please contact InterFreight Solutions.",
      url: "/auth/waiting",
      tag: `signup-rejected-${pending.id}`,
    });
  }

  res.status(204).send();
});

router.delete("/staff/pending-signups/:id", requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid pending signup id" }); return; }

  const [pending] = await db.select().from(pendingSignupsTable).where(eq(pendingSignupsTable.id, id)).limit(1);
  if (!pending) { res.status(404).json({ error: "Signup request not found" }); return; }

  await db.delete(pendingSignupsTable).where(eq(pendingSignupsTable.id, id));
  res.status(204).send();
});

router.get("/staff/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      companyName: usersTable.companyName,
      email: usersTable.email,
      phoneNumber: usersTable.phoneNumber,
      role: usersTable.role,
      profilePictureUrl: usersTable.profilePictureUrl,
    })
    .from(usersTable);
  res.json(users);
});

router.patch("/staff/users/:id/profile-picture", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string, 10);
  const profilePictureUrl = typeof req.body?.profilePictureUrl === "string" ? req.body.profilePictureUrl.trim() : "";

  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const updated = await db
    .update(usersTable)
    .set({ profilePictureUrl: profilePictureUrl || null })
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      fullName: usersTable.fullName,
      companyName: usersTable.companyName,
      email: usersTable.email,
      phoneNumber: usersTable.phoneNumber,
      role: usersTable.role,
      profilePictureUrl: usersTable.profilePictureUrl,
    });

  if (updated.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ user: updated[0] });
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
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, id));
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
  await db.update(sessionsTable).set({ revokedAt: new Date() }).where(eq(sessionsTable.userId, id));

  res.status(204).send();
});

export default router;

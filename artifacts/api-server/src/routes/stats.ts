import { Router } from "express";
import { db, pool, shipmentsTable, uploadsTable } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import fsSync from "node:fs";

const router = Router();
const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const uploadsDir = process.env.VERCEL
  ? path.resolve("/tmp", "ifs-uploads")
  : path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fsSync.existsSync(uploadsDir)) fsSync.mkdirSync(uploadsDir, { recursive: true });

const SECTION_MAP: { label: string; statuses: string[] }[] = [
  { label: "SHIPMENTS IN MALAWI", statuses: ["Delivered", "Awaiting Clearance"] },
  { label: "SHIPMENTS ENROUTE", statuses: ["In Transit", "Enroute LLW", "Enroute BLZ", "Enroute"] },
  { label: "SHIPMENTS AT POD", statuses: ["At Port", "Offloading"] },
  { label: "SHIPMENTS ON SEA", statuses: ["Delayed", "On Sea", "At Sea"] },
];

function normalizeSectionLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sectionLabelForShipment(shipment: { status: string; extraFields: unknown }): string {
  const extra = (shipment.extraFields as Record<string, unknown>) ?? {};
  const sourceSection = String(extra["Source Section"] ?? extra["sourceSection"] ?? "").trim();
  if (sourceSection) {
    const matchingSection = SECTION_MAP.find((section) =>
      normalizeSectionLabel(section.label) === normalizeSectionLabel(sourceSection)
    );
    if (matchingSection) return matchingSection.label;
  }

  const status = shipment.status.toLowerCase();
  return SECTION_MAP.find((section) => section.statuses.some(
    (st) => status.includes(st.toLowerCase()) || st.toLowerCase().includes(status),
  ))?.label ?? "OTHER SHIPMENTS";
}

function shipmentBelongsToDashboardSection(shipment: { status: string; extraFields: unknown }): boolean {
  return SECTION_MAP.some((section) => section.label === sectionLabelForShipment(shipment));
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

const dashboardShipmentSql = sql`NOT (
  lower(${shipmentsTable.status}) LIKE '%completed%'
  OR lower(coalesce(${shipmentsTable.extraFields}->>'Source Section', '')) LIKE '%completed%'
  OR lower(coalesce(${shipmentsTable.extraFields}->>'sourceSection', '')) LIKE '%completed%'
  OR lower(coalesce(${shipmentsTable.extraFields}->>'Section', '')) LIKE '%completed%'
)`;

function extraValue(extraFields: unknown, ...keys: string[]): string {
  const extra = (extraFields as Record<string, unknown>) ?? {};
  for (const key of keys) {
    const value = extra[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
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
  extraFields: unknown;
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

function parseEtaDate(status: string, now = new Date()): Date | null {
  const etaMatch = status.match(/\bETA\b[:\s-]*(.+)$/i);
  if (!etaMatch?.[1]) return null;
  const raw = etaMatch[1].replace(/\b(ETA|on|at)\b/gi, " ").replace(/[,.]/g, " ").trim();
  const monthNames: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
    september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  const buildDate = (dayValue: string, monthIndex: number, yearValue?: string): Date => {
    const hasYear = Boolean(yearValue);
    const year = hasYear ? normalizeYear(yearValue!) : now.getFullYear();
    const parsed = new Date(year, monthIndex, Number(dayValue));
    if (!hasYear && parsed < startOfDay(now)) parsed.setFullYear(parsed.getFullYear() + 1);
    return parsed;
  };

  const wordDate = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?(?:\s|[-/])+\s*([A-Za-z]+)(?:\s|[-/])*(\d{2,4})?\b/i);
  if (wordDate?.[1] && wordDate[2]) {
    const month = monthNames[wordDate[2].toLowerCase()];
    if (month !== undefined) {
      return buildDate(wordDate[1], month, wordDate[3]);
    }
  }

  const monthFirstDate = raw.match(/\b([A-Za-z]+)(?:\s|[-/])+\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s|[-/])*(\d{2,4})?\b/i);
  if (monthFirstDate?.[1] && monthFirstDate[2]) {
    const month = monthNames[monthFirstDate[1].toLowerCase()];
    if (month !== undefined) {
      return buildDate(monthFirstDate[2], month, monthFirstDate[3]);
    }
  }

  const slashDate = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slashDate?.[1] && slashDate[2]) {
    const hasYear = Boolean(slashDate[3]);
    const year = hasYear ? normalizeYear(slashDate[3]!) : now.getFullYear();
    const parsed = new Date(year, Number(slashDate[2]) - 1, Number(slashDate[1]));
    if (!hasYear && parsed < startOfDay(now)) parsed.setFullYear(parsed.getFullYear() + 1);
    return parsed;
  }

  return null;
}

function normalizeYear(value: string): number {
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shipmentIdentifier(shipment: { containerNo: string | null; extraFields: unknown }): string {
  const type = extraValue(shipment.extraFields, "Type", "type").toUpperCase();
  const blManifest = extraValue(shipment.extraFields, "BL / Manifest No.", "BL/Manifest No.", "BL", "bl");
  if (type === "FTL" || type === "LCL") return blManifest || "N/A";
  return shipment.containerNo || blManifest || "N/A";
}

function normalizeUploadFamily(filename: string): string {
  const safe = filename.toLowerCase().replace(/\.[^.]+$/, "");
  const compact = safe
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

type WorkbookDashboardStats = {
  totalContainers: number;
  totalCompanies: number;
  sectionCounts: Record<string, number>;
  statusCountsBySection: Record<string, Record<string, number>>;
};

function rowText(ws: ExcelJS.Worksheet, rowNumber: number): string {
  const row = ws.getRow(rowNumber);
  return row.values
    .slice(1)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function headerColumnIndex(ws: ExcelJS.Worksheet, headerRow: number, headerName: string): number {
  const normalizedTarget = normalizeSectionLabel(headerName);
  const values = ws.getRow(headerRow).values.slice(1) as unknown[];
  for (let i = 0; i < values.length; i++) {
    if (normalizeSectionLabel(String(values[i] ?? "")) === normalizedTarget) return i + 1;
  }
  return -1;
}

function rowHasMeaningfulData(row: ExcelJS.Row): boolean {
  const values = row.values.slice(1) as unknown[];
  return values.some((value) => String(value ?? "").trim() !== "");
}

async function loadDashboardStatsFromLatestTrackingMaster(): Promise<WorkbookDashboardStats | null> {
  const workbook = new ExcelJS.Workbook();
  const latestUploadResult = await pool.query<{
    id: number;
    filename: string;
    file_data: Buffer | null;
    uploaded_at: Date;
  }>(
    `SELECT id, filename, file_data, uploaded_at
     FROM uploads
     ORDER BY uploaded_at DESC, id DESC
     LIMIT 50`,
  );
  const latestUpload = latestUploadResult.rows.find((row) =>
    /\.(xlsx|xls)$/i.test(row.filename) && normalizeUploadFamily(row.filename) === "tracking master",
  );
  if (!latestUpload) return null;

  if (latestUpload.file_data) {
    await workbook.xlsx.load(latestUpload.file_data);
  } else {
    const candidates = await fs.readdir(uploadsDir).catch(() => []);
    const storedName = candidates
      .filter((name) => name.endsWith(`-${latestUpload.filename}`))
      .sort()
      .at(-1);
    if (!storedName) return null;
    const fallbackPath = path.resolve(uploadsDir, storedName);
    const fallbackData = await fs.readFile(fallbackPath).catch(() => null);
    if (!fallbackData) return null;
    await workbook.xlsx.load(fallbackData);
  }

  const worksheet = workbook.getWorksheet("Sheet1") ?? workbook.worksheets[0];
  if (!worksheet) return null;

  const headings: Array<{ label: string; row: number }> = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const text = rowText(worksheet, rowNumber);
    const normalized = normalizeSectionLabel(text);
    const matched = SECTION_MAP.find((section) => normalized === normalizeSectionLabel(section.label));
    if (matched) headings.push({ label: matched.label, row: rowNumber });
  }
  if (headings.length === 0) return null;

  const sectionCounts = Object.fromEntries(SECTION_MAP.map((section) => [section.label, 0])) as Record<string, number>;
  const statusCountsBySection = Object.fromEntries(
    SECTION_MAP.map((section) => [section.label, {} as Record<string, number>]),
  ) as Record<string, Record<string, number>>;
  const companyKeys = new Set<string>();
  let totalContainers = 0;

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i]!;
    const nextHeadingRow = headings[i + 1]?.row ?? (worksheet.rowCount + 1);
    let headerRow = current.row + 1;
    for (let rowNumber = current.row + 1; rowNumber < nextHeadingRow; rowNumber++) {
      if (normalizeSectionLabel(rowText(worksheet, rowNumber)).includes("IFS REF")) {
        headerRow = rowNumber;
        break;
      }
    }

    const statusCol = headerColumnIndex(worksheet, headerRow, "Status");
    const consigneeCol = headerColumnIndex(worksheet, headerRow, "Consignee");

    for (let rowNumber = headerRow + 1; rowNumber < nextHeadingRow; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      if (!rowHasMeaningfulData(row)) continue;
      totalContainers += 1;
      sectionCounts[current.label] += 1;

      const status = statusCol > 0 ? String(row.getCell(statusCol).value ?? "").trim() || "N/A" : "N/A";
      statusCountsBySection[current.label][status] = (statusCountsBySection[current.label][status] ?? 0) + 1;

      if (consigneeCol > 0) {
        const consignee = String(row.getCell(consigneeCol).value ?? "").trim().toLowerCase();
        if (consignee) companyKeys.add(consignee);
      }
    }
  }

  return {
    totalContainers,
    totalCompanies: companyKeys.size,
    sectionCounts,
    statusCountsBySection,
  };
}

router.get("/stats/dashboard", requireAuth, async (_req, res) => {
  const workbookStats = await loadDashboardStatsFromLatestTrackingMaster();
  const sectionCounts = workbookStats?.sectionCounts ?? Object.fromEntries(SECTION_MAP.map((section) => [section.label, 0]));

  const [latestUpload] = await db
    .select({ uploadedAt: uploadsTable.uploadedAt })
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.uploadedAt))
    .limit(1);

  res.json({
    totalCompanies: workbookStats?.totalCompanies ?? 0,
    totalContainers: workbookStats?.totalContainers ?? 0,
    inTransit: 0,
    delivered: 0,
    awaitingClearance: 0,
    atPort: 0,
    delayed: 0,
    sectionCounts: SECTION_MAP.map((section) => ({
      label: section.label,
      count: sectionCounts[section.label] ?? 0,
    })),
    latestUpload: latestUpload?.uploadedAt?.toISOString() ?? null,
  });
});

router.get("/stats/operational-alerts", requireAuth, async (_req, res) => {
  const today = startOfDay(new Date());
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 15);

  const shipments = await db
    .select({
      id: shipmentsTable.id,
      status: shipmentsTable.status,
      containerNo: shipmentsTable.containerNo,
      shipper: shipmentsTable.shipper,
      consignee: shipmentsTable.consignee,
      cargoDescription: shipmentsTable.cargoDescription,
      invoiceNo: shipmentsTable.invoiceNo,
      mraRef: shipmentsTable.mraRef,
      entry: shipmentsTable.entry,
      extraFields: shipmentsTable.extraFields,
    })
    .from(shipmentsTable)
    .where(dashboardShipmentSql);

  const mapBase = (shipment: typeof shipments[number]) => ({
    id: shipment.id,
    identifier: shipmentIdentifier(shipment),
    consignee: shipment.consignee || "N/A",
    shipper: shipment.shipper || "N/A",
    cargoDescription: shipment.cargoDescription || "N/A",
    invoiceNo: shipment.invoiceNo || "N/A",
  });

  const isWithinWindow = (shipment: typeof shipments[number]) => {
    const etaDate = parseEtaDate(shipment.status, today);
    return Boolean(etaDate && etaDate >= today && etaDate <= maxDate);
  };

  const nearbyConsignments = shipments
    .map((shipment) => ({ shipment, etaDate: parseEtaDate(shipment.status, today) }))
    .filter(({ etaDate }) => etaDate && etaDate >= today && etaDate <= maxDate)
    .sort((a, b) => a.etaDate!.getTime() - b.etaDate!.getTime())
    .map(({ shipment, etaDate }) => ({
      ...mapBase(shipment),
      eta: etaDate!.toISOString(),
      status: shipment.status,
    }));

  const needsChecking = shipments
    .filter((shipment) => Boolean(shipment.mraRef?.trim()) && !shipment.entry?.trim())
    .map((shipment) => ({
      ...mapBase(shipment),
      mraRef: shipment.mraRef || "N/A",
    }));

  const documentsNeeded = shipments
    .filter((shipment) => extraValue(shipment.extraFields, "Needs Documents").toLowerCase() === "true" && isWithinWindow(shipment))
    .map((shipment) => ({
      ...mapBase(shipment),
      eta: parseEtaDate(shipment.status, today)?.toISOString(),
      status: shipment.status,
    }));

  const mraRefNeeded = shipments
    .filter((shipment) => {
      if (shipment.mraRef?.trim()) return false;
      const section = sectionLabelForShipment(shipment);
      return section === "SHIPMENTS ENROUTE" || section === "SHIPMENTS IN MALAWI";
    })
    .map((shipment) => ({
      ...mapBase(shipment),
      status: shipment.status,
    }));

  res.json({ nearbyConsignments, needsChecking, documentsNeeded, mraRefNeeded });
});

router.get("/stats/status-breakdown", requireAuth, async (_req, res) => {
  const workbookStats = await loadDashboardStatsFromLatestTrackingMaster();
  if (workbookStats) {
    res.json(SECTION_MAP.map((section) => ({
      status: section.label,
      count: workbookStats.sectionCounts[section.label] ?? 0,
      details: Object.entries(workbookStats.statusCountsBySection[section.label] ?? {})
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => {
          if (section.label === "SHIPMENTS ON SEA") {
            const aKey = shipmentDateSortKey(a.status) ?? Number.MAX_SAFE_INTEGER;
            const bKey = shipmentDateSortKey(b.status) ?? Number.MAX_SAFE_INTEGER;
            if (aKey !== bKey) return aKey - bKey;
          }
          return b.count - a.count;
        }),
    })));
    return;
  }

  const sectionCounts = Object.fromEntries(SECTION_MAP.map((section) => [section.label, 0])) as Record<string, number>;
  const statusCountsBySection = Object.fromEntries(
    SECTION_MAP.map((section) => [section.label, {} as Record<string, number>])
  ) as Record<string, Record<string, number>>;
  const statusSortBySection = Object.fromEntries(
    SECTION_MAP.map((section) => [section.label, {} as Record<string, number>])
  ) as Record<string, Record<string, number>>;
  const shipments = await db
    .select({
      status: shipmentsTable.status,
      pod: shipmentsTable.pod,
      finalPortDestination: shipmentsTable.finalPortDestination,
      cargoDescription: shipmentsTable.cargoDescription,
      extraFields: shipmentsTable.extraFields,
    })
    .from(shipmentsTable)
    .where(activeShipmentSql);

  for (const shipment of shipments) {
    if (!shipmentBelongsToDashboardSection(shipment)) continue;
    const label = sectionLabelForShipment(shipment);
    if (label in sectionCounts) {
      sectionCounts[label] += 1;
      statusCountsBySection[label][shipment.status] = (statusCountsBySection[label][shipment.status] ?? 0) + 1;
      const sortKey = shipmentDateSortKey(shipmentSortText(shipment));
      if (sortKey !== null) {
        const currentKey = statusSortBySection[label][shipment.status];
        statusSortBySection[label][shipment.status] = currentKey === undefined ? sortKey : Math.min(currentKey, sortKey);
      }
    }
  }

  res.json(SECTION_MAP.map((section) => ({
    status: section.label,
    count: sectionCounts[section.label] ?? 0,
    details: Object.entries(statusCountsBySection[section.label] ?? {})
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => {
        if (section.label === "SHIPMENTS ON SEA") {
          const aKey = statusSortBySection[section.label][a.status] ?? Number.MAX_SAFE_INTEGER;
          const bKey = statusSortBySection[section.label][b.status] ?? Number.MAX_SAFE_INTEGER;
          if (aKey !== bKey) return aKey - bKey;
        }
        return b.count - a.count;
      }),
  })));
});

router.get("/stats/recent-activity", requireAuth, async (_req, res) => {
  const [latestUpload] = await db
    .select({
      id: uploadsTable.id,
      newRecords: uploadsTable.newRecords,
      updatedRecords: uploadsTable.updatedRecords,
    })
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.uploadedAt))
    .limit(1);

  if (!latestUpload || latestUpload.newRecords + latestUpload.updatedRecords === 0) {
    res.json({ newConsignments: [], recentActivity: [] });
    return;
  }

  const result = await pool.query<{
    id: number;
    shipment_id: number | null;
    change_type: string;
    ifs_ref: string;
    company_name: string;
    status: string | null;
    changes: unknown;
    created_at: Date;
    container_no: string | null;
    shipper: string | null;
    consignee: string | null;
    cargo_description: string | null;
    invoice_no: string | null;
    extra_fields: Record<string, unknown> | null;
  }>(
    `SELECT
       l.id,
       l.shipment_id,
       l.change_type,
       l.ifs_ref,
       l.company_name,
       l.status,
       l.changes,
       l.created_at,
       s.container_no,
       s.shipper,
       s.consignee,
       s.cargo_description,
       s.invoice_no,
       s.extra_fields
     FROM shipment_change_logs l
     LEFT JOIN shipments s ON s.id = l.shipment_id
     WHERE l.upload_batch_id = $1
       AND lower(coalesce(l.status, '')) NOT LIKE '%completed%'
       AND lower(coalesce(l.changes::text, '')) NOT LIKE '%completed%'
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 50`,
    [latestUpload.id],
  );

  const items = result.rows.map((row) => ({
    id: row.id,
    shipmentId: row.shipment_id,
    changeType: row.change_type,
    ifsRef: row.ifs_ref,
    companyName: row.company_name,
    status: row.status,
    lastUpdated: row.created_at,
    containerNo: row.container_no,
    shipper: row.shipper,
    consignee: row.consignee,
    cargoDescription: row.cargo_description,
    invoiceNo: row.invoice_no,
    identifier: String(row.extra_fields?.["BL / Manifest No."] ?? row.extra_fields?.["BL/Manifest No."] ?? row.container_no ?? row.ifs_ref ?? ""),
    changes: Array.isArray(row.changes) ? row.changes : [],
  }));

  res.json({
    newConsignments: items.filter((item) => item.changeType === "new"),
    recentActivity: items.filter((item) => item.changeType === "updated"),
  });
});

export default router;

import { Router } from "express";
import { db, pool, shipmentsTable, uploadsTable } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

const router = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = process.env.VERCEL
  ? path.resolve("/tmp", "ifs-uploads")
  : path.resolve(workspaceRoot, "artifacts/api-server/uploads");

const SECTION_MAP: { label: string; statuses: string[] }[] = [
  { label: "SHIPMENTS IN MALAWI", statuses: ["Delivered", "Awaiting Clearance"] },
  { label: "SHIPMENTS ENROUTE", statuses: ["In Transit", "Enroute LLW", "Enroute BLZ", "Enroute"] },
  { label: "SHIPMENTS AT POD", statuses: ["At Port", "Offloading"] },
  { label: "SHIPMENTS ON SEA", statuses: ["Delayed", "On Sea", "At Sea"] },
];

function normalizeSectionLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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

function sectionLabelFromRow(vals: unknown[]): string | null {
  const cells = vals.slice(1).map((v) => cellStr(v)).filter(Boolean) as string[];
  if (cells.length === 0) return null;
  const first = cells[0];
  if (cells.every((c) => normalizeSectionLabel(c) === normalizeSectionLabel(first))) {
    return first.toUpperCase().trim();
  }
  return null;
}

function isCompletedSection(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase().includes("completed");
}

function isMeaningfulValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "n/a" && normalized !== "na" && normalized !== "-");
}

function matchSectionFromLabel(value: string): string | null {
  const normalized = normalizeSectionLabel(value);
  if (!normalized) return null;
  if (normalized.includes("MALAWI")) return "SHIPMENTS IN MALAWI";
  if (normalized.includes("ENROUTE") || normalized.includes("EN ROUTE")) return "SHIPMENTS ENROUTE";
  if (normalized.includes("POD") || normalized.includes("AT PORT") || normalized.includes("PORT OF DISCHARGE")) {
    return "SHIPMENTS AT POD";
  }
  if (normalized.includes("SEA") || normalized.includes("VESSEL")) return "SHIPMENTS ON SEA";

  const exact = SECTION_MAP.find((section) => normalizeSectionLabel(section.label) === normalized);
  return exact?.label ?? null;
}

function sectionLabelForShipment(shipment: { status: string; extraFields: unknown }): string {
  const extra = (shipment.extraFields as Record<string, unknown>) ?? {};
  const sourceSection = String(extra["Source Section"] ?? extra["sourceSection"] ?? "").trim();
  if (sourceSection) {
    const matchingSection = matchSectionFromLabel(sourceSection);
    if (matchingSection) return matchingSection;
  }

  const status = String(shipment.status ?? "").toLowerCase();
  if (
    status.includes("eta")
    || status.includes("on sea")
    || status.includes("at sea")
    || status.includes("delayed")
    || status.includes("vessel")
    || status.includes("beira")
    || status.includes("nacala")
  ) return "SHIPMENTS ON SEA";
  if (status.includes("at port") || status.includes("pod") || status.includes("offloading")) return "SHIPMENTS AT POD";
  if (status.includes("enroute") || status.includes("en route") || status.includes("in transit") || status.includes("transit")) {
    return "SHIPMENTS ENROUTE";
  }
  if (
    status.includes("malawi")
    || status.includes("delivered")
    || status.includes("awaiting clearance")
    || status.includes("entry done")
    || status.includes("clearing")
  ) return "SHIPMENTS IN MALAWI";

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

type TrackingSnapshotRow = {
  companyName: string;
  consignee: string;
  shipper: string;
  cargoDescription: string;
  invoiceNo: string;
  containerNo: string;
  mraRef: string;
  entry: string;
  status: string;
  docs: string;
  section: string;
  extraFields: Record<string, unknown>;
};

async function readLatestTrackingMasterBuffer(): Promise<Buffer | null> {
  const result = await pool.query<{
    id: number;
    filename: string;
    file_data: Buffer | null;
    uploaded_at: Date;
  }>(
    `SELECT id, filename, file_data, uploaded_at
     FROM uploads
     WHERE lower(filename) LIKE '%tracking%' AND lower(filename) LIKE '%master%'
     ORDER BY uploaded_at DESC, id DESC
     LIMIT 1`,
  );

  const latest = result.rows[0];
  if (!latest) return null;
  if (latest.file_data) return latest.file_data;

  const candidates = await fs.promises.readdir(uploadsDir).catch(() => []);
  const storedName = candidates
    .filter((name) => name.endsWith(`-${latest.filename}`))
    .sort()
    .at(-1);
  if (!storedName) return null;

  return fs.promises.readFile(path.resolve(uploadsDir, storedName)).catch(() => null);
}

async function loadTrackingSnapshotRows(): Promise<TrackingSnapshotRow[] | null> {
  try {
    const buffer = await readLatestTrackingMasterBuffer();
    if (!buffer) return null;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const rows: TrackingSnapshotRow[] = [];
    const activeWorksheets = workbook.worksheets.filter((worksheet) => !/completed/i.test(worksheet.name));

    for (const worksheet of activeWorksheets) {
      let colOffset: number | null = null;
      let currentSection: string | null = worksheet.name ?? null;

      for (let r = 1; r <= worksheet.rowCount; r++) {
        const vals = worksheet.getRow(r).values as unknown[];
        if (!vals || vals.length <= 1) continue;

        const sectionLabel = sectionLabelFromRow(vals);
        if (sectionLabel) {
          currentSection = sectionLabel;
          colOffset = null;
          continue;
        }

        const detected = detectColOffset(vals);
        if (detected !== null) {
          colOffset = detected;
          continue;
        }

        if (colOffset === null) continue;
        if (isCompletedSection(currentSection) || isCompletedSection(worksheet.name)) continue;

        const o = colOffset;
        const typeField = cellStr(vals[o + 1]);
        const blManifest = cellStr(vals[o + 2]);
        const containerNo = cellStr(vals[o + 3]);
        const shipper = cellStr(vals[o + 4]);
        const consignee = cellStr(vals[o + 5]);
        const cargoDesc = cellStr(vals[o + 6]);
        const invoiceNo = cellStr(vals[o + 7]);
        const pod = cellStr(vals[o + 8]);
        const fpd = cellStr(vals[o + 9]);
        const agent = cellStr(vals[o + 10]);
        const mraRef = cellStr(vals[o + 11]);
        const entry = cellStr(vals[o + 12]);
        const status = cellStr(vals[o + 13]);
        const docs = cellStr(vals[o + 14]);

        if (!consignee) continue;
        if (isIgnoredShipmentStatus(status)) continue;

        const extraFields: Record<string, unknown> = {};
        if (typeField) extraFields["Type"] = typeField;
        if (blManifest) extraFields["BL / Manifest No."] = blManifest;
        if (agent) extraFields["Agent"] = agent;
        if (pod) extraFields["POD"] = pod;
        if (fpd) extraFields["FPD"] = fpd;
        if (currentSection) extraFields["Source Section"] = currentSection;

        rows.push({
          companyName: consignee,
          consignee,
          shipper: shipper ?? "N/A",
          cargoDescription: cargoDesc ?? "N/A",
          invoiceNo: invoiceNo ?? "N/A",
          containerNo: containerNo ?? "N/A",
          mraRef: mraRef ?? "N/A",
          entry: entry ?? "N/A",
          status: status ?? "N/A",
          docs: docs ?? "",
          section: currentSection ?? "",
          extraFields,
        });
      }
    }

    return rows;
  } catch {
    return null;
  }
}

type DashboardStatsPayload = {
  totalContainers: number;
  totalCompanies: number;
  sectionCounts: Record<string, number>;
  statusCountsBySection: Record<string, Record<string, number>>;
};

async function loadDashboardStatsFromShipments(): Promise<DashboardStatsPayload> {
  const trackingRows = await loadTrackingSnapshotRows();
  if (trackingRows) {
    const sectionCounts = Object.fromEntries(SECTION_MAP.map((section) => [section.label, 0])) as Record<string, number>;
    const statusCountsBySection = Object.fromEntries(
      SECTION_MAP.map((section) => [section.label, {} as Record<string, number>]),
    ) as Record<string, Record<string, number>>;
    const companyKeys = new Set<string>();

    for (const row of trackingRows) {
      const sectionLabel = sectionLabelForShipment({ status: row.status, extraFields: row.extraFields });
      const matchedSection = SECTION_MAP.find((section) => section.label === sectionLabel);
      if (!matchedSection) continue;

      sectionCounts[matchedSection.label] += 1;
      statusCountsBySection[matchedSection.label][row.status] = (statusCountsBySection[matchedSection.label][row.status] ?? 0) + 1;
      companyKeys.add(row.consignee.trim().toLowerCase());
    }

    return {
      totalContainers: trackingRows.length,
      totalCompanies: companyKeys.size,
      sectionCounts,
      statusCountsBySection,
    };
  }

  const sectionCounts = Object.fromEntries(SECTION_MAP.map((section) => [section.label, 0])) as Record<string, number>;
  const statusCountsBySection = Object.fromEntries(
    SECTION_MAP.map((section) => [section.label, {} as Record<string, number>]),
  ) as Record<string, Record<string, number>>;
  const companyKeys = new Set<string>();
  const shipments = await db
    .select({
      companyName: shipmentsTable.companyName,
      consignee: shipmentsTable.consignee,
      status: shipmentsTable.status,
      extraFields: shipmentsTable.extraFields,
    })
    .from(shipmentsTable)
    .where(activeShipmentSql);

  let totalContainers = 0;
  for (const shipment of shipments) {
    if (isIgnoredShipmentStatus(shipment.status)) continue;
    const matchedSection = SECTION_MAP.find((section) => section.label === sectionLabelForShipment(shipment));
    if (!matchedSection) continue;

    totalContainers += 1;
    sectionCounts[matchedSection.label] += 1;
    statusCountsBySection[matchedSection.label][shipment.status] = (statusCountsBySection[matchedSection.label][shipment.status] ?? 0) + 1;

    const companyKey = String(shipment.consignee ?? shipment.companyName ?? "").trim().toLowerCase();
    if (companyKey) {
      companyKeys.add(companyKey);
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
  const shipmentStats = await loadDashboardStatsFromShipments();

  const [latestUpload] = await db
    .select({ uploadedAt: uploadsTable.uploadedAt })
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.uploadedAt))
    .limit(1);

  res.json({
    totalCompanies: shipmentStats.totalCompanies,
    totalContainers: shipmentStats.totalContainers,
    inTransit: 0,
    delivered: 0,
    awaitingClearance: 0,
    atPort: 0,
    delayed: 0,
    sectionCounts: SECTION_MAP.map((section) => ({
      label: section.label,
      count: shipmentStats.sectionCounts[section.label] ?? 0,
    })),
    latestUpload: latestUpload?.uploadedAt?.toISOString() ?? null,
  });
});

router.get("/stats/operational-alerts", requireAuth, async (_req, res) => {
  const today = startOfDay(new Date());
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 15);

  const trackingRows = await loadTrackingSnapshotRows();
  if (trackingRows) {
    const rows = trackingRows.map((row, index) => ({
      id: index + 1,
      status: row.status,
      containerNo: row.containerNo,
      shipper: row.shipper,
      consignee: row.consignee,
      cargoDescription: row.cargoDescription,
      invoiceNo: row.invoiceNo,
      mraRef: row.mraRef,
      entry: row.entry,
      docs: row.docs,
      extraFields: row.extraFields,
    }));

    const mapBase = (shipment: typeof rows[number]) => ({
      id: shipment.id,
      identifier: shipmentIdentifier({ containerNo: shipment.containerNo, extraFields: shipment.extraFields }),
      consignee: shipment.consignee || "N/A",
      shipper: shipment.shipper || "N/A",
      cargoDescription: shipment.cargoDescription || "N/A",
      invoiceNo: shipment.invoiceNo || "N/A",
    });

    const nearbyConsignments = rows
      .map((shipment) => ({ shipment, etaDate: parseEtaDate(shipment.status, today) }))
      .filter(({ etaDate }) => etaDate && etaDate >= today && etaDate <= maxDate)
      .sort((a, b) => a.etaDate!.getTime() - b.etaDate!.getTime())
      .map(({ shipment, etaDate }) => ({
        ...mapBase(shipment),
        eta: etaDate!.toISOString(),
        status: shipment.status,
      }));

    const needsChecking = rows
      .filter((shipment) => isMeaningfulValue(shipment.mraRef) && !isMeaningfulValue(shipment.entry))
      .map((shipment) => ({
        ...mapBase(shipment),
        mraRef: shipment.mraRef || "N/A",
      }));

    const documentsNeeded = rows
      .filter((shipment) => {
        const section = sectionLabelForShipment({ status: shipment.status, extraFields: shipment.extraFields });
        if (section !== "SHIPMENTS ON SEA") return false;
        const docsText = String(shipment.docs ?? "").trim().toLowerCase();
        if (!docsText) return false;
        if (docsText.includes("not submitted")) {
          const etaDate = parseEtaDate(shipment.status, today);
          return Boolean(etaDate && etaDate >= today && etaDate <= maxDate);
        }
        if (docsText.includes("submitted")) return false;
        const etaDate = parseEtaDate(shipment.status, today);
        return false;
      })
      .map((shipment) => ({
        ...mapBase(shipment),
        eta: parseEtaDate(shipment.status, today)?.toISOString(),
        status: shipment.status,
      }));

    const mraRefNeeded = rows
      .filter((shipment) => {
        if (isMeaningfulValue(shipment.mraRef)) return false;
        const section = sectionLabelForShipment({ status: shipment.status, extraFields: shipment.extraFields });
        return section === "SHIPMENTS ENROUTE" || section === "SHIPMENTS IN MALAWI";
      })
      .map((shipment) => ({
        ...mapBase(shipment),
        status: shipment.status,
      }));

    res.json({ nearbyConsignments, needsChecking, documentsNeeded, mraRefNeeded });
    return;
  }

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
    .where(activeShipmentSql);

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
    .filter((shipment) => isMeaningfulValue(shipment.mraRef) && !isMeaningfulValue(shipment.entry))
    .map((shipment) => ({
      ...mapBase(shipment),
      mraRef: shipment.mraRef || "N/A",
    }));

  const documentsNeeded = shipments
    .filter((shipment) => {
      const docsFlag = extraValue(shipment.extraFields, "Needs Documents", "needsDocuments", "Docs", "docs");
      return (docsFlag.toLowerCase() === "true" || isMeaningfulValue(docsFlag)) && isWithinWindow(shipment);
    })
    .map((shipment) => ({
      ...mapBase(shipment),
      eta: parseEtaDate(shipment.status, today)?.toISOString(),
      status: shipment.status,
    }));

  const mraRefNeeded = shipments
    .filter((shipment) => {
      if (isMeaningfulValue(shipment.mraRef)) return false;
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
  const shipmentStats = await loadDashboardStatsFromShipments();
  res.json(SECTION_MAP.map((section) => ({
    status: section.label,
    count: shipmentStats.sectionCounts[section.label] ?? 0,
    details: Object.entries(shipmentStats.statusCountsBySection[section.label] ?? {})
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

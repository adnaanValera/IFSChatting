import { Router } from "express";
import { db, shipmentsTable, companiesTable, uploadsTable } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const SECTION_MAP: { label: string; statuses: string[] }[] = [
  { label: "SHIPMENTS IN MALAWI", statuses: ["Delivered", "Awaiting Clearance"] },
  { label: "SHIPMENTS ENROUTE", statuses: ["In Transit", "Enroute LLW", "Enroute BLZ", "Enroute"] },
  { label: "SHIPMENTS AT POD", statuses: ["At Port", "Offloading", "Offloaded"] },
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

  const wordDate = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{2,4}))?\b/);
  if (wordDate?.[1] && wordDate[2]) {
    const month = monthNames[wordDate[2].toLowerCase()];
    if (month !== undefined) {
      const hasYear = Boolean(wordDate[3]);
      const year = hasYear ? normalizeYear(wordDate[3]!) : now.getFullYear();
      const parsed = new Date(year, month, Number(wordDate[1]));
      if (!hasYear && parsed < startOfDay(now)) parsed.setFullYear(parsed.getFullYear() + 1);
      return parsed;
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

router.get("/stats/dashboard", requireAuth, async (_req, res) => {
  const [companiesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(companiesTable);
  const [shipmentsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(shipmentsTable);

  const statusCounts = await db
    .select({ status: shipmentsTable.status, count: sql<number>`count(*)::int` })
    .from(shipmentsTable)
    .groupBy(shipmentsTable.status);

  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));
  const sectionCounts = Object.fromEntries(SECTION_MAP.map((section) => [section.label, 0]));
  const sectionRows = await db
    .select({ status: shipmentsTable.status, extraFields: shipmentsTable.extraFields })
    .from(shipmentsTable);

  for (const shipment of sectionRows) {
    const label = sectionLabelForShipment(shipment);
    if (label in sectionCounts) sectionCounts[label] += 1;
  }

  const [latestUpload] = await db
    .select({ uploadedAt: uploadsTable.uploadedAt })
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.uploadedAt))
    .limit(1);

  res.json({
    totalCompanies: companiesCount?.count ?? 0,
    totalContainers: shipmentsCount?.count ?? 0,
    inTransit: counts["In Transit"] ?? 0,
    delivered: counts["Delivered"] ?? 0,
    awaitingClearance: counts["Awaiting Clearance"] ?? 0,
    atPort: counts["At Port"] ?? 0,
    delayed: counts["Delayed"] ?? 0,
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
    .from(shipmentsTable);

  const mapBase = (shipment: typeof shipments[number]) => ({
    id: shipment.id,
    identifier: shipmentIdentifier(shipment),
    consignee: shipment.consignee || "N/A",
    shipper: shipment.shipper || "N/A",
    cargoDescription: shipment.cargoDescription || "N/A",
    invoiceNo: shipment.invoiceNo || "N/A",
  });

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

  res.json({ nearbyConsignments, needsChecking });
});

router.get("/stats/status-breakdown", requireAuth, async (_req, res) => {
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
    .from(shipmentsTable);

  for (const shipment of shipments) {
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
    res.json([]);
    return;
  }

  const items = await db
    .select({
      id: shipmentsTable.id,
      ifsRef: shipmentsTable.ifsRef,
      companyName: shipmentsTable.companyName,
      status: shipmentsTable.status,
      lastUpdated: shipmentsTable.lastUpdated,
      containerNo: shipmentsTable.containerNo,
    })
    .from(shipmentsTable)
    .where(eq(shipmentsTable.uploadBatchId, latestUpload.id))
    .orderBy(desc(shipmentsTable.lastUpdated))
    .limit(10);
  res.json(items);
});

export default router;

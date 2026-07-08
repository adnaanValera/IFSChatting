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

router.get("/stats/status-breakdown", requireAuth, async (_req, res) => {
  const breakdown = await db
    .select({ status: shipmentsTable.status, count: sql<number>`count(*)::int` })
    .from(shipmentsTable)
    .groupBy(shipmentsTable.status)
    .orderBy(desc(sql`count(*)`));
  res.json(breakdown);
});

router.get("/stats/recent-activity", requireAuth, async (_req, res) => {
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
    .orderBy(desc(shipmentsTable.lastUpdated))
    .limit(10);
  res.json(items);
});

export default router;

import { Router } from "express";
import { db, shipmentsTable, companiesTable, uploadsTable } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/stats/dashboard", requireAuth, async (_req, res) => {
  const [companiesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(companiesTable);
  const [shipmentsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(shipmentsTable);

  const statusCounts = await db
    .select({ status: shipmentsTable.status, count: sql<number>`count(*)::int` })
    .from(shipmentsTable)
    .groupBy(shipmentsTable.status);

  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));

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

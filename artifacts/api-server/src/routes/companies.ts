import { Router } from "express";
import { db, companiesTable, shipmentsTable } from "@workspace/db";
import { ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/companies", requireAuth, async (_req, res) => {
  const companies = await db
    .select({
      id: sql<number>`min(${companiesTable.id})`,
      companyName: sql<string>`min(${companiesTable.companyName})`,
      shipmentCount: sql<number>`count(${shipmentsTable.id})::int`,
    })
    .from(companiesTable)
    .leftJoin(shipmentsTable, sql`lower(${companiesTable.companyName}) = lower(${shipmentsTable.companyName})`)
    .groupBy(sql`lower(${companiesTable.companyName})`)
    .orderBy(sql`min(${companiesTable.companyName})`);
  res.json(companies);
});

router.get("/companies/search", requireAuth, async (req, res) => {
  const q = (req.query.q as string) ?? "";
  if (!q) { res.json([]); return; }
  const companies = await db
    .select({
      id: sql<number>`min(${companiesTable.id})`,
      companyName: sql<string>`min(${companiesTable.companyName})`,
      shipmentCount: sql<number>`count(${shipmentsTable.id})::int`,
    })
    .from(companiesTable)
    .leftJoin(shipmentsTable, sql`lower(${companiesTable.companyName}) = lower(${shipmentsTable.companyName})`)
    .where(ilike(companiesTable.companyName, `%${q}%`))
    .groupBy(sql`lower(${companiesTable.companyName})`)
    .orderBy(sql`min(${companiesTable.companyName})`)
    .limit(20);
  res.json(companies);
});

export default router;

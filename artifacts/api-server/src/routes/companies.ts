import { Router } from "express";
import { db, companiesTable, shipmentsTable } from "@workspace/db";
import { ilike, sql, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/companies", requireAuth, async (_req, res) => {
  const companies = await db
    .select({
      id: companiesTable.id,
      companyName: companiesTable.companyName,
      shipmentCount: sql<number>`count(${shipmentsTable.id})::int`,
    })
    .from(companiesTable)
    .leftJoin(shipmentsTable, eq(companiesTable.companyName, shipmentsTable.companyName))
    .groupBy(companiesTable.id)
    .orderBy(companiesTable.companyName);
  res.json(companies);
});

router.get("/companies/search", requireAuth, async (req, res) => {
  const q = (req.query.q as string) ?? "";
  if (!q) { res.json([]); return; }
  const companies = await db
    .select({
      id: companiesTable.id,
      companyName: companiesTable.companyName,
      shipmentCount: sql<number>`count(${shipmentsTable.id})::int`,
    })
    .from(companiesTable)
    .leftJoin(shipmentsTable, eq(companiesTable.companyName, shipmentsTable.companyName))
    .where(ilike(companiesTable.companyName, `%${q}%`))
    .groupBy(companiesTable.id)
    .orderBy(companiesTable.companyName)
    .limit(20);
  res.json(companies);
});

export default router;

import { Router } from "express";
import { db, companiesTable, shipmentsTable } from "@workspace/db";
import { and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

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

router.get("/companies", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user?: { role?: string; companyName?: string | null } };
  const isCustomer = authReq.user?.role === "customer";
  const userCompany = authReq.user?.companyName?.trim();

  let query = db
    .select({
      id: sql<number>`min(${companiesTable.id})`,
      companyName: sql<string>`min(${companiesTable.companyName})`,
      shipmentCount: sql<number>`count(${shipmentsTable.id})::int`,
    })
    .from(companiesTable)
    .innerJoin(shipmentsTable, sql`lower(${companiesTable.companyName}) = lower(${shipmentsTable.companyName}) AND ${activeShipmentSql}`)
    .$dynamic();

  if (isCustomer) {
    if (!userCompany) {
      res.json([]);
      return;
    }
    query = query.where(sql`lower(${companiesTable.companyName}) = lower(${userCompany})`);
  }

  const companies = await query
    .groupBy(sql`lower(${companiesTable.companyName})`)
    .orderBy(sql`min(${companiesTable.companyName})`);

  res.json(companies);
});

router.get("/companies/search", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user?: { role?: string; companyName?: string | null } };
  const q = (req.query.q as string) ?? "";
  if (!q) { res.json([]); return; }
  const isCustomer = authReq.user?.role === "customer";
  const userCompany = authReq.user?.companyName?.trim();
  const conditions = [ilike(companiesTable.companyName, `%${q}%`)];

  if (isCustomer) {
    if (!userCompany) {
      res.json([]);
      return;
    }
    conditions.push(sql`lower(${companiesTable.companyName}) = lower(${userCompany})`);
  }

  const companies = await db
    .select({
      id: sql<number>`min(${companiesTable.id})`,
      companyName: sql<string>`min(${companiesTable.companyName})`,
      shipmentCount: sql<number>`count(${shipmentsTable.id})::int`,
    })
    .from(companiesTable)
    .innerJoin(shipmentsTable, sql`lower(${companiesTable.companyName}) = lower(${shipmentsTable.companyName}) AND ${activeShipmentSql}`)
    .where(and(...conditions))
    .groupBy(sql`lower(${companiesTable.companyName})`)
    .orderBy(sql`min(${companiesTable.companyName})`)
    .limit(20);

  res.json(companies);
});

export default router;

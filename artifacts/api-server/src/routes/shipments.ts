import { Router } from "express";
import { db, shipmentsTable, companiesTable, usersTable } from "@workspace/db";
import { eq, ilike, or, sql, desc, and } from "drizzle-orm";
import { optionalAuth, requireAuth, requireStaff } from "../middlewares/auth";
import type { AuthPayload } from "../middlewares/auth";

// Statuses that are closed/archived — hidden from public tracking
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

function isIgnoredShipmentStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized.includes("completed") || normalized.includes("offloaded") || normalized === "mt" || normalized.startsWith("mt ") || normalized.includes("mt turn");
}

const router = Router();

// ── List shipments ────────────────────────────────────────────────────────────
// Public — no auth required. Authenticated customers are scoped to their company.

router.get("/shipments", optionalAuth, async (req, res) => {
  const authReq = req as typeof req & { user?: AuthPayload };
  const role = authReq.user?.role;
  const userCompany = authReq.user?.companyName;

  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const companyFilter = req.query.companyFilter as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const conditions = [];

  conditions.push(activeShipmentSql);

  // Authenticated customers are locked to their own company — no exceptions
  if (role === "customer" && userCompany) {
    conditions.push(sql`lower(${shipmentsTable.companyName}) = lower(${userCompany})`);
  } else if (companyFilter) {
    conditions.push(sql`lower(${shipmentsTable.companyName}) = lower(${companyFilter})`);
  }

  if (search) {
    conditions.push(
      or(
        ilike(shipmentsTable.ifsRef, `%${search}%`),
        ilike(shipmentsTable.mraRef, `%${search}%`),
        ilike(shipmentsTable.containerNo, `%${search}%`),
        ilike(shipmentsTable.consignee, `%${search}%`),
        ilike(shipmentsTable.shipper, `%${search}%`),
        ilike(shipmentsTable.invoiceNo, `%${search}%`),
      )!
    );
  }

  if (status) {
    conditions.push(eq(shipmentsTable.status, status));
  }

  let query = db.select().from(shipmentsTable).$dynamic();
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(shipmentsTable).$dynamic();

  if (conditions.length === 1) {
    query = query.where(conditions[0]);
    countQuery = countQuery.where(conditions[0]);
  } else if (conditions.length > 1) {
    const combined = and(...conditions)!;
    query = query.where(combined);
    countQuery = countQuery.where(combined);
  }

  const [items, countResult] = await Promise.all([
    query.orderBy(desc(shipmentsTable.lastUpdated)).limit(limit).offset(offset),
    countQuery,
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  res.json({ items, total, page, limit });
});

// ── Create shipment (staff only) ──────────────────────────────────────────────

router.post("/shipments", requireAuth, requireStaff, async (req, res) => {
  const body = req.body;
  const [shipment] = await db.insert(shipmentsTable).values(body).returning();
  await upsertCompany(body.companyName);
  res.status(201).json(shipment);
});

// ── Get single shipment ───────────────────────────────────────────────────────
// Public — anyone with the ID can view it (public tracking page).

router.get("/shipments/:id", optionalAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
  if (!shipment || isIgnoredShipmentStatus(shipment.status)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(shipment);
});

// ── Update shipment (staff only) ─────────────────────────────────────────────

router.patch("/shipments/:id", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [shipment] = await db
    .update(shipmentsTable)
    .set({ ...req.body, lastUpdated: new Date() })
    .where(eq(shipmentsTable.id, id))
    .returning();
  if (!shipment) { res.status(404).json({ error: "Not found" }); return; }
  res.json(shipment);
});

// ── Delete shipment (staff only) ─────────────────────────────────────────────

router.delete("/shipments/:id", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(shipmentsTable).where(eq(shipmentsTable.id, id));
  res.status(204).send();
});

async function upsertCompany(companyName: string) {
  if (!companyName) return;
  await db.insert(companiesTable).values({ companyName }).onConflictDoNothing();
}

export default router;

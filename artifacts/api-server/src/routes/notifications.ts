import { Router, Request } from "express";
import { db, notificationsTable, sessionsTable, shipmentsTable, usersTable } from "@workspace/db";
import { eq, and, desc, gt, isNull, inArray, sql } from "drizzle-orm";
import { requireAuth, AuthPayload } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";

const router = Router();

type AuthReq = Request & { user: AuthPayload };

function cronAuthorized(req: Request): boolean {
  const configured = process.env.CRON_SECRET?.trim();
  if (!configured) return false;
  const authHeader = req.get("authorization")?.trim() || "";
  return authHeader === `Bearer ${configured}`;
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

function isMeaningfulValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "n/a" && normalized !== "na" && normalized !== "-");
}

function extraValue(extraFields: unknown, ...keys: string[]): string {
  const extra = (extraFields as Record<string, unknown>) ?? {};
  for (const key of keys) {
    const value = extra[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function normalizeYear(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return new Date().getFullYear();
  return value.length === 2 ? 2000 + numeric : numeric;
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
    if (month !== undefined) return buildDate(wordDate[1], month, wordDate[3]);
  }

  const monthFirstDate = raw.match(/\b([A-Za-z]+)(?:\s|[-/])+\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s|[-/])*(\d{2,4})?\b/i);
  if (monthFirstDate?.[1] && monthFirstDate[2]) {
    const month = monthNames[monthFirstDate[1].toLowerCase()];
    if (month !== undefined) return buildDate(monthFirstDate[2], month, monthFirstDate[3]);
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

router.get("/notifications", requireAuth, async (req, res) => {
  const { userId } = (req as AuthReq).user;
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(rows);
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const { userId } = (req as AuthReq).user;
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .update(notificationsTable)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.status(204).send();
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const { userId } = (req as AuthReq).user;
  await db
    .update(notificationsTable)
    .set({ read: true, readAt: new Date() })
    .where(eq(notificationsTable.userId, userId));
  res.status(204).send();
});

router.get("/notifications/remind-unread", async (req, res) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const activeCustomerUsers = await db
    .selectDistinct({ userId: usersTable.id })
    .from(usersTable)
    .innerJoin(sessionsTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(usersTable.role, "customer"),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    );

  const activeUserIds = activeCustomerUsers.map((row) => row.userId);
  if (activeUserIds.length === 0) {
    res.json({ ok: true, remindedUsers: 0, pushedNotifications: 0 });
    return;
  }

  const unreadNotifications = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.userId, activeUserIds),
        eq(notificationsTable.read, false),
      ),
    )
    .orderBy(desc(notificationsTable.createdAt));

  const unreadByUser = new Map<number, typeof unreadNotifications>();
  for (const notification of unreadNotifications) {
    unreadByUser.set(notification.userId, [...(unreadByUser.get(notification.userId) ?? []), notification]);
  }

  let remindedUsers = 0;
  let pushedNotifications = 0;

  for (const [userId, notifications] of unreadByUser.entries()) {
    if (!notifications.length) continue;
    remindedUsers += 1;
    const newest = notifications[0]!;
    const shipmentChanges = notifications.filter((notification) => notification.notificationType === "shipment_change").length;
    const newShipments = notifications.filter((notification) => notification.notificationType === "new_shipment").length;
    const announcements = notifications.filter((notification) => notification.notificationType === "announcement").length;
    const others = notifications.length - shipmentChanges - newShipments - announcements;

    const parts = [
      shipmentChanges > 0 ? `${shipmentChanges} change${shipmentChanges === 1 ? "" : "s"}` : null,
      newShipments > 0 ? `${newShipments} new shipment${newShipments === 1 ? "" : "s"}` : null,
      announcements > 0 ? `${announcements} announcement${announcements === 1 ? "" : "s"}` : null,
      others > 0 ? `${others} update${others === 1 ? "" : "s"}` : null,
    ].filter(Boolean);

    const summaryText = parts.length > 0
      ? `You have ${parts.join(", ")} waiting.`
      : `You have ${notifications.length} unread notification${notifications.length === 1 ? "" : "s"}.`;

    await sendPushToUser(userId, {
      title: "Unread notifications",
      body: summaryText,
      url: newest.actionUrl || "/dashboard",
      tag: `reminder-summary-${userId}`,
      iconType: newest.iconType || undefined,
      referenceText: newest.referenceText || undefined,
      detailText: summaryText,
      notificationType: "reminder_summary",
    });
    pushedNotifications += 1;
  }

  res.json({ ok: true, remindedUsers, pushedNotifications });
});

router.get("/notifications/remind-documents", async (req, res) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const today = startOfDay(new Date());
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 15);

  const shipments = await db
    .select()
    .from(shipmentsTable)
    .where(activeShipmentSql)
    .orderBy(desc(shipmentsTable.lastUpdated));

  const documentsNeeded = shipments
    .map((shipment) => ({ shipment, etaDate: parseEtaDate(String(shipment.status ?? ""), today) }))
    .filter(({ shipment, etaDate }) => {
      const docsFlag = extraValue(shipment.extraFields, "Needs Documents", "needsDocuments", "Docs", "docs");
      return (docsFlag.toLowerCase() === "true" || isMeaningfulValue(docsFlag)) && Boolean(etaDate && etaDate >= today && etaDate <= maxDate);
    })
    .sort((a, b) => a.etaDate!.getTime() - b.etaDate!.getTime());

  if (documentsNeeded.length === 0) {
    res.json({ ok: true, recipients: 0, pushedNotifications: 0, matchingShipments: 0 });
    return;
  }

  const activeStaffUsers = await db
    .selectDistinct({ userId: usersTable.id })
    .from(usersTable)
    .innerJoin(sessionsTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        inArray(usersTable.role, ["staff", "admin"]),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    );

  const recipientIds = activeStaffUsers.map((row) => row.userId);
  if (recipientIds.length === 0) {
    res.json({ ok: true, recipients: 0, pushedNotifications: 0, matchingShipments: documentsNeeded.length });
    return;
  }

  const first = documentsNeeded[0]!;
  const identifier = String(
    (first.shipment.extraFields as Record<string, unknown> | null)?.["BL / Manifest No."] ??
    (first.shipment.extraFields as Record<string, unknown> | null)?.["BL/Manifest No."] ??
    first.shipment.containerNo ??
    first.shipment.ifsRef ??
    "N/A",
  );
  const summaryText = `${documentsNeeded.length} consignment${documentsNeeded.length === 1 ? "" : "s"} need documents within 15 days.`;
  const detailText = `${identifier}${documentsNeeded.length > 1 ? ` +${documentsNeeded.length - 1} more` : ""}`;

  await db.insert(notificationsTable).values(
    recipientIds.map((userId) => ({
      userId,
      title: "Documents Required",
      message: summaryText,
      ifsRef: first.shipment.ifsRef,
      companyName: first.shipment.companyName,
      status: first.shipment.status,
      notificationType: "documents_required",
      iconType: "announcement",
      referenceText: detailText,
      detailText: summaryText,
      actionUrl: "/staff/dashboard",
    })),
  );

  await Promise.all(recipientIds.map((userId) =>
    sendPushToUser(userId, {
      title: "Documents Required",
      body: summaryText,
      url: "/staff/dashboard",
      tag: `documents-required-${today.toISOString().slice(0, 10)}-${userId}`,
      iconType: "announcement",
      referenceText: detailText,
      detailText: summaryText,
      notificationType: "documents_required",
    }),
  ));

  res.json({ ok: true, recipients: recipientIds.length, pushedNotifications: recipientIds.length, matchingShipments: documentsNeeded.length });
});

export default router;

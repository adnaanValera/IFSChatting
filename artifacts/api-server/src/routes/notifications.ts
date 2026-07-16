import { Router, Request } from "express";
import { db, notificationsTable, sessionsTable, usersTable } from "@workspace/db";
import { eq, and, desc, gt, isNull, inArray } from "drizzle-orm";
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

export default router;

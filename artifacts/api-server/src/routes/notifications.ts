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
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.status(204).send();
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const { userId } = (req as AuthReq).user;
  await db
    .update(notificationsTable)
    .set({ read: true })
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

    for (const notification of notifications.slice(0, 20)) {
      await sendPushToUser(userId, {
        title: notification.title,
        body: notification.notificationType === "shipment_change"
          ? "Tap to view more."
          : notification.notificationType === "new_shipment"
            ? "Tap to view."
            : notification.detailText || notification.message,
        url: notification.actionUrl || "/dashboard",
        tag: `reminder-${notification.id}`,
        iconType: notification.iconType || undefined,
        referenceText: notification.referenceText || undefined,
        detailText: notification.detailText || undefined,
        notificationType: notification.notificationType || undefined,
      });
      pushedNotifications += 1;
    }
  }

  res.json({ ok: true, remindedUsers, pushedNotifications });
});

export default router;

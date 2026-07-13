import { Router } from "express";
import { db, announcementsTable, notificationsTable, usersTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAuth, requireStaff } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";

const router = Router();

function parseTargetIds(value?: string | null): number[] {
  return String(value ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
}

router.get("/announcements/current", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number } };
  const announcements = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.active, true))
    .orderBy(desc(announcementsTable.updatedAt))
    .limit(20);
  const announcement = announcements.find((item) => item.audience === "all" || parseTargetIds(item.targetUserIds).includes(authReq.user.userId));
  res.json(announcement ?? null);
});

router.get("/staff/announcements/current", requireAuth, requireStaff, async (_req, res) => {
  const [announcement] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.active, true))
    .orderBy(desc(announcementsTable.updatedAt))
    .limit(1);
  res.json(announcement ?? null);
});

router.get("/staff/announcement-customers", requireAuth, requireStaff, async (_req, res) => {
  const customers = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      companyName: usersTable.companyName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "customer"));
  res.json(customers);
});

router.put("/staff/announcements/current", requireAuth, requireStaff, async (req, res) => {
  const { title, message, active = true, targetAll = true, targetUserIds = [] } = req.body as {
    title?: string; message?: string; active?: boolean; targetAll?: boolean; targetUserIds?: number[];
  };
  const cleanTitle = String(title ?? "").trim();
  const cleanMessage = String(message ?? "").trim();
  const parsedTargetIds = Array.isArray(targetUserIds)
    ? targetUserIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];

  await db.update(announcementsTable).set({ active: false, updatedAt: new Date() });

  if (!active || !cleanTitle || !cleanMessage || (!targetAll && parsedTargetIds.length === 0)) {
    res.json(null);
    return;
  }

  const [announcement] = await db
    .insert(announcementsTable)
    .values({
      title: cleanTitle,
      message: cleanMessage,
      active: true,
      audience: targetAll ? "all" : "selected",
      targetUserIds: targetAll ? null : parsedTargetIds.join(","),
    })
    .returning();

  const customers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(targetAll ? eq(usersTable.role, "customer") : inArray(usersTable.id, parsedTargetIds));

  if (customers.length > 0) {
    await db.insert(notificationsTable).values(
      customers.map(({ id: userId }) => ({
        userId,
        title: cleanTitle,
        message: cleanMessage,
        companyName: "InterFreight Solutions",
        status: "Announcement",
      })),
    );

    await Promise.all(customers.map(({ id: userId }) =>
      sendPushToUser(userId, {
        title: cleanTitle,
        body: cleanMessage,
        url: "/dashboard",
        tag: `announcement-${announcement.id}`,
      }),
    ));
  }

  res.json(announcement);
});

export default router;

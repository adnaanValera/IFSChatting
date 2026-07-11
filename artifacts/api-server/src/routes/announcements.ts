import { Router } from "express";
import { db, announcementsTable, notificationsTable, usersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";

const router = Router();

router.get("/announcements/current", requireAuth, async (_req, res) => {
  const [announcement] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.active, true))
    .orderBy(desc(announcementsTable.updatedAt))
    .limit(1);
  res.json(announcement ?? null);
});

router.put("/staff/announcements/current", requireAuth, requireAdmin, async (req, res) => {
  const { title, message, active = true } = req.body as { title?: string; message?: string; active?: boolean };
  const cleanTitle = String(title ?? "").trim();
  const cleanMessage = String(message ?? "").trim();

  await db.update(announcementsTable).set({ active: false, updatedAt: new Date() });

  if (!active || !cleanTitle || !cleanMessage) {
    res.json(null);
    return;
  }

  const [announcement] = await db
    .insert(announcementsTable)
    .values({ title: cleanTitle, message: cleanMessage, active: true })
    .returning();

  const customers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "customer"));

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

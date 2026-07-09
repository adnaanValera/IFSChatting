import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";

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
  res.json(announcement);
});

export default router;

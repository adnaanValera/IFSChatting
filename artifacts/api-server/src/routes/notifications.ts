import { Router, Request } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, AuthPayload } from "../middlewares/auth";

const router = Router();

type AuthReq = Request & { user: AuthPayload };

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

export default router;

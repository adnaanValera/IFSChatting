import { Router } from "express";
import { db, feedbackTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireAuth, requireStaff } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";

const router = Router();

// ── Submit feedback (public) ──────────────────────────────────────────────────

router.post("/feedback", async (req, res) => {
  const { name, email, company, phoneNumber, message } = req.body as {
    name?: string; email?: string; company?: string; phoneNumber?: string; message?: string;
  };

  if (!name?.trim() || !email?.trim() || !phoneNumber?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Name, email, phone number, and message are all required" });
    return;
  }

  const [row] = await db
    .insert(feedbackTable)
    .values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: company?.trim() || null,
      phoneNumber: phoneNumber.trim(),
      source: "public",
      message: message.trim(),
    })
    .returning();

  const staffAndAdmins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, ["admin", "staff"]));

  const targets = staffAndAdmins.filter((user) => user.id);
  if (targets.length > 0) {
    await db.insert(notificationsTable).values(
      targets.map(({ id: userId }) => ({
        userId,
        title: "New Contact Message",
        message: `${name.trim()} sent a website message and left ${phoneNumber.trim()}.`,
        companyName: company?.trim() || "Website Contact",
        status: "Contact Message",
      })),
    );
    await Promise.all(targets.map(({ id: userId }) =>
      sendPushToUser(userId, {
        title: "New Contact Message",
        body: `${name.trim()} sent a website message.`,
        url: "/staff/dashboard",
        tag: `contact-message-${row.id}`,
      }),
    ));
  }

  res.status(201).json({ id: row.id, message: "Message sent successfully" });
});

// ── List all feedback (staff+) ────────────────────────────────────────────────

router.get("/staff/feedback", requireAuth, requireStaff, async (_req, res) => {
  const rows = await db
    .select()
    .from(feedbackTable)
    .where(eq(feedbackTable.source, "public"))
    .orderBy(desc(feedbackTable.createdAt));
  res.json(rows);
});

// ── Mark read / send reply (staff+) ──────────────────────────────────────────

router.patch("/staff/feedback/:id", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { replyText, status } = req.body as { replyText?: string; status?: string };

  const updateData: Record<string, unknown> = {};
  if (status) updateData["status"] = status;
  if (replyText !== undefined) {
    updateData["replyText"] = replyText.trim() || null;
    updateData["repliedAt"] = replyText.trim() ? new Date() : null;
    if (replyText.trim()) updateData["status"] = "replied";
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [updated] = await db
    .update(feedbackTable)
    .set(updateData)
    .where(eq(feedbackTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── Delete feedback (staff+) ──────────────────────────────────────────────────

router.delete("/staff/feedback/:id", requireAuth, requireStaff, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(feedbackTable).where(eq(feedbackTable.id, id));
  res.status(204).send();
});

export default router;

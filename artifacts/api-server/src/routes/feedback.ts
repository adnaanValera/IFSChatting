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
      category: "general",
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
        title: "InterFreight Alert: New Message",
        body: `${name.trim()} sent a website message. Tap to open messages.`,
        url: "/staff/dashboard",
        tag: `contact-message-${row.id}`,
      }),
    ));
  }

  res.status(201).json({ id: row.id, message: "Message sent successfully" });
});

router.post("/customer/problems", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number; email: string; companyName: string; role: string } };
  const { category, message } = req.body as {
    category?: string;
    message?: string;
  };

  const normalizedCategory = String(category ?? "").trim().toLowerCase();
  const allowedCategories = new Set(["notification", "glitch", "other"]);

  if (!allowedCategories.has(normalizedCategory)) {
    res.status(400).json({ error: "Problem type must be Notification, Glitch, or Other" });
    return;
  }

  if (!message?.trim()) {
    res.status(400).json({ error: "Please describe the problem" });
    return;
  }

  const staffAndAdmins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, ["admin", "staff"]));

  const [customer] = await db
    .select({
      fullName: usersTable.fullName,
      email: usersTable.email,
      phoneNumber: usersTable.phoneNumber,
      companyName: usersTable.companyName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.user.userId))
    .limit(1);

  if (!customer) {
    res.status(404).json({ error: "Customer account not found" });
    return;
  }

  const prettyCategory = normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1);

  const [row] = await db
    .insert(feedbackTable)
    .values({
      name: customer.fullName,
      email: customer.email.toLowerCase(),
      company: customer.companyName || authReq.user.companyName || null,
      phoneNumber: customer.phoneNumber || null,
      source: "customer_problem",
      category: normalizedCategory,
      message: message.trim(),
    })
    .returning();

  const targets = staffAndAdmins.filter((user) => user.id);
  if (targets.length > 0) {
    await db.insert(notificationsTable).values(
      targets.map(({ id: userId }) => ({
        userId,
        title: "New Customer Problem",
        message: `${customer.fullName} reported a ${prettyCategory.toLowerCase()} problem.`,
        companyName: customer.companyName || authReq.user.companyName || "Customer Dashboard",
        status: `Problem: ${prettyCategory}`,
      })),
    );

    await Promise.all(targets.map(({ id: userId }) =>
      sendPushToUser(userId, {
        title: "InterFreight Alert: Customer Problem",
        body: `${customer.fullName} reported a ${prettyCategory.toLowerCase()} problem. Tap to open problems.`,
        url: "/staff/dashboard?tab=problems",
        tag: `customer-problem-${row.id}`,
      }),
    ));
  }

  res.status(201).json({ id: row.id, message: "Problem sent successfully" });
});

// ── List all feedback (staff+) ────────────────────────────────────────────────

router.get("/staff/feedback", requireAuth, requireStaff, async (_req, res) => {
  const rows = await db
    .select()
    .from(feedbackTable)
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

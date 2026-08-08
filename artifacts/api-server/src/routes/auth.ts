import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db, notificationsTable, pendingSignupsTable, sessionsTable, usersTable } from "@workspace/db";
import { eq, ilike, inArray } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/auth";
import { sendPushToUser, transferPendingPushSubscriptionsToUser } from "../lib/push";

const router = Router();

function roleFromCompanyName(companyName: string): "admin" | "staff" | "customer" {
  const value = companyName.trim().toLowerCase();
  if (value === "m@h0medab00") return "admin";
  if (value === "!nterfre1g#t") return "staff";
  return "customer";
}

const SESSION_DAYS = 30;
const ADMIN_SESSION_DAYS = 3650;
const ALLOWED_SESSION_DAYS = new Set([1, 7, 30, 90, 180]);
const TEAM_SESSION_DAYS = 1;

function slugifyFullName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ifs-team";
}

function sessionDaysFromInput(value: unknown): number {
  if (value === "browser") return 1;
  const days = Number(value);
  return ALLOWED_SESSION_DAYS.has(days) ? days : SESSION_DAYS;
}

async function createDeviceSession(user: typeof usersTable.$inferSelect, userAgent?: string, sessionDays = SESSION_DAYS): Promise<string> {
  const tokenId = randomUUID();
  const days = user.role === "admin" ? ADMIN_SESSION_DAYS : sessionDays;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({
    userId: user.id,
    tokenId,
    userAgent: userAgent?.slice(0, 300),
    expiresAt,
  });

  return signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyName: user.companyName,
    tokenId,
  });
}

async function notifyStaffAndAdminsOfPendingSignup(args: {
  fullName: string;
  companyName: string;
  email: string;
  role: "admin" | "staff" | "customer";
}): Promise<void> {
  const reviewers = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.role, ["admin", "staff"]));

  if (reviewers.length === 0) return;

  await db.insert(notificationsTable).values(
    reviewers.map(({ id: userId, role }) => ({
      userId,
      title: "Signup Waiting Approval",
      message: `${args.fullName} from ${args.companyName} is waiting for approval. (${args.email})`,
      companyName: args.companyName,
      status: role === "admin" ? "Admin review" : "Staff review",
    })),
  );

  await Promise.all(reviewers.map(({ id: userId }) =>
    sendPushToUser(userId, {
      title: "InterFreight Alert: Approval Needed",
      body: `${args.fullName} from ${args.companyName} is waiting for approval. Tap to review.`,
      url: "/staff/dashboard",
      tag: `pending-signup-${args.email.toLowerCase()}-${Date.now()}`,
    }),
  ));
}

// ── Register ──────────────────────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  const { fullName, companyName, email, phoneNumber, password } = req.body as {
    fullName?: string; companyName?: string; email?: string; phoneNumber?: string; password?: string;
  };

  if (!fullName?.trim() || !companyName?.trim() || !email?.trim() || !phoneNumber?.trim() || !password) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  // Check for duplicate email
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(ilike(usersTable.email, email.trim()))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const role = roleFromCompanyName(companyName);
  const passwordHash = await bcrypt.hash(password, 12);
  const approvalToken = randomUUID();

  const [pending] = await db
    .select()
    .from(pendingSignupsTable)
    .where(ilike(pendingSignupsTable.email, email.trim()))
    .limit(1);

  if (pending?.status === "pending") {
    await db
      .update(pendingSignupsTable)
      .set({ approvalToken })
      .where(eq(pendingSignupsTable.id, pending.id));
    await notifyStaffAndAdminsOfPendingSignup({
      fullName: pending.fullName,
      companyName: pending.companyName,
      email: pending.email,
      role: pending.role as "admin" | "staff" | "customer",
    });
    res.status(202).json({
      status: "pending",
      approvalToken,
      email: email.trim().toLowerCase(),
      message: "Your signup is waiting for staff approval.",
    });
    return;
  }

  if (pending?.status === "rejected") {
    res.status(403).json({ status: "rejected", error: "Your signup request was rejected. Please contact InterFreight Solutions." });
    return;
  }

  if (role !== "admin") {
    if (pending) {
      await db
        .update(pendingSignupsTable)
        .set({
          fullName: fullName.trim(),
          companyName: companyName.trim(),
          phoneNumber: phoneNumber.trim(),
          profilePictureUrl: null,
          approvalToken,
          passwordHash,
          role,
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
        })
        .where(eq(pendingSignupsTable.id, pending.id));
    } else {
      await db
        .insert(pendingSignupsTable)
        .values({
          fullName: fullName.trim(),
          companyName: companyName.trim(),
          email: email.trim().toLowerCase(),
          phoneNumber: phoneNumber.trim(),
          profilePictureUrl: null,
          approvalToken,
          passwordHash,
          role,
          status: "pending",
        });
    }

    await notifyStaffAndAdminsOfPendingSignup({
      fullName: fullName.trim(),
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      role,
    });

    res.status(202).json({
      status: "pending",
      approvalToken,
      email: email.trim().toLowerCase(),
      message: "Your signup request has been sent. Please wait for staff approval.",
    });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      fullName: fullName.trim(),
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      passwordHash,
      role,
    })
    .returning();

  await transferPendingPushSubscriptionsToUser(approvalToken, user.id);

  const token = await createDeviceSession(user, req.get("user-agent"), ADMIN_SESSION_DAYS);

  res.status(201).json({
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      companyName: user.companyName,
      station: user.station,
      email: user.email,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
    },
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const { email, password, sessionDays } = req.body as { email?: string; password?: string; sessionDays?: number | string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.email, email.trim()))
    .limit(1);

  if (!user) {
    const [pending] = await db
      .select({ status: pendingSignupsTable.status })
      .from(pendingSignupsTable)
      .where(ilike(pendingSignupsTable.email, email.trim()))
      .limit(1);
    if (pending?.status === "pending") {
      res.status(403).json({ error: "Your signup is still waiting for staff approval." });
      return;
    }
    if (pending?.status === "rejected") {
      res.status(403).json({ error: "Your signup request was rejected. Please contact InterFreight Solutions." });
      return;
    }
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = await createDeviceSession(user, req.get("user-agent"), sessionDaysFromInput(sessionDays));

  res.json({
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      companyName: user.companyName,
      station: user.station,
      email: user.email,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
    },
  });
});

router.post("/auth/team-login", async (req, res) => {
  const { fullName, password, sessionDays } = req.body as { fullName?: string; password?: string; sessionDays?: number | string };
  if (!fullName?.trim() || !password) {
    res.status(400).json({ error: "Full name and password are required" });
    return;
  }

  const normalizedName = fullName.trim();
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.fullName, normalizedName))
    .limit(1);

  if (existingUser) {
    if (existingUser.role !== "staff" && existingUser.role !== "admin") {
      res.status(403).json({ error: "This account is not part of the IFS Team login." });
      return;
    }

    const valid = await bcrypt.compare(password, existingUser.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = await createDeviceSession(existingUser, req.get("user-agent"), sessionDaysFromInput(sessionDays || TEAM_SESSION_DAYS));
    res.json({
      token,
      user: {
        id: existingUser.id,
        fullName: existingUser.fullName,
        companyName: existingUser.companyName,
        station: existingUser.station,
        email: existingUser.email,
        role: existingUser.role,
        profilePictureUrl: existingUser.profilePictureUrl,
      },
      created: false,
    });
    return;
  }

  const syntheticEmail = `${slugifyFullName(normalizedName)}@ifs-team.local`;
  const [pendingTeamSignup] = await db
    .select()
    .from(pendingSignupsTable)
    .where(ilike(pendingSignupsTable.email, syntheticEmail))
    .limit(1);

  if (pendingTeamSignup?.status === "pending") {
    const valid = await bcrypt.compare(password, pendingTeamSignup.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    res.status(202).json({
      status: "pending",
      approvalToken: pendingTeamSignup.approvalToken,
      email: pendingTeamSignup.email,
      message: "Your IFS Team access is waiting for approval.",
    });
    return;
  }

  if (pendingTeamSignup?.status === "rejected") {
    const valid = await bcrypt.compare(password, pendingTeamSignup.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    res.status(403).json({ status: "rejected", error: "Your IFS Team request was rejected. Please contact InterFreight Solutions." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const approvalToken = randomUUID();

  if (pendingTeamSignup) {
    await db
      .update(pendingSignupsTable)
      .set({
        fullName: normalizedName,
        companyName: "!nterFre1g#t",
        phoneNumber: "",
        approvalToken,
        passwordHash,
        role: "staff",
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
      })
      .where(eq(pendingSignupsTable.id, pendingTeamSignup.id));
  } else {
    await db
      .insert(pendingSignupsTable)
      .values({
        fullName: normalizedName,
        companyName: "!nterFre1g#t",
        email: syntheticEmail,
        phoneNumber: "",
        profilePictureUrl: null,
        approvalToken,
        passwordHash,
        role: "staff",
        status: "pending",
      });
  }

  await notifyStaffAndAdminsOfPendingSignup({
    fullName: normalizedName,
    companyName: "!nterFre1g#t",
    email: syntheticEmail,
    role: "staff",
  });

  res.status(202).json({
    status: "pending",
    approvalToken,
    email: syntheticEmail,
    message: "Your IFS Team access is waiting for approval.",
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/auth/logout", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user: { tokenId?: string } };
  if (authReq.user.tokenId) {
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(sessionsTable.tokenId, authReq.user.tokenId));
  }
  res.status(204).send();
});

// ── Me ────────────────────────────────────────────────────────────────────────

router.patch("/auth/session-duration", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number; tokenId?: string } };
  const { sessionDays } = req.body as { sessionDays?: number | string };
  if (!authReq.user.tokenId) {
    res.status(400).json({ error: "This session cannot be updated. Please log in again." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.userId)).limit(1);
  const days = user?.role === "admin" ? ADMIN_SESSION_DAYS : sessionDaysFromInput(sessionDays);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db
    .update(sessionsTable)
    .set({ expiresAt, lastSeenAt: new Date() })
    .where(eq(sessionsTable.tokenId, authReq.user.tokenId));

  res.json({ expiresAt });
});

router.post("/auth/pending-signup/status", async (req, res) => {
  const { approvalToken, sessionDays } = req.body as { approvalToken?: string; sessionDays?: number | string };
  if (!approvalToken) {
    res.status(400).json({ error: "Approval token is required" });
    return;
  }

  const [pending] = await db
    .select()
    .from(pendingSignupsTable)
    .where(eq(pendingSignupsTable.approvalToken, approvalToken))
    .limit(1);

  if (!pending) {
    res.status(404).json({ error: "Signup request not found" });
    return;
  }

  if (pending.status === "rejected") {
    res.status(403).json({ status: "rejected", error: "Your signup request was rejected. Please contact InterFreight Solutions." });
    return;
  }

  if (pending.status !== "approved") {
    res.json({ status: pending.status });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.email, pending.email))
    .limit(1);

  if (!user) {
    res.json({ status: "pending" });
    return;
  }

  const token = await createDeviceSession(user, req.get("user-agent"), sessionDaysFromInput(sessionDays));
  res.json({
    status: "approved",
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      companyName: user.companyName,
      station: user.station,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
    },
  });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number } };
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, authReq.user.userId))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    fullName: user.fullName,
    companyName: user.companyName,
    station: user.station,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    profilePictureUrl: user.profilePictureUrl,
  });
});

router.patch("/auth/station", requireAuth, async (req, res) => {
  const authReq = req as typeof req & { user: { userId: number } };
  const { station } = req.body as { station?: string };
  const allowedStations = new Set(["Blantyre", "Lilongwe", "Mwanza", "Dedza", "Songwe", "Liwonde", "KIA", "Chileka", "Mchinji"]);

  if (!station || !allowedStations.has(station)) {
    res.status(400).json({ error: "Choose a valid station." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, authReq.user.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role !== "staff") {
    res.status(403).json({ error: "Station selection is only required for staff accounts." });
    return;
  }

  if (user.station?.trim()) {
    res.status(409).json({ error: "Station has already been chosen for this account." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ station })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({
    id: updated.id,
    fullName: updated.fullName,
    companyName: updated.companyName,
    station: updated.station,
    email: updated.email,
    phoneNumber: updated.phoneNumber,
    role: updated.role,
    profilePictureUrl: updated.profilePictureUrl,
  });
});

export default router;

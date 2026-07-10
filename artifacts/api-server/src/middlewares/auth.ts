import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";

const _secret = process.env.SESSION_SECRET;
if (!_secret) {
  throw new Error("SESSION_SECRET environment variable is required but not set. Refusing to start.");
}
const JWT_SECRET: string = _secret;

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
  companyName: string;
  tokenId?: string;
}

/** Attaches user if token present, but never blocks the request. */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as AuthPayload;
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);

      if (!user) {
        next();
        return;
      }

      if (payload.tokenId) {
        const [session] = await db
          .select({ id: sessionsTable.id })
          .from(sessionsTable)
          .where(and(
            eq(sessionsTable.tokenId, payload.tokenId),
            eq(sessionsTable.userId, user.id),
            isNull(sessionsTable.revokedAt),
            gt(sessionsTable.expiresAt, new Date()),
          ))
          .limit(1);

        if (!session) {
          next();
          return;
        }
      }

      (req as Request & { user: AuthPayload }).user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        tokenId: payload.tokenId,
      };
    } catch { /* ignore invalid tokens */ }
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User account no longer exists" });
      return;
    }

    if (payload.tokenId) {
      const [session] = await db
        .select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(and(
          eq(sessionsTable.tokenId, payload.tokenId),
          eq(sessionsTable.userId, user.id),
          isNull(sessionsTable.revokedAt),
          gt(sessionsTable.expiresAt, new Date()),
        ))
        .limit(1);

      if (!session) {
        res.status(401).json({ error: "Session expired or logged out" });
        return;
      }

      await db.update(sessionsTable).set({ lastSeenAt: new Date() }).where(eq(sessionsTable.id, session.id));
    }

    (req as Request & { user: AuthPayload }).user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      tokenId: payload.tokenId,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Allows both staff employees and admins (boss). Use for file upload/delete routes. */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  const authReq = req as Request & { user: AuthPayload };
  if (!authReq.user || (authReq.user.role !== "staff" && authReq.user.role !== "admin")) {
    res.status(403).json({ error: "Staff access required" });
    return;
  }
  next();
}

/** Allows only admin (boss). Use for user management and sensitive routes. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authReq = req as Request & { user: AuthPayload };
  if (!authReq.user || authReq.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: payload.role === "admin" ? "10y" : "180d" });
}

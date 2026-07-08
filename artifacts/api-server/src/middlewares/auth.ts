import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
}

/** Attaches user if token present, but never blocks the request. */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as AuthPayload;
      (req as Request & { user: AuthPayload }).user = payload;
    } catch { /* ignore invalid tokens */ }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as Request & { user: AuthPayload }).user = payload;
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenId: text("token_id").notNull().unique(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type Session = typeof sessionsTable.$inferSelect;

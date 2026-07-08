import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  message: text("message").notNull(),
  status: text("status").notNull().default("unread"), // "unread" | "read" | "replied"
  replyText: text("reply_text"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Feedback = typeof feedbackTable.$inferSelect;

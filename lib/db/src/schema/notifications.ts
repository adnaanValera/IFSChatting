import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  ifsRef: text("ifs_ref"),
  companyName: text("company_name"),
  status: text("status"),
  notificationType: text("notification_type"),
  iconType: text("icon_type"),
  referenceText: text("reference_text"),
  detailText: text("detail_text"),
  actionUrl: text("action_url"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;

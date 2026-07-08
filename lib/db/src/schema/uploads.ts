import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const uploadsTable = pgTable("uploads", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  totalRows: integer("total_rows").notNull().default(0),
  newRecords: integer("new_records").notNull().default(0),
  updatedRecords: integer("updated_records").notNull().default(0),
  uploadedBy: text("uploaded_by"),
});

export const insertUploadSchema = createInsertSchema(uploadsTable).omit({ id: true, uploadedAt: true });
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploadsTable.$inferSelect;

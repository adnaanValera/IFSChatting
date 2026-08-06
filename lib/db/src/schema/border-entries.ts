import { pgTable, text, serial, timestamp, integer, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const borderEntriesTable = pgTable("border_entries", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull(),
  arrivedAtBorder: text("arrived_at_border"),
  sdoDate: date("sdo_date"),
  releaseOrderDate: date("release_order_date"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  shipmentUnique: uniqueIndex("border_entries_shipment_id_idx").on(table.shipmentId),
}));

export const insertBorderEntrySchema = createInsertSchema(borderEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBorderEntry = z.infer<typeof insertBorderEntrySchema>;
export type BorderEntry = typeof borderEntriesTable.$inferSelect;

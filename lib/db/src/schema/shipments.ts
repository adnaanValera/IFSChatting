import { pgTable, text, serial, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
  ifsRef: text("ifs_ref").notNull(),
  mraRef: text("mra_ref"),
  containerNo: text("container_no"),
  shipper: text("shipper"),
  consignee: text("consignee"),
  cargoDescription: text("cargo_description"),
  invoiceNo: text("invoice_no"),
  pod: text("pod"),
  entry: text("entry"),
  finalPortDestination: text("final_port_destination"),
  status: text("status").notNull().default("In Transit"),
  companyName: text("company_name").notNull(),
  uploadBatchId: integer("upload_batch_id"),
  extraFields: jsonb("extra_fields"),
  uploadDate: timestamp("upload_date", { withTimezone: true }).notNull().defaultNow(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({ id: true, uploadDate: true, lastUpdated: true });
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;

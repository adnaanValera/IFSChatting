import { pool } from "@workspace/db";
import { logger } from "./logger";

let bootstrapPromise: Promise<void> | null = null;

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      full_name text NOT NULL,
      company_name text NOT NULL DEFAULT '',
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'customer',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS companies (
      id serial PRIMARY KEY,
      company_name text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id serial PRIMARY KEY,
      filename text NOT NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now(),
      total_rows integer NOT NULL DEFAULT 0,
      new_records integer NOT NULL DEFAULT 0,
      updated_records integer NOT NULL DEFAULT 0,
      uploaded_by text,
      file_data bytea,
      mime_type text,
      file_size integer
    );

    ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_data bytea;
    ALTER TABLE uploads ADD COLUMN IF NOT EXISTS mime_type text;
    ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_size integer;

    CREATE TABLE IF NOT EXISTS shipments (
      id serial PRIMARY KEY,
      ifs_ref text NOT NULL,
      mra_ref text,
      container_no text,
      shipper text,
      consignee text,
      cargo_description text,
      invoice_no text,
      pod text,
      entry text,
      final_port_destination text,
      status text NOT NULL DEFAULT 'In Transit',
      company_name text NOT NULL,
      upload_batch_id integer,
      extra_fields jsonb,
      upload_date timestamptz NOT NULL DEFAULT now(),
      last_updated timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS shipment_change_logs (
      id serial PRIMARY KEY,
      shipment_id integer,
      upload_batch_id integer,
      change_type text NOT NULL,
      ifs_ref text NOT NULL,
      company_name text NOT NULL,
      status text,
      changes jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      company text,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'unread',
      reply_text text,
      replied_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      title text NOT NULL,
      message text NOT NULL,
      ifs_ref text,
      company_name text,
      status text,
      read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS report_templates (
      id integer PRIMARY KEY DEFAULT 1,
      content bytea NOT NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT single_report_template CHECK (id = 1)
    );
  `);
}

async function removeOldDefaultAdmin() {
  await pool.query(
    "DELETE FROM users WHERE lower(email) = lower($1) AND role = 'admin'",
    ["admin@interfreight.mw"],
  );
}

export function ensureRuntimeData() {
  bootstrapPromise ??= (async () => {
    await createTables();
    await removeOldDefaultAdmin();
    logger.info("Runtime database bootstrap complete");
  })();

  return bootstrapPromise;
}

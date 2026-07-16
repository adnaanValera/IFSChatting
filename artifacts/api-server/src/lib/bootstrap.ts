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
      phone_number text,
      profile_picture_url text,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'customer',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url text;

    CREATE TABLE IF NOT EXISTS pending_signups (
      id serial PRIMARY KEY,
      full_name text NOT NULL,
      company_name text NOT NULL DEFAULT '',
      email text NOT NULL UNIQUE,
      phone_number text,
      profile_picture_url text,
      approval_token text,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'customer',
      status text NOT NULL DEFAULT 'pending',
      reviewed_by text,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE pending_signups ADD COLUMN IF NOT EXISTS approval_token text;
    ALTER TABLE pending_signups ADD COLUMN IF NOT EXISTS profile_picture_url text;

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
      phone_number text,
      source text NOT NULL DEFAULT 'public',
      category text NOT NULL DEFAULT 'general',
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
      notification_type text,
      icon_type text,
      reference_text text,
      detail_text text,
      action_url text,
      read boolean NOT NULL DEFAULT false,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id serial PRIMARY KEY,
      title text NOT NULL,
      message text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      audience text NOT NULL DEFAULT 'all',
      target_user_ids text,
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      token_id text NOT NULL UNIQUE,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id serial PRIMARY KEY,
      user_id integer,
      approval_token text,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS report_templates (
      id integer PRIMARY KEY DEFAULT 1,
      content bytea NOT NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT single_report_template CHECK (id = 1)
    );
  `);

  await pool.query(`
    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS phone_number text;
    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'public';
    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type text;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS icon_type text;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_text text;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS detail_text text;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url text;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_user_ids text;
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at timestamptz;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id integer;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS approval_token text;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint text;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS p256dh text;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS auth text;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent text;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
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

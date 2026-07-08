import bcrypt from "bcryptjs";
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
      uploaded_by text
    );

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
  `);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? "admin@interfreight.mw";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `
      INSERT INTO users (full_name, company_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `,
    ["Admin", "InterFreight Solutions", email.toLowerCase(), passwordHash, "admin"],
  );
}

export function ensureRuntimeData() {
  bootstrapPromise ??= (async () => {
    await createTables();
    await seedAdmin();
    logger.info("Runtime database bootstrap complete");
  })();

  return bootstrapPromise;
}

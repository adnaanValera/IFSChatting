/**
 * Plain-JS migration — run with:
 *   node migrate.mjs
 * from the lib/db directory (DATABASE_URL must be set).
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── users table ─────────────────────────────────────────────────────────────

    const hasFull = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'full_name'
    `);
    if (hasFull.rowCount === 0) {
      console.log("Renaming users.name → users.full_name ...");
      await client.query(`ALTER TABLE users RENAME COLUMN "name" TO "full_name"`);
    } else {
      console.log("users.full_name already exists — skipping rename");
    }

    const hasUserCompany = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'company_name'
    `);
    if (hasUserCompany.rowCount === 0) {
      console.log("Adding users.company_name ...");
      await client.query(`ALTER TABLE users ADD COLUMN "company_name" text NOT NULL DEFAULT ''`);
    } else {
      console.log("users.company_name already exists — skipping");
    }

    console.log("Updating users.role default to 'customer' ...");
    await client.query(`ALTER TABLE users ALTER COLUMN "role" SET DEFAULT 'customer'`);

    // ── shipments table ──────────────────────────────────────────────────────────

    const hasUploadBatch = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shipments' AND column_name = 'upload_batch_id'
    `);
    if (hasUploadBatch.rowCount === 0) {
      console.log("Adding shipments.upload_batch_id ...");
      await client.query(`ALTER TABLE shipments ADD COLUMN "upload_batch_id" integer`);
    } else {
      console.log("shipments.upload_batch_id already exists — skipping");
    }

    // ── feedback table ───────────────────────────────────────────────────────────

    const hasFeedback = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'feedback'
    `);
    if (hasFeedback.rowCount === 0) {
      console.log("Creating feedback table ...");
      await client.query(`
        CREATE TABLE feedback (
          id         SERIAL PRIMARY KEY,
          name       TEXT NOT NULL,
          email      TEXT NOT NULL,
          message    TEXT NOT NULL,
          status     TEXT NOT NULL DEFAULT 'unread',
          reply_text TEXT,
          replied_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } else {
      console.log("feedback table already exists — skipping");
    }

    // ── feedback.company column ──────────────────────────────────────────────────
    const hasFeedbackCompany = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'feedback' AND column_name = 'company'
    `);
    if (hasFeedbackCompany.rowCount === 0) {
      console.log("Adding feedback.company column ...");
      await client.query(`ALTER TABLE feedback ADD COLUMN company TEXT`);
    } else {
      console.log("feedback.company already exists — skipping");
    }

    await client.query("COMMIT");
    console.log("✅ Migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

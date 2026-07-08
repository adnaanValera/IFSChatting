/**
 * Manual migration script — run with:
 *   npx tsx migrate.ts
 * from the lib/db directory.
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── users table ────────────────────────────────────────────────────────────

    // Rename 'name' → 'full_name' if 'full_name' doesn't already exist
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

    // Add 'company_name' to users if missing
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

    // Update default role from 'staff' → 'customer' in users
    console.log("Updating users.role default to 'customer' ...");
    await client.query(`ALTER TABLE users ALTER COLUMN "role" SET DEFAULT 'customer'`);

    // ── shipments table ────────────────────────────────────────────────────────

    // Add 'upload_batch_id' to shipments if missing
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

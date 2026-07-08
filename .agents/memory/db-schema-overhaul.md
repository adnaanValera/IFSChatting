---
name: DB schema overhaul
description: Changes made to users and shipments tables; how to run future migrations in this project
---

## Rule
drizzle-kit push cannot run non-interactively when columns are renamed (it prompts for rename vs drop+add). Use `node migrate.mjs` from `lib/db/` instead.

**Why:** The Replit shell is non-TTY so drizzle-kit's interactive column-conflict resolver throws "Interactive prompts require a TTY terminal".

**How to apply:** For any future schema change that renames or drops columns, write a raw SQL migration in `lib/db/migrate.mjs` (plain ESM, imports `pg` which is already installed) and run with `node lib/db/migrate.mjs` from the workspace root. For additive-only changes (new tables, new nullable columns), drizzle-kit push --force usually works.

## Schema state after overhaul (2026-07-02)
- **users**: `id, full_name (NOT NULL), company_name (NOT NULL DEFAULT ''), email, password_hash, role (DEFAULT 'customer'), created_at`
- **shipments**: added `upload_batch_id integer` (nullable) — links a shipment to its source upload batch for cascade-delete

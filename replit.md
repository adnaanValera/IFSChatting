# InterFreight Solutions

A premium full-stack website for InterFreight Solutions — a Malawi-based logistics, freight forwarding, customs clearance, and transportation company. Includes a public marketing site, container tracking system, and staff portal for Excel-based shipment management.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/interfreight run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, Framer Motion, Wouter, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (jsonwebtoken + bcryptjs)
- Excel import: ExcelJS + Multer
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` — users, companies, shipments, uploads
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/`
- API routes: `artifacts/api-server/src/routes/` — auth, shipments, companies, stats, staff
- Auth middleware: `artifacts/api-server/src/middlewares/auth.ts`
- Frontend pages: `artifacts/interfreight/src/pages/`
- Excel uploads stored at: `artifacts/api-server/uploads/`

## Architecture decisions

- File upload endpoint (`POST /api/staff/upload`) intentionally excluded from OpenAPI spec — Multer multipart handling generates browser-only `File`/`Blob` types that break Node.js lib typecheck. Frontend calls it via raw fetch with FormData.
- JWT token stored in localStorage as `intf_token`, sent as `Authorization: Bearer <token>`.
- Companies table is auto-populated from `company_name` on shipment insert/upload — no manual company creation needed.
- `extraFields` on shipments is a JSONB column that captures any unknown Excel column headers, making the schema future-proof.
- Body schema naming follows entity-shaped names (e.g. `ShipmentInput`, not `CreateShipmentBody`) to avoid Orval TS2308 collisions.

## Product

- **Marketing site** (`/`): Full-page hero, about section, services grid, animated stat counters, why-choose-us, contact.
- **Container tracking** (`/containers`): Public search by company, IFS ref, MRA ref, container no, invoice no. Results as premium cards with status badges.
- **Container detail** (`/containers/:id`): Full shipment details with animated status progress bar.
- **Staff login** (`/staff/login`): Email/password auth — default: `admin@interfreight.mw` / `admin123`.
- **Staff dashboard** (`/staff/dashboard`): Stats cards, status breakdown, recent activity, upload history, drag-and-drop Excel import.
- **Staff users** (`/staff/users`): User management list.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/db/src/schema/`, run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — otherwise api-server can't see the new table exports.
- After any OpenAPI spec change, always run codegen before testing the frontend.
- The `multipart/form-data` upload endpoint is intentionally NOT in the OpenAPI spec (see Architecture decisions).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

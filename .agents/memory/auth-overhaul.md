---
name: Auth & RBAC overhaul
description: How auth, registration, and role-based access work after the overhaul
---

## Registration flow
- `POST /api/auth/register` — accepts fullName, companyName, email, password
- If `companyName` exactly matches `!nterFre!g#t` or `M@h0medab00` → role = "staff"; otherwise role = "customer"
- Staff codes are case-sensitive exact matches (Set lookup)
- No "Staff Login" link is visible anywhere in the UI — staff register through the same /auth page

## JWT payload
`{ userId, email, role, companyName }` — companyName is baked into the token so shipment filtering doesn't require a DB lookup on every request.

## RBAC enforcement (server-side)
- `GET /api/shipments` + `GET /api/shipments/:id` — requireAuth; customer filtered to own companyName via `eq(shipmentsTable.companyName, authReq.user.companyName)`
- `POST/PATCH/DELETE /api/shipments` — requireAuth + requireStaff
- All `/api/staff/*` routes — requireAuth + requireStaff
- `POST /api/auth/register` + `POST /api/auth/login` — public

## Frontend route guards (ProtectedRoute.tsx)
- `ProtectedRoute` — any authenticated user; redirects to /auth
- `StaffRoute` — staff only; redirects customers to /dashboard
- `CustomerRoute` — customers only; redirects staff to /staff/dashboard

**Why:** The old system had public shipment access with no auth required. The overhaul removes all public tracking — every data endpoint requires a logged-in account.

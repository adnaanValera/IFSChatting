---
name: Dev proxy setup
description: How the Replit preview pane connects to the app
---

## Rule
Express API server runs on port 8080. In development (`NODE_ENV !== "production"`), it proxies all non-`/api` requests to the Vite dev server on port 19055 via `http-proxy-middleware`.

**Why:** The Replit preview iframe is pointed at port 8080 (the Express server). Without the proxy, visiting `/` on the Express port returned "Cannot GET /" because Express had no root handler.

**How to apply:** The proxy is already configured in `artifacts/api-server/src/app.ts`. If Vite's port ever changes, update the proxy target. Do NOT hardcode the REPLIT_DEV_DOMAIN — use the proxy approach so relative URLs work in both dev and prod.

## Port mapping
- 8080 → Express API + dev proxy to Vite
- 19055 → Vite dev server (frontend only, not exposed directly in preview)

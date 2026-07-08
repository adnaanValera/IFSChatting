#!/bin/bash
# Starts both the API server (port 8080) and frontend (port 5000) together.
# The dedicated "API Server" workflow's platform-level port detection is
# unreliable in this environment (the process itself works fine and serves
# requests, but the workflow health check fails to register the open port),
# so we run the API server as a background process here instead, under the
# "web" workflow whose port detection is confirmed reliable.
# Vite proxies /api → http://localhost:8080 (see vite.config.ts).
set -e

cd "$(dirname "$0")"

pnpm --filter @workspace/api-server run build

PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PORT=5000 BASE_PATH=/ pnpm --filter @workspace/interfreight run dev

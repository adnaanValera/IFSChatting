import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensureRuntimeData } from "./lib/bootstrap";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim())
  : [];
app.use(
  cors(
    process.env.NODE_ENV === "production"
      ? {
          origin: allowedOrigins,
          credentials: true,
        }
      : undefined, // permissive in dev — Vite proxy handles same-origin requests
  ),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(async (_req, res, next) => {
  try {
    await ensureRuntimeData();
    next();
  } catch (err) {
    logger.error({ err }, "Runtime database bootstrap failed");
    res.status(500).json({
      error: "Database is not ready",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.use("/api", router);

// In development, proxy all non-/api requests to the Vite dev server so the
// preview always shows the frontend regardless of which port it hits.
if (process.env.NODE_ENV !== "production") {
  const vitePort = process.env.VITE_PORT ?? "19055";
  app.use(
    createProxyMiddleware({
      target: `http://localhost:${vitePort}`,
      changeOrigin: true,
      ws: true,
    }),
  );
}

export default app;

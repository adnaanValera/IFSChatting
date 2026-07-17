import { Router, Request } from "express";
import { requireAuth, AuthPayload } from "../middlewares/auth";
import { deletePushSubscription, getPublicVapidKey, upsertPushSubscription } from "../lib/push";

const router = Router();

type AuthReq = Request & { user: AuthPayload };

function parseSubscription(body: any) {
  const endpoint = String(body?.endpoint ?? "").trim();
  const p256dh = String(body?.keys?.p256dh ?? "").trim();
  const auth = String(body?.keys?.auth ?? "").trim();
  return { endpoint, p256dh, auth };
}

router.get("/push/public-key", (_req, res) => {
  res.json({ publicKey: getPublicVapidKey() });
});

router.post("/push/subscribe", requireAuth, async (req, res) => {
  const { endpoint, p256dh, auth } = parseSubscription(req.body);
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Invalid push subscription" });
    return;
  }

  await upsertPushSubscription({
    endpoint,
    p256dh,
    auth,
    userId: (req as AuthReq).user.userId,
    userAgent: req.get("user-agent"),
  });

  res.status(204).send();
});

router.delete("/push/subscribe", requireAuth, async (req, res) => {
  const endpoint = String(req.body?.endpoint ?? "").trim();
  if (!endpoint) {
    res.status(400).json({ error: "Endpoint is required" });
    return;
  }
  await deletePushSubscription(endpoint, (req as AuthReq).user.userId);
  res.status(204).send();
});

router.post("/push/pending-subscribe", async (req, res) => {
  const approvalToken = String(req.body?.approvalToken ?? "").trim();
  const { endpoint, p256dh, auth } = parseSubscription(req.body);
  if (!approvalToken || !endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Approval token and valid subscription are required" });
    return;
  }

  await upsertPushSubscription({
    endpoint,
    p256dh,
    auth,
    approvalToken,
    userAgent: req.get("user-agent"),
  });

  res.status(204).send();
});

router.post("/push/guest-subscribe", async (req, res) => {
  const { endpoint, p256dh, auth } = parseSubscription(req.body);
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Invalid push subscription" });
    return;
  }

  await upsertPushSubscription({
    endpoint,
    p256dh,
    auth,
    approvalToken: "__guest_install__",
    userAgent: req.get("user-agent"),
  });

  res.status(204).send();
});

router.delete("/push/pending-subscribe", async (req, res) => {
  const approvalToken = String(req.body?.approvalToken ?? "").trim();
  const endpoint = String(req.body?.endpoint ?? "").trim();
  if (!approvalToken || !endpoint) {
    res.status(400).json({ error: "Approval token and endpoint are required" });
    return;
  }
  await deletePushSubscription(endpoint, null, approvalToken);
  res.status(204).send();
});

export default router;

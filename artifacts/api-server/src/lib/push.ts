import webpush from "web-push";
import { db, pool, pushSubscriptionsTable } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { logger } from "./logger";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  iconType?: string;
  referenceText?: string;
  detailText?: string;
  notificationType?: string;
};

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function hasPushConfig() {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

let configured = false;

function ensureConfigured() {
  if (configured || !hasPushConfig()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:info@interfreightsolutions.com",
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  configured = true;
}

async function deliver(subscriptions: StoredSubscription[], payload: PushPayload) {
  if (!subscriptions.length || !hasPushConfig()) return;
  ensureConfigured();

  const body = JSON.stringify(payload);
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, body, {
        TTL: 300,
        urgency: "high",
      });
    } catch (error: any) {
      const statusCode = Number(error?.statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint));
        continue;
      }

      logger.warn(
        {
          err: error,
          statusCode,
          endpoint: subscription.endpoint,
          notificationType: payload.notificationType,
          title: payload.title,
          tag: payload.tag,
        },
        "Push delivery failed",
      );
    }
  }
}

type ExpoPushTicket = {
  status?: "ok" | "error";
  details?: { error?: string };
};

async function deliverNative(userId: number, payload: PushPayload) {
  const result = await pool.query<{ token: string }>(
    "SELECT token FROM native_push_tokens WHERE user_id = $1",
    [userId],
  );
  if (!result.rows.length) return;

  const messages = result.rows.map(({ token }) => ({
    to: token,
    title: "InterFreightSolutions",
    body: payload.body,
    sound: "default",
    priority: "high",
    channelId: "default",
    data: {
      url: payload.url || "/dashboard",
      notificationType: payload.notificationType || "notification",
      referenceText: payload.referenceText || "",
      detailText: payload.detailText || "",
    },
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      throw new Error(`Expo push returned ${response.status}`);
    }

    const json = await response.json() as { data?: ExpoPushTicket | ExpoPushTicket[] };
    const tickets = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
    for (let index = 0; index < tickets.length; index += 1) {
      if (tickets[index]?.details?.error === "DeviceNotRegistered") {
        await pool.query("DELETE FROM native_push_tokens WHERE token = $1", [result.rows[index]?.token]);
      }
    }
  } catch (error) {
    logger.warn({ err: error, userId, notificationType: payload.notificationType }, "Native push delivery failed");
  }
}

export function getPublicVapidKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || "";
}

export async function sendPushToUser(userId: number, payload: PushPayload) {
  const subscriptions = await db
    .select({
      endpoint: pushSubscriptionsTable.endpoint,
      p256dh: pushSubscriptionsTable.p256dh,
      auth: pushSubscriptionsTable.auth,
    })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  await Promise.all([
    deliver(subscriptions, payload),
    deliverNative(userId, payload),
  ]);
}

export async function upsertNativePushToken(args: {
  token: string;
  userId: number;
  platform?: string;
  userAgent?: string;
}) {
  await pool.query(
    `INSERT INTO native_push_tokens (user_id, token, platform, user_agent, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       user_agent = EXCLUDED.user_agent,
       updated_at = now()`,
    [args.userId, args.token, args.platform || "android", args.userAgent?.slice(0, 300) || null],
  );
}

export async function deleteNativePushToken(token: string, userId: number) {
  await pool.query("DELETE FROM native_push_tokens WHERE token = $1 AND user_id = $2", [token, userId]);
}

export async function sendPushToPendingSignup(approvalToken: string, payload: PushPayload) {
  const subscriptions = await db
    .select({
      endpoint: pushSubscriptionsTable.endpoint,
      p256dh: pushSubscriptionsTable.p256dh,
      auth: pushSubscriptionsTable.auth,
    })
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.approvalToken, approvalToken),
        isNull(pushSubscriptionsTable.userId),
      ),
    );

  await deliver(subscriptions, payload);
}

export async function sendPushToSubscription(subscription: StoredSubscription, payload: PushPayload) {
  await deliver([subscription], payload);
}

export async function upsertPushSubscription(args: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId?: number | null;
  approvalToken?: string | null;
  userAgent?: string;
}) {
  const [existing] = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, args.endpoint))
    .limit(1);

  const values = {
    userId: args.userId ?? null,
    approvalToken: args.approvalToken ?? null,
    endpoint: args.endpoint,
    p256dh: args.p256dh,
    auth: args.auth,
    userAgent: args.userAgent?.slice(0, 300) ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(pushSubscriptionsTable).set(values).where(eq(pushSubscriptionsTable.id, existing.id));
    return { created: false as const };
  }

  await db.insert(pushSubscriptionsTable).values({
    ...values,
    createdAt: new Date(),
  });

  return { created: true as const };
}

export async function deletePushSubscription(endpoint: string, userId?: number | null, approvalToken?: string | null) {
  const filters = [eq(pushSubscriptionsTable.endpoint, endpoint)];
  if (userId) filters.push(eq(pushSubscriptionsTable.userId, userId));
  if (approvalToken) filters.push(eq(pushSubscriptionsTable.approvalToken, approvalToken));
  await db.delete(pushSubscriptionsTable).where(and(...filters));
}

export async function transferPendingPushSubscriptionsToUser(approvalToken: string, userId: number) {
  await db
    .update(pushSubscriptionsTable)
    .set({ userId, approvalToken: null, updatedAt: new Date() })
    .where(
      or(
        eq(pushSubscriptionsTable.approvalToken, approvalToken),
        and(eq(pushSubscriptionsTable.userId, userId), isNull(pushSubscriptionsTable.approvalToken)),
      ),
    );
}

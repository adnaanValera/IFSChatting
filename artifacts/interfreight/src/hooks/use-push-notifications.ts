import { useEffect, useMemo, useState } from "react";
import { isStandaloneDisplay, urlBase64ToUint8Array } from "@/lib/pwa";

type Scope = { type: "auth" } | { type: "pending"; approvalToken: string };

async function fetchPublicKey() {
  const response = await fetch("/api/push/public-key");
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Could not load the push notification key.");
  }
  const data = await response.json().catch(() => ({}));
  return String(data.publicKey || "").trim().replace(/\s+/g, "");
}

async function upsertSubscription(scope: Scope, subscription: PushSubscription) {
  const token = localStorage.getItem("intf_token");
  const endpoint = scope.type === "auth" ? "/api/push/subscribe" : "/api/push/pending-subscribe";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(scope.type === "auth" && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(scope.type === "auth"
      ? subscription.toJSON()
      : { approvalToken: scope.approvalToken, ...subscription.toJSON() }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Could not save the push notification subscription.");
  }
}

export function usePushNotifications(scope?: Scope) {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const standalone = typeof window !== "undefined" ? isStandaloneDisplay() : false;
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    );
  }, []);

  useEffect(() => {
    async function checkSubscription() {
      if (!isSupported || !scope || !("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    }
    void checkSubscription();
  }, [isSupported, scope]);

  const unsupportedReason = useMemo(() => {
    if (!scope) return "";
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "Notifications need a secure HTTPS connection.";
    }
    if (isIOS && !standalone) {
      return "On iPhone or iPad, install and open the app first, then enable notifications inside the app.";
    }
    if (!isSupported) {
      return "This device does not support push notifications here yet.";
    }
    return "";
  }, [isIOS, isSupported, scope, standalone]);

  const canEnable = useMemo(
    () => isSupported && !!scope && permission !== "denied" && !unsupportedReason,
    [isSupported, scope, permission, unsupportedReason],
  );

  async function enable() {
    if (!scope || !isSupported) return false;
    if (unsupportedReason) throw new Error(unsupportedReason);
    setIsLoading(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") return false;

      const publicKey = await fetchPublicKey();
      if (!publicKey) throw new Error("Push notifications are not configured yet.");
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      if (applicationServerKey.length !== 65) {
        throw new Error("The push public key is invalid. Please recheck the VAPID key in Vercel.");
      }

      const registration = await navigator.serviceWorker.ready;
      await registration.update().catch(() => undefined);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        try {
          await upsertSubscription(scope, subscription);
          setIsSubscribed(true);
          return true;
        } catch {
          await subscription.unsubscribe().catch(() => undefined);
          subscription = null;
        }
      }

      let subscribeError: unknown = null;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch (error) {
        subscribeError = error;
        const staleSubscription = await registration.pushManager.getSubscription().catch(() => null);
        if (staleSubscription) {
          await staleSubscription.unsubscribe().catch(() => undefined);
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          } catch (retryError) {
            subscribeError = retryError;
          }
        }
      }

      if (!subscription) {
        const message = subscribeError instanceof Error ? subscribeError.message : "";
        const name = subscribeError instanceof Error ? subscribeError.name : "";
        if (isIOS && !standalone) {
          throw new Error("Install and open the InterFreight app first, then enable notifications there.");
        }
        throw new Error([name, message].filter(Boolean).join(": ") || "Push registration failed on this device. Open the installed app and try again.");
      }

      await upsertSubscription(scope, subscription);
      setIsSubscribed(true);
      return true;
    } finally {
      setIsLoading(false);
    }
  }

  return { isSupported, isSubscribed, isLoading, permission, canEnable, enable, unsupportedReason };
}

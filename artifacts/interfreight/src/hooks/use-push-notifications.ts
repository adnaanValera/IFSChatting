import { useEffect, useMemo, useState } from "react";
import { isStandaloneDisplay, registerServiceWorker, urlBase64ToUint8Array } from "@/lib/pwa";

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

async function getReadyRegistration() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are not available on this device.");
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  const registered = await registerServiceWorker();
  const registration = registered ?? await navigator.serviceWorker.ready;
  if (registration.active && navigator.serviceWorker.controller) return registration;

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = window.setTimeout(finish, 1200);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.clearTimeout(timer);
      finish();
    }, { once: true });
  });

  return navigator.serviceWorker.ready;
}

async function resetPushState() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations.map(async (registration) => {
      const subscription = await registration.pushManager.getSubscription().catch(() => null);
      if (subscription) await subscription.unsubscribe().catch(() => undefined);
      await registration.unregister().catch(() => undefined);
    }),
  );
  return getReadyRegistration();
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
      const registration = await getReadyRegistration();
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

      let registration = await getReadyRegistration();
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

      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch (error) {
        registration = await resetPushState();
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        } catch (retryError) {
          const message = retryError instanceof Error ? retryError.message : error instanceof Error ? error.message : "";
          if (isIOS && !standalone) {
            throw new Error("Install and open the InterFreight app first, then enable notifications there.");
          }
          throw new Error(message || "Push registration failed on this device. Please reopen the web app and try again.");
        }
        if (isIOS && !standalone) {
          throw new Error("Install and open the InterFreight app first, then enable notifications there.");
        }
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

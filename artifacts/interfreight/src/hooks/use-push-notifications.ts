import { useEffect, useMemo, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/pwa";

type Scope = { type: "auth" } | { type: "pending"; approvalToken: string };

async function fetchPublicKey() {
  const response = await fetch("/api/push/public-key");
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Could not load the push notification key.");
  }
  const data = await response.json().catch(() => ({}));
  return String(data.publicKey || "");
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
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
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

  const canEnable = useMemo(() => isSupported && !!scope && permission !== "denied", [isSupported, scope, permission]);

  async function enable() {
    if (!scope || !isSupported) return false;
    setIsLoading(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") return false;

      const publicKey = await fetchPublicKey();
      if (!publicKey) throw new Error("Push notifications are not configured yet.");

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await upsertSubscription(scope, subscription);
      setIsSubscribed(true);
      return true;
    } finally {
      setIsLoading(false);
    }
  }

  return { isSupported, isSubscribed, isLoading, permission, canEnable, enable };
}

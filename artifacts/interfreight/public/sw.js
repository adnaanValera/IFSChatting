self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "InterFreight Solutions";
  const options = {
    body: data.body || "You have a new update.",
    icon: "/ifs-app-icon-2026.png",
    badge: "/ifs-app-icon-2026.png",
    vibrate: [220, 120, 220],
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: data.url || "/dashboard",
    },
    tag: data.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard";

  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});

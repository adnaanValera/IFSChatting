import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell, Package, X, ArrowRight, Building2, Truck, Ship, Megaphone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: number;
  title: string;
  message: string;
  ifsRef?: string;
  companyName?: string;
  status?: string;
  notificationType?: string;
  iconType?: string;
  referenceText?: string;
  detailText?: string;
  actionUrl?: string;
  read: boolean;
  createdAt: string;
}

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("intf_token");
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function notificationCompany(n: Notification) {
  return n.companyName?.trim() || "Shipment Updates";
}

function notificationTarget(n: Notification, role?: string): string {
  if (n.actionUrl) return n.actionUrl;
  const isStaff = role === "staff" || role === "admin";

  if (isStaff) {
    if (n.status === "Contact Message") return "/staff/dashboard?tab=messages";
    if (n.status === "Admin review" || n.status === "Staff review") return "/staff/dashboard?tab=authorize";
    if (n.status === "Announcement") return "/staff/dashboard?tab=overview&focus=announcement";
    return "/staff/dashboard";
  }

  if (n.ifsRef) {
    return `/dashboard?search=${encodeURIComponent(n.ifsRef)}&changed=1`;
  }
  if (n.status === "Announcement") {
    return "/dashboard?focus=announcement";
  }
  return "/dashboard";
}

function NotificationIcon({ type, unread }: { type?: string; unread: boolean }) {
  const className = unread ? "text-primary" : "text-white/40";
  if (type === "truck") return <Truck size={14} className={className} />;
  if (type === "ship") return <Ship size={14} className={className} />;
  if (type === "announcement") return <Megaphone size={14} className={className} />;
  return <Package size={14} className={className} />;
}

function toneClass(n: Notification): string {
  const text = String(n.status ?? "").toLowerCase();
  if (n.notificationType === "announcement") return "text-primary";
  if (text.includes("delivered") || text.includes("clearance")) return "text-emerald-400";
  if (text.includes("port") || text.includes("pod") || text.includes("offloading")) return "text-indigo-300";
  if (text.includes("sea")) return "text-red-300";
  if (text.includes("delay") || text.includes("hold") || text.includes("problem")) return "text-red-400";
  return "text-amber-300";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<number[]>([]);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const typedUser = user as any;
  const dashboardHref = typedUser?.role === "staff" || typedUser?.role === "admin" ? "/staff/dashboard" : "/dashboard";

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await authFetch("/api/notifications");
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
    retry: false,
  });

  useEffect(() => {
    const currentIds = notifications.map((notification) => notification.id);
    if (knownIdsRef.current.length === 0) {
      knownIdsRef.current = currentIds;
      return;
    }

    const newNotifications = notifications.filter((notification) => !knownIdsRef.current.includes(notification.id));
    if (newNotifications.length > 0) {
      const newest = newNotifications[0]!;
      toast({
        title: newest.title,
        description: newest.message,
      });
    }

    knownIdsRef.current = currentIds;
  }, [notifications, toast]);

  const unreadNotifications = notifications.filter((n) => !n.read);
  const unread = unreadNotifications.length;
  const statusUpdates = unreadNotifications.filter((n) => n.status).length;
  const groupedNotifications = unreadNotifications.reduce<Record<string, Notification[]>>((groups, notification) => {
    const key = notificationCompany(notification);
    groups[key] ??= [];
    groups[key].push(notification);
    return groups;
  }, {});

  const markOne = useMutation({
    mutationFn: (id: number) => authFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => authFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleNotifClick(n: Notification) {
    try {
      await markOne.mutateAsync(n.id);
    } catch {
      // Keep navigation working even if the read request fails.
    }
    setOpen(false);
    const target = notificationTarget(n, typedUser?.role);
    window.location.assign(target);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all ${unread > 0 ? "animate-pulse shadow-[0_0_18px_rgba(191,33,49,0.22)]" : ""}`}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none animate-pulse shadow-[0_0_16px_rgba(191,33,49,0.28)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-2 top-[4.25rem] w-[min(22rem,calc(100vw-1rem))] sm:absolute sm:right-0 sm:top-12 sm:w-[22rem] bg-[#111315] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-primary" />
              <span className="text-white font-semibold text-sm">Notifications</span>
              {unread > 0 && (
                <span className="bg-primary/20 text-primary text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="text-white/40 hover:text-white/70 text-xs transition-colors px-2 py-1 rounded"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white/70 p-1 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {unreadNotifications.length > 0 && (
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/35">Unread</p>
                  <p className="text-lg font-extrabold text-white">{unread}</p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-primary/70">Status updates</p>
                  <p className="text-lg font-extrabold text-primary">{statusUpdates}</p>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="max-h-[70vh] overflow-y-auto">
            {unreadNotifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="text-white/20 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No unread notifications</p>
              </div>
            ) : (
              Object.entries(groupedNotifications).map(([company, items]) => (
                <div key={company} className="border-b border-white/5">
                  <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white/[0.025]">
                    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/45">
                      <Building2 size={12} />
                      {company}
                    </span>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                      {items.length}
                    </span>
                  </div>
                  {items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left px-3 py-3 sm:px-4 hover:bg-white/5 transition-colors flex gap-2.5 sm:gap-3 items-start ${!n.read ? "bg-primary/5" : ""}`}
                    >
                      <div className={`mt-0.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 ${!n.read ? "bg-primary/20 border border-primary/30" : "bg-white/5 border border-white/10"}`}>
                        <NotificationIcon type={n.iconType} unread={!n.read} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold leading-tight ${!n.read ? "text-white" : "text-white/60"}`}>
                            {n.title}
                          </p>
                          {!n.read && <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1" />}
                        </div>
                        {(n.referenceText || n.message) && (
                          <p className="text-white/80 text-xs mt-1 leading-relaxed line-clamp-2">
                            {n.referenceText || n.message}
                          </p>
                        )}
                        {(n.detailText || (n.referenceText && n.message)) && (
                          <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${toneClass(n)}`}>
                            {n.detailText || n.message}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          {n.status ? (
                            <span className="inline-block bg-primary/20 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              {n.status}
                            </span>
                          ) : <span />}
                          <span className="text-white/25 text-[10px]">{timeAgo(n.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {unreadNotifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-white/10">
              <button
                onClick={() => { setOpen(false); navigate(dashboardHref); }}
                className="w-full text-center text-primary text-xs font-semibold hover:text-primary/80 transition-colors py-1"
              >
                View affected shipments <ArrowRight size={12} className="inline ml-1" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

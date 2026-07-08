import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell, Package, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: number;
  title: string;
  message: string;
  ifsRef?: string;
  companyName?: string;
  status?: string;
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

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

  const unread = notifications.filter((n) => !n.read).length;

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

  function handleNotifClick(n: Notification) {
    markOne.mutate(n.id);
    setOpen(false);
    navigate("/dashboard");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-[#111315] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
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

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="text-white/20 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors flex gap-3 items-start ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!n.read ? "bg-primary/20 border border-primary/30" : "bg-white/5 border border-white/10"}`}>
                    <Package size={14} className={!n.read ? "text-primary" : "text-white/40"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold leading-tight ${!n.read ? "text-white" : "text-white/60"}`}>
                        {n.title}
                      </p>
                      {!n.read && <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1" />}
                    </div>
                    <p className="text-white/50 text-xs mt-1 leading-relaxed line-clamp-2">{n.message}</p>
                    {n.status && (
                      <span className="inline-block mt-1.5 bg-primary/20 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        {n.status}
                      </span>
                    )}
                    <p className="text-white/25 text-[10px] mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-white/10">
              <button
                onClick={() => { setOpen(false); navigate("/dashboard"); }}
                className="w-full text-center text-primary text-xs font-semibold hover:text-primary/80 transition-colors py-1"
              >
                View all shipments →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

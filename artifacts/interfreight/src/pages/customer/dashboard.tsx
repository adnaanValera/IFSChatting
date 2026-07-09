import { useState } from "react";
import { useGetMe, useListShipments } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffLogout } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  Loader2, LogOut, Package, Ship, Building2, MapPin,
  CheckCircle, Home, Download, Megaphone, Bell, ArrowRight,
} from "lucide-react";
import logoUrl from "@assets/Inter_freight_logo_1782979832903.jpeg";
import { Link } from "wouter";
import { ShipmentCard } from "@/components/ui/shipment-card";

const STATUS_SECTIONS = [
  { label: "Shipments In Malawi", reportLabel: "SHIPMENTS IN MALAWI", statuses: ["Delivered", "Awaiting Clearance"] },
  { label: "Shipments Enroute", reportLabel: "SHIPMENTS ENROUTE", statuses: ["In Transit", "Enroute LLW", "Enroute BLZ", "Enroute"] },
  { label: "Shipments At POD", reportLabel: "SHIPMENTS AT POD", statuses: ["At Port", "Offloading"] },
  { label: "Shipments On Sea", reportLabel: "SHIPMENTS ON SEA", statuses: ["Delayed", "On Sea", "At Sea"] },
];

function normalizeSectionLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function shipmentSectionLabel(shipment: any): string {
  const extra = shipment.extraFields ?? {};
  const sourceSection = String(extra["Source Section"] ?? extra["sourceSection"] ?? "").trim();
  if (sourceSection) {
    const matchingSection = STATUS_SECTIONS.find((section) =>
      normalizeSectionLabel(section.reportLabel) === normalizeSectionLabel(sourceSection)
    );
    if (matchingSection) return matchingSection.reportLabel;
  }

  const status = String(shipment.status ?? "").toLowerCase();
  return STATUS_SECTIONS.find((section) => section.statuses.some(
    (st) => status.includes(st.toLowerCase()) || st.toLowerCase().includes(status),
  ))?.reportLabel ?? "OTHER SHIPMENTS";
}

function reportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

type StatusNotification = {
  ifsRef?: string | null;
  message?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

type Announcement = {
  title: string;
  message: string;
  updatedAt?: string;
};

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

function parseStatusChange(message?: string | null): { oldValue: string; newValue: string } | undefined {
  const match = String(message ?? "").match(/status changed:\s*(.*?)\s*->\s*(.*?)\.\s*Tap/i);
  if (!match) return undefined;
  return { oldValue: match[1]?.trim() || "N/A", newValue: match[2]?.trim() || "N/A" };
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: shipmentsPage, isLoading: shipmentsLoading } = useListShipments({ limit: 200 });
  const { data: notifications = [] } = useQuery<StatusNotification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await authFetch("/api/notifications");
      if (!r.ok) return [];
      return r.json();
    },
    retry: false,
  });
  const { data: announcement = null } = useQuery<Announcement | null>({
    queryKey: ["announcement-current"],
    queryFn: async () => {
      const r = await authFetch("/api/announcements/current");
      if (!r.ok) return null;
      return r.json();
    },
    retry: false,
  });
  const logoutMutation = useStaffLogout();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
        queryClient.clear();
        setLocation("/");
      },
    });
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/customer/company-report/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const companyName = String((user as any)?.companyName ?? "Company").replace(/[\/\\?%*:|"<>]/g, "-").trim() || "Company";
      a.href = url;
      a.download = `Status Report - ${companyName} (${reportDateStamp()}).pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      window.alert(err?.message || "Download failed");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const typedUser = user as any;
  const shipments = shipmentsPage?.items ?? [];
  const statusChangesByIfsRef = new Map<string, { oldValue: string; newValue: string }>();
  for (const notification of notifications) {
    if (!notification.ifsRef || statusChangesByIfsRef.has(notification.ifsRef)) continue;
    const change = parseStatusChange(notification.message);
    if (change) statusChangesByIfsRef.set(notification.ifsRef, change);
  }
  const todayUpdates = notifications.filter((notification) => notification.status && isToday(notification.createdAt));
  const todayUpdatedRefs = new Set(todayUpdates.map((notification) => notification.ifsRef).filter(Boolean));
  const sectionRows = STATUS_SECTIONS.map((section) => ({
    ...section,
    rows: shipments.filter((shipment: any) => shipmentSectionLabel(shipment) === section.reportLabel),
  }));
  const statCards = [
    { icon: Package, label: "Total Consignments", value: shipments.length, tone: "bg-blue-50 text-blue-600" },
    { icon: CheckCircle, label: "Shipments In Malawi", value: sectionRows[0]?.rows.length ?? 0, tone: "bg-emerald-50 text-emerald-600" },
    { icon: Ship, label: "Shipments Enroute", value: sectionRows[1]?.rows.length ?? 0, tone: "bg-amber-50 text-amber-600" },
    { icon: MapPin, label: "Shipments At POD", value: sectionRows[2]?.rows.length ?? 0, tone: "bg-indigo-50 text-indigo-600" },
    { icon: Building2, label: "Shipments On Sea", value: sectionRows[3]?.rows.length ?? 0, tone: "bg-red-50 text-red-600" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="bg-secondary text-secondary-foreground shadow-lg sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoUrl} alt="InterFreight" className="h-9 sm:h-10 w-auto bg-white rounded p-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 uppercase tracking-widest">My Tracking</p>
              <h1 className="text-sm sm:text-lg font-bold text-white leading-tight truncate">
                <span className="text-primary">{typedUser?.fullName || typedUser?.name}</span>{" "}
                <span className="font-normal text-gray-300 text-sm">· {typedUser?.companyName}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Link href="/" className="hidden sm:flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
              <Home size={15} /> Home
            </Link>
            <button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10 max-w-5xl">

        {announcement && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 sm:mb-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-3"
          >
            <Megaphone className="text-primary shrink-0 mt-0.5" size={20} />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-secondary">{announcement.title}</p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-0.5">{announcement.message}</p>
            </div>
          </motion.div>
        )}

        {todayUpdates.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const firstRef = [...todayUpdatedRefs][0];
              const el = firstRef ? document.getElementById(`shipment-${firstRef}`) : null;
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mb-4 sm:mb-6 w-full rounded-xl bg-secondary text-white px-4 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-3 text-left shadow-sm"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Bell size={18} className="text-primary" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">Today's Updates</span>
                <span className="block text-xs text-white/60 truncate">
                  {todayUpdates.length} consignment{todayUpdates.length !== 1 ? "s" : ""} updated today
                </span>
              </span>
            </span>
            <ArrowRight size={18} className="text-white/50 shrink-0" />
          </button>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-10">
          {statCards.map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${tone}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                <p className="text-xl sm:text-2xl font-bold text-secondary">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Heading */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h2 className="text-xl sm:text-2xl font-extrabold text-secondary">Your Consignments</h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              {shipments.length} record{shipments.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf || shipmentsLoading || shipments.length === 0}
              className="ml-auto sm:ml-0 flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-all disabled:opacity-60"
            >
              {isDownloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Download PDF
            </button>
          </div>
        </div>

        {/* Shipment cards */}
        {shipmentsLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border shadow-sm py-20 text-center">
            <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-secondary mb-2">No consignments yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your shipment records will appear here once they've been uploaded by our team.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sectionRows.map((section) => (
              <section key={section.reportLabel} className="space-y-3">
                <div className="flex items-center justify-between gap-3 bg-secondary text-white rounded-xl px-3 sm:px-4 py-3 shadow-sm">
                  <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide">{section.reportLabel}</h3>
                  <span className="text-xs bg-white/15 px-2.5 py-1 rounded-full font-semibold">
                    {section.rows.length}
                  </span>
                </div>
                {section.rows.length === 0 ? (
                  <div className="bg-white border border-border rounded-xl px-4 py-5 text-sm text-muted-foreground">
                    No consignments in this section.
                  </div>
                ) : (
                  section.rows.map((s: any, index: number) => (
                    <ShipmentCard
                      key={s.id}
                      shipment={s}
                      statusChange={statusChangesByIfsRef.get(s.ifsRef)}
                      highlight={todayUpdatedRefs.has(s.ifsRef)}
                      index={index}
                    />
                  ))
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

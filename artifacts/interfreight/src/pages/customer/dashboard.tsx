import { useEffect, useMemo, useState } from "react";
import { useGetMe, useListShipments } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffLogout } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  Loader2, LogOut, Package, Ship, MapPin,
  CheckCircle, Home, Download, Megaphone, Bell, ArrowRight,
  AlertTriangle, Search, Moon, Sun, LayoutGrid, FileText, Eye,
} from "lucide-react";
import logoUrl from "@assets/Inter_freight_logo_1782979832903.jpeg";
import { Link } from "wouter";
import { ShipmentCard } from "@/components/ui/shipment-card";
import { StatusBadge } from "@/components/ui/status-badge";

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

function extraText(shipment: any, ...keys: string[]): string {
  const extra = shipment.extraFields ?? {};
  for (const key of keys) {
    const value = extra[key] ?? extra[key.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

function shipmentIdentifier(shipment: any): string {
  return shipment.containerNo || extraText(shipment, "BL / Manifest No.", "BL/Manifest No.", "Manifest No.", "Vehicle", "Driver") || shipment.ifsRef || "N/A";
}

function isAttentionRequired(shipment: any): boolean {
  const text = `${shipment.status ?? ""} ${shipment.entry ?? ""} ${shipment.mraRef ?? ""}`.toLowerCase();
  return text.includes("delay") || text.includes("problem") || text.includes("hold") || (!!shipment.mraRef && !shipment.entry);
}

function statusGroup(status: string): "transit" | "clearance" | "delivered" | "attention" | "other" {
  const text = status.toLowerCase();
  if (text.includes("delivered") || text.includes("malawi")) return "delivered";
  if (text.includes("clearance")) return "clearance";
  if (text.includes("delay") || text.includes("problem") || text.includes("hold")) return "attention";
  if (text.includes("transit") || text.includes("enroute") || text.includes("sea") || text.includes("pod") || text.includes("port")) return "transit";
  return "other";
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "IF";
}

function searchableText(shipment: any): string {
  return [
    shipment.ifsRef,
    shipment.mraRef,
    shipment.containerNo,
    shipment.invoiceNo,
    shipment.consignee,
    shipment.shipper,
    shipment.entry,
    shipment.cargoDescription,
    shipment.status,
    extraText(shipment, "BL / Manifest No.", "BL/Manifest No.", "Manifest No.", "Vehicle", "Driver", "Document Filename", "Filename", "Agent"),
    JSON.stringify(shipment.extraFields ?? {}),
  ].join(" ").toLowerCase();
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
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "documents">(() => {
    return (localStorage.getItem("intf_customer_view") as "cards" | "documents" | null) || "cards";
  });
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("intf_theme");
    return saved ? saved === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("intf_theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem("intf_customer_view", viewMode);
  }, [viewMode]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
        localStorage.removeItem("intf_session_duration_confirmed");
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

  const typedUser = user as any;
  const shipments = shipmentsPage?.items ?? [];
  const filteredShipments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return shipments;
    return shipments.filter((shipment: any) => searchableText(shipment).includes(term));
  }, [shipments, search]);
  const selectedShipment = filteredShipments.find((shipment: any) => shipment.id === selectedShipmentId) ?? filteredShipments[0];
  const companyName = String(typedUser?.companyName || typedUser?.fullName || typedUser?.name || "InterFreight Client");
  const statusChangesByIfsRef = new Map<string, { oldValue: string; newValue: string }>();
  for (const notification of notifications) {
    if (!notification.ifsRef || statusChangesByIfsRef.has(notification.ifsRef)) continue;
    const change = parseStatusChange(notification.message);
    if (change) statusChangesByIfsRef.set(notification.ifsRef, change);
  }
  const todayUpdates = notifications.filter((notification) => notification.status && isToday(notification.createdAt));
  const todayUpdatedRefs = new Set(
    todayUpdates
      .map((notification) => notification.ifsRef)
      .filter((ifsRef): ifsRef is string => Boolean(ifsRef)),
  );
  const sectionRows = STATUS_SECTIONS.map((section) => ({
    ...section,
    rows: filteredShipments.filter((shipment: any) => shipmentSectionLabel(shipment) === section.reportLabel),
  }));
  const inTransitCount = shipments.filter((shipment: any) => statusGroup(String(shipment.status ?? "")) === "transit").length;
  const awaitingClearanceCount = shipments.filter((shipment: any) => statusGroup(String(shipment.status ?? "")) === "clearance").length;
  const deliveredCount = shipments.filter((shipment: any) => statusGroup(String(shipment.status ?? "")) === "delivered").length;
  const attentionCount = shipments.filter((shipment: any) => isAttentionRequired(shipment)).length;
  const recentShipments = [...filteredShipments].slice(0, 4);
  const statCards = [
    { icon: Package, label: "Total Shipments", value: shipments.length, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200" },
    { icon: Ship, label: "In Transit", value: inTransitCount, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200" },
    { icon: MapPin, label: "Awaiting Clearance", value: awaitingClearanceCount, tone: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200" },
    { icon: CheckCircle, label: "Delivered", value: deliveredCount, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
    { icon: AlertTriangle, label: "Attention Required", value: attentionCount, tone: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200" },
  ];

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Preparing your consignee portal...</p>
        </div>
      </div>
    );
  }

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
              type="button"
              onClick={() => setIsDark((value) => !value)}
              className="h-9 w-9 rounded-lg bg-white/10 text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
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

      <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10 max-w-6xl">

        <div className="mb-5 sm:mb-8 rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-extrabold text-lg shrink-0">
                {initials(companyName)}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">Secure Consignee Portal</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-secondary dark:text-white leading-tight">
                  Welcome back, {companyName}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Review your active consignments, documents, and latest shipment changes.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf || shipmentsLoading || shipments.length === 0}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all disabled:opacity-60"
            >
              {isDownloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Download PDF Report
            </button>
          </div>
        </div>

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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-5 sm:mb-8">
          {statCards.map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className="bg-card rounded-xl border border-border p-3 sm:p-5 shadow-sm flex items-center gap-2 sm:gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${tone}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                <p className="text-xl sm:text-2xl font-bold text-secondary dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {recentShipments.length > 0 && (
          <div className="mb-5 sm:mb-8 bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-border">
              <h3 className="font-extrabold text-secondary dark:text-white">Recent Shipments</h3>
              <p className="text-xs text-muted-foreground">Latest records available to your company</p>
            </div>
            <div className="divide-y divide-border">
              {recentShipments.map((shipment: any) => (
                <button
                  key={`recent-${shipment.id}`}
                  type="button"
                  onClick={() => {
                    setSelectedShipmentId(shipment.id);
                    setViewMode("documents");
                  }}
                  className="w-full px-4 sm:px-5 py-3 text-left hover:bg-muted/50 transition-colors grid gap-2 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-secondary dark:text-white truncate">{shipmentIdentifier(shipment)}</p>
                    <p className="text-xs text-muted-foreground truncate">{shipment.cargoDescription || "No cargo description"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{shipment.shipper || "N/A"} -> {shipment.consignee || companyName}</p>
                  <StatusBadge status={shipment.status || "N/A"} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border shadow-sm p-3 sm:p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, BL, container, invoice, entry, shipper, cargo..."
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:w-auto">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${
                  viewMode === "cards" ? "bg-secondary text-white" : "bg-muted text-muted-foreground hover:text-secondary dark:hover:text-white"
                }`}
              >
                <LayoutGrid size={16} />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("documents")}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${
                  viewMode === "documents" ? "bg-secondary text-white" : "bg-muted text-muted-foreground hover:text-secondary dark:hover:text-white"
                }`}
              >
                <FileText size={16} />
                Documents
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {filteredShipments.length} of {shipments.length} shipment{shipments.length !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Shipment cards / documents */}
        {shipmentsLoading ? (
          <div className="grid gap-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 rounded-2xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : shipments.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm py-20 text-center">
            <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-secondary dark:text-white mb-2">No consignments yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your shipment records will appear here once they've been uploaded by our team.
            </p>
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm py-20 text-center">
            <Search className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-secondary dark:text-white mb-2">No matching shipments</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Try searching by reference, container, invoice number, entry, shipper, or cargo description.
            </p>
          </div>
        ) : viewMode === "documents" ? (
          <div className="grid lg:grid-cols-[320px_1fr] gap-4">
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-4 border-b border-border">
                <h3 className="font-extrabold text-secondary dark:text-white">Shipments</h3>
                <p className="text-xs text-muted-foreground">Select a shipment to view report actions</p>
              </div>
              <div className="max-h-[560px] overflow-y-auto divide-y divide-border">
                {filteredShipments.map((shipment: any) => (
                  <button
                    key={`document-${shipment.id}`}
                    type="button"
                    onClick={() => setSelectedShipmentId(shipment.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedShipment?.id === shipment.id ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <p className="font-bold text-secondary dark:text-white truncate">{shipmentIdentifier(shipment)}</p>
                    <p className="text-xs text-muted-foreground truncate">{shipment.ifsRef || "No IFS ref"}</p>
                    <div className="mt-2">
                      <StatusBadge status={shipment.status || "N/A"} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Document View</p>
                  <h3 className="font-extrabold text-secondary dark:text-white truncate">
                    {selectedShipment ? shipmentIdentifier(selectedShipment) : "No shipment selected"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className="shrink-0 inline-flex items-center gap-2 bg-muted hover:bg-muted/80 text-secondary dark:text-white text-sm font-bold px-3 py-2 rounded-lg"
                >
                  <LayoutGrid size={15} />
                  Back to Cards
                </button>
              </div>
              {selectedShipment ? (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Reference</p>
                      <p className="font-bold text-secondary dark:text-white break-all">{selectedShipment.ifsRef || "N/A"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Invoice</p>
                      <p className="font-bold text-secondary dark:text-white break-all">{selectedShipment.invoiceNo || "N/A"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Consignee</p>
                      <p className="font-bold text-secondary dark:text-white">{selectedShipment.consignee || companyName}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                      <div className="mt-1"><StatusBadge status={selectedShipment.status || "N/A"} /></div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="font-bold text-secondary dark:text-white">No individual PDF attached</p>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                      This portal currently stores shipment records and company status reports. Individual shipment document files are not available in the backend yet.
                    </p>
                    <div className="mt-5 flex flex-col sm:flex-row justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={isDownloadingPdf}
                        className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold px-4 py-3 rounded-xl disabled:opacity-60"
                      >
                        {isDownloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Download Company PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("cards")}
                        className="inline-flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-bold px-4 py-3 rounded-xl"
                      >
                        <Eye size={16} />
                        View Shipment Card
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-sm text-muted-foreground">Select a shipment to view document actions.</div>
              )}
            </div>
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
                  <div className="bg-card border border-border rounded-xl px-4 py-5 text-sm text-muted-foreground">
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

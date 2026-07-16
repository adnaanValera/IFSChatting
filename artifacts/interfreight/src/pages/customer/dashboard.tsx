import { useEffect, useMemo, useRef, useState } from "react";
import { useGetMe, useListShipments } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffLogout } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  LogOut, Package, Ship, MapPin,
  CheckCircle, Home, Download, Megaphone, ArrowRight, Bell,
  AlertTriangle, Search, Smartphone,
} from "lucide-react";
import { Link } from "wouter";
import { ShipmentCard } from "@/components/ui/shipment-card";
import { Spinner } from "@/components/ui/spinner";
import { AccountSwitcher } from "@/components/auth/AccountSwitcher";
import { NotificationOptIn } from "@/components/auth/NotificationOptIn";
import { saveAccount, savedAccounts, type SavedAccount } from "@/lib/saved-accounts";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

const CUSTOMER_BADGE_URL = "/ifs-app-premium.png";
const READ_CHANGES_STORAGE_KEY = "intf_read_status_changes_v2";

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
  id?: number;
  title?: string | null;
  ifsRef?: string | null;
  companyName?: string | null;
  message?: string | null;
  status?: string | null;
  notificationType?: string | null;
  read?: boolean;
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
  const text = String(message ?? "").trim();
  const legacyMatch = text.match(/status changed:\s*(.*?)\s*->\s*(.*?)\.\s*Tap/i);
  if (legacyMatch) {
    return {
      oldValue: legacyMatch[1]?.trim() || "N/A",
      newValue: legacyMatch[2]?.trim() || "N/A",
    };
  }

  const currentMatch = text.match(/:\s*(.*?)\s*->\s*(.*?)\.\s*Tap to view more\.?$/i);
  if (currentMatch) {
    return {
      oldValue: currentMatch[1]?.trim() || "N/A",
      newValue: currentMatch[2]?.trim() || "N/A",
    };
  }

  const plainMatch = text.match(/:\s*(.*?)\s*->\s*(.*?)$/i);
  if (plainMatch) {
    return {
      oldValue: plainMatch[1]?.trim() || "N/A",
      newValue: plainMatch[2]?.trim() || "N/A",
    };
  }

  return undefined;
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

function readSeenChangeTokens(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_CHANGES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function sectionElementId(reportLabel: string): string {
  return `section-${reportLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export default function CustomerDashboard() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: shipmentsPage, isLoading: shipmentsLoading } = useListShipments(
    { limit: 200 },
    {
      query: {
        refetchInterval: 15000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
      },
    },
  );
  const { data: notifications = [] } = useQuery<StatusNotification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await authFetch("/api/notifications");
      if (!r.ok) return [];
      return r.json();
    },
    retry: false,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const { data: announcement = null } = useQuery<Announcement | null>({
    queryKey: ["announcement-current"],
    queryFn: async () => {
      const r = await authFetch("/api/announcements/current");
      if (!r.ok) return null;
      return r.json();
    },
    retry: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const logoutMutation = useStaffLogout();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [search, setSearch] = useState("");
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [changedOnlyRefs, setChangedOnlyRefs] = useState<string[] | null>(null);
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => savedAccounts());
  const [seenChangeTokens, setSeenChangeTokens] = useState<Set<string>>(() => new Set(readSeenChangeTokens()));
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<number>>(() => new Set());
  const [showIntro, setShowIntro] = useState(true);
  const [introMorphing, setIntroMorphing] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const logoTargetRef = useRef<HTMLImageElement | null>(null);
  const [logoTarget, setLogoTarget] = useState<{ x: number; y: number } | null>(null);
  const { canInstall, promptInstall } = useInstallPrompt();

  useEffect(() => {
    if (!user) return;
    saveAccount(localStorage.getItem("intf_token"), user);
    setAccounts(savedAccounts());
  }, [user]);

  useEffect(() => {
    const measure = () => {
      const rect = logoTargetRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLogoTarget({
        x: rect.left + rect.width / 2 - window.innerWidth / 2,
        y: rect.top + rect.height / 2 - window.innerHeight / 2,
      });
    };
    const frame = window.requestAnimationFrame(measure);
    const morphTimer = window.setTimeout(() => {
      measure();
      setIntroMorphing(true);
    }, 1500);
    const hideTimer = window.setTimeout(() => setShowIntro(false), 3400);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(morphTimer);
      window.clearTimeout(hideTimer);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSearch = params.get("search")?.trim() || "";
    const focus = params.get("focus");
    const changedOnly = params.get("changed") === "1";

    if (requestedSearch) {
      setSearch(requestedSearch);
      if (changedOnly) {
        setShowChangedOnly(true);
      }
      window.requestAnimationFrame(() => {
        document.getElementById("customer-shipments")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    if (focus === "announcement") {
      window.requestAnimationFrame(() => {
        document.getElementById("customer-announcement")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [location]);

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
  const searchedShipments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return shipments;
    return shipments.filter((shipment: any) => searchableText(shipment).includes(term));
  }, [shipments, search]);
  const hasSearch = search.trim().length > 0;
  const companyName = String(typedUser?.companyName || typedUser?.fullName || typedUser?.name || "InterFreight Client");
  const statusChangesByIfsRef = new Map<string, { oldValue: string; newValue: string }>();
  const notificationTokenByIfsRef = new Map<string, string>();
  const notificationTokensByIfsRef = new Map<string, string[]>();
  const notificationIdsByChangeToken = new Map<string, number[]>();
  const notificationIdsByIfsRef = new Map<string, number[]>();
  const newShipmentRefs = new Set<string>();
  for (const notification of notifications) {
    if (notification.id && dismissedNotificationIds.has(notification.id)) continue;
    if (notification.read) continue;
    if (!notification.ifsRef) continue;
    const notificationToken = notification.id
      ? `notif:${notification.id}`
      : `notif:${notification.ifsRef}:${notification.createdAt ?? ""}:${notification.title ?? ""}:${notification.message ?? ""}`;
    if (seenChangeTokens.has(notificationToken)) continue;
    notificationTokensByIfsRef.set(notification.ifsRef, [
      ...(notificationTokensByIfsRef.get(notification.ifsRef) ?? []),
      notificationToken,
    ]);

    if (notification.notificationType === "new_shipment") {
      newShipmentRefs.add(notification.ifsRef);
      if (!notificationTokenByIfsRef.has(notification.ifsRef)) {
        notificationTokenByIfsRef.set(notification.ifsRef, notificationToken);
      }
      if (notification.id) {
        notificationIdsByChangeToken.set(notificationToken, [...(notificationIdsByChangeToken.get(notificationToken) ?? []), notification.id]);
        notificationIdsByIfsRef.set(notification.ifsRef, [...(notificationIdsByIfsRef.get(notification.ifsRef) ?? []), notification.id]);
      }
      continue;
    }

    const change = parseStatusChange(notification.message);
    if (change) {
      if (!statusChangesByIfsRef.has(notification.ifsRef)) {
        statusChangesByIfsRef.set(notification.ifsRef, change);
        notificationTokenByIfsRef.set(notification.ifsRef, notificationToken);
      }
      if (notification.id) {
        notificationIdsByChangeToken.set(notificationToken, [...(notificationIdsByChangeToken.get(notificationToken) ?? []), notification.id]);
        notificationIdsByIfsRef.set(notification.ifsRef, [...(notificationIdsByIfsRef.get(notification.ifsRef) ?? []), notification.id]);
      }
    }
  }
  const markChangeAsSeen = async (args?: { changeToken?: string; ifsRef?: string }) => {
    const tokens = new Set<string>([
      ...(args?.changeToken ? [args.changeToken] : []),
      ...((args?.ifsRef ? notificationTokensByIfsRef.get(args.ifsRef) : undefined) ?? []),
    ]);
    if (tokens.size === 0) return;
    const unseenTokens = [...tokens].filter((token) => !seenChangeTokens.has(token));
    if (unseenTokens.length === 0) return;
    setSeenChangeTokens((current) => {
      const next = new Set(current);
      unseenTokens.forEach((token) => next.add(token));
      localStorage.setItem(READ_CHANGES_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
    setChangedOnlyRefs(null);
    const notificationIds = args?.ifsRef
      ? (notificationIdsByIfsRef.get(args.ifsRef) ?? [])
      : (args?.changeToken ? (notificationIdsByChangeToken.get(args.changeToken) ?? []) : []);
    if (notificationIds.length > 0) {
      setDismissedNotificationIds((current) => {
        const next = new Set(current);
        notificationIds.forEach((id) => next.add(id));
        return next;
      });
    }
    if (notificationIds.length > 0) {
      await Promise.allSettled(notificationIds.map((id) => authFetch(`/api/notifications/${id}/read`, { method: "PATCH" })));
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  const unreadTodayUpdates = notifications.filter((notification) => {
    if (!notification.status || !isToday(notification.createdAt) || !notification.ifsRef) return false;
    const notificationToken = notification.id
      ? `notif:${notification.id}`
      : `notif:${notification.ifsRef}:${notification.createdAt ?? ""}:${notification.title ?? ""}:${notification.message ?? ""}`;
    if (notification.notificationType === "new_shipment") {
      return !seenChangeTokens.has(notificationToken);
    }
    const change = parseStatusChange(notification.message);
    if (!change) return false;
    return !seenChangeTokens.has(notificationToken);
  });
  const todayUpdatedRefs = new Set(
    unreadTodayUpdates
      .map((notification) => notification.ifsRef)
      .filter((ifsRef): ifsRef is string => Boolean(ifsRef)),
  );
  const changedShipmentRefs = new Set([
    ...todayUpdatedRefs,
    ...[...newShipmentRefs]
      .filter((ifsRef) => {
        const token = notificationTokenByIfsRef.get(ifsRef);
        return token ? !seenChangeTokens.has(token) : true;
      }),
    ...[...notificationTokenByIfsRef.entries()]
      .filter(([, token]) => !seenChangeTokens.has(token))
      .map(([ifsRef]) => ifsRef),
  ]);
  const hasShipmentChanges = changedShipmentRefs.size > 0;
  const activeChangedFilter = changedOnlyRefs ? new Set(changedOnlyRefs) : changedShipmentRefs;
  const filteredShipments = useMemo(() => (
    showChangedOnly
      ? searchedShipments.filter((shipment: any) => activeChangedFilter.has(shipment.ifsRef))
      : searchedShipments
  ), [activeChangedFilter, searchedShipments, showChangedOnly]);
  const scrollToSection = (targetId: string) => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const goToProblemPage = () => {
    setLocation("/dashboard/problems");
    setShowQuickMenu(false);
  };
  const goToHomepage = () => {
    setLocation("/");
    setShowQuickMenu(false);
  };
  const scrollToTrackingSection = () => {
    document.getElementById("customer-shipments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowQuickMenu(false);
  };
  const focusChangedConsignments = () => {
    const refs = [...changedShipmentRefs];
    setSearch("");
    setShowChangedOnly(true);
    setChangedOnlyRefs(refs);
    const firstRef = refs[0];
    window.requestAnimationFrame(() => {
      const target = firstRef ? document.getElementById(`shipment-${firstRef}`) : document.getElementById("customer-shipments");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
  const sectionRows = STATUS_SECTIONS.map((section) => ({
    ...section,
    rows: filteredShipments.filter((shipment: any) => shipmentSectionLabel(shipment) === section.reportLabel),
  }));
  const statCards = [
    { icon: Package, label: "Total", value: shipments.length, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200", targetId: "customer-shipments" },
    { icon: CheckCircle, label: "Shipments In Malawi", value: shipments.filter((shipment: any) => shipmentSectionLabel(shipment) === "SHIPMENTS IN MALAWI").length, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200", targetId: sectionElementId("SHIPMENTS IN MALAWI") },
    { icon: Ship, label: "Shipments Enroute", value: shipments.filter((shipment: any) => shipmentSectionLabel(shipment) === "SHIPMENTS ENROUTE").length, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200", targetId: sectionElementId("SHIPMENTS ENROUTE") },
    { icon: MapPin, label: "Shipments At POD", value: shipments.filter((shipment: any) => shipmentSectionLabel(shipment) === "SHIPMENTS AT POD").length, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200", targetId: sectionElementId("SHIPMENTS AT POD") },
    { icon: AlertTriangle, label: "Shipments On Sea", value: shipments.filter((shipment: any) => shipmentSectionLabel(shipment) === "SHIPMENTS ON SEA").length, tone: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200", targetId: sectionElementId("SHIPMENTS ON SEA") },
  ];

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="w-14 h-14" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {showIntro && (
        <div className="dashboard-intro-overlay" aria-hidden="true">
          <div
            className={`dashboard-intro-stage ${introMorphing && logoTarget ? "dashboard-intro-stage--morphing" : ""}`}
            style={introMorphing && logoTarget ? {
              ["--dashboard-intro-x" as string]: `${logoTarget.x}px`,
              ["--dashboard-intro-y" as string]: `${logoTarget.y}px`,
              ["--dashboard-intro-scale" as string]: `${40 / 180}`,
            } : undefined}
          >
            <img src={CUSTOMER_BADGE_URL} alt="" className="dashboard-intro-logo" />
          </div>
        </div>
      )}
      <NotificationOptIn storageKey="intf_push_prompt_customer" scope={{ type: "auth" }} />
      {/* Top bar */}
      <div className="bg-secondary text-secondary-foreground shadow-lg sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 relative">
            <button
              type="button"
              onClick={() => setShowQuickMenu((current) => !current)}
              className="shrink-0 rounded-xl transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Open dashboard menu"
            >
              <img ref={logoTargetRef} src={CUSTOMER_BADGE_URL} alt={typedUser?.fullName || typedUser?.name || "Profile"} className={`h-10 w-10 rounded-xl object-cover border border-white/15 ${showIntro ? "opacity-0" : "opacity-100"}`} />
            </button>
            {showQuickMenu && (
              <div className="absolute left-0 top-12 z-50 min-w-[180px] rounded-xl border border-white/10 bg-secondary/95 p-2 shadow-xl backdrop-blur">
                <button
                  type="button"
                  onClick={scrollToTrackingSection}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  My Tracking
                </button>
                <button
                  type="button"
                  onClick={goToHomepage}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Homepage
                </button>
                <button
                  type="button"
                  onClick={goToProblemPage}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Bug/Problem
                </button>
              </div>
            )}
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
            {accounts.length > 0 && <AccountSwitcher currentToken={localStorage.getItem("intf_token")} />}
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

        <div className="mb-5 sm:mb-8 rounded-2xl border border-border bg-card text-card-foreground shadow-sm glow-card p-4 sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">Secure Consignee Portal</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-secondary dark:text-white leading-tight">
                  Welcome back, {companyName}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Review your active consignments and latest shipment changes.
                </p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf || shipmentsLoading || shipments.length === 0}
                  className={`inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all disabled:opacity-60 ${hasShipmentChanges ? "report-download-pulse" : ""}`}
                >
                  {isDownloadingPdf ? <Spinner className="w-4 h-4" /> : <Download size={16} />}
                  Download PDF Report
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {canInstall && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <Smartphone size={16} />
                  Download app
                </button>
              )}
            </div>
          </div>
        </div>

        {announcement && (
          <motion.div
            id="customer-announcement"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 sm:mb-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-3 glow-primary"
          >
            <Megaphone className="text-primary shrink-0 mt-0.5" size={20} />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-secondary">{announcement.title}</p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-0.5">{announcement.message}</p>
            </div>
          </motion.div>
        )}

        {hasShipmentChanges && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            onClick={focusChangedConsignments}
            className="mb-4 sm:mb-6 w-full rounded-xl bg-secondary text-white px-4 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-3 text-left shadow-sm glow-card glow-card--reactive"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0 live-updates-badge">
                <Bell size={18} className="text-primary" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  See changes
                  <span className="live-updates-dot" />
                </span>
                <span className="block text-xs text-white/60 truncate">
                  {changedShipmentRefs.size} consignment{changedShipmentRefs.size !== 1 ? "s" : ""} with changes
                </span>
              </span>
            </span>
            <ArrowRight size={18} className="text-white/50 shrink-0" />
          </motion.button>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-5 sm:mb-8">
          {statCards.map(({ icon: Icon, label, value, tone, targetId }, index) => (
            <motion.button
              key={label}
              type="button"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.04, duration: 0.32, ease: "easeOut" }}
              onClick={() => scrollToSection(targetId)}
              className="bg-card rounded-xl border border-border p-2 sm:p-4 shadow-sm glow-card glow-card--reactive glow-card--light flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3 min-w-0 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${tone}`}>
                <Icon size={14} className="sm:w-[18px] sm:h-[18px]" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-xs text-muted-foreground uppercase tracking-[0.06em] leading-tight">{label}</p>
                <p className="text-base sm:text-2xl font-bold text-secondary dark:text-white leading-none mt-1">{value}</p>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm glow-card p-3 sm:p-4 mb-6">
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
            {showChangedOnly && (
              <button
              type="button"
              onClick={() => {
                setShowChangedOnly(false);
                setChangedOnlyRefs(null);
              }}
              className="inline-flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/15"
            >
              Showing changed cards
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {filteredShipments.length} of {shipments.length} shipment{shipments.length !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Shipment cards */}
        <div id="customer-shipments">
        {shipmentsLoading ? (
          <div className="grid gap-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 rounded-2xl border border-border bg-card animate-pulse glow-card" />
            ))}
          </div>
        ) : shipments.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm glow-card py-20 text-center">
            <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-secondary dark:text-white mb-2">No consignments yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your shipment records will appear here once they've been uploaded by our team.
            </p>
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm glow-card py-20 text-center">
            <Search className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-secondary dark:text-white mb-2">No matching shipments</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Try searching by reference, container, invoice number, entry, shipper, or cargo description.
            </p>
          </div>
        ) : hasSearch ? (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-secondary">{filteredShipments.length}</span> shipment{filteredShipments.length !== 1 ? "s" : ""} found
                {" "}for <span className="font-semibold text-secondary">"{search.trim()}"</span>
              </p>
            </div>
            <div className="space-y-4">
              {filteredShipments.map((shipment: any, index: number) => (
                <ShipmentCard
                  key={shipment.id}
                  shipment={shipment}
                  statusChange={changedShipmentRefs.has(shipment.ifsRef) ? statusChangesByIfsRef.get(shipment.ifsRef) : undefined}
                  highlight={changedShipmentRefs.has(shipment.ifsRef)}
                  changeToken={notificationTokenByIfsRef.get(shipment.ifsRef)}
                  onViewed={markChangeAsSeen}
                  index={index}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {sectionRows.map((section, sectionIndex) => (
              <motion.section
                key={section.reportLabel}
                id={sectionElementId(section.reportLabel)}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + sectionIndex * 0.05, duration: 0.34, ease: "easeOut" }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-3 bg-secondary text-white rounded-xl px-3 sm:px-4 py-3 shadow-sm glow-card">
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
                    <div key={s.id} className="glow-card rounded-2xl">
                      <ShipmentCard
                        shipment={s}
                        statusChange={changedShipmentRefs.has(s.ifsRef) ? statusChangesByIfsRef.get(s.ifsRef) : undefined}
                        highlight={changedShipmentRefs.has(s.ifsRef)}
                        changeToken={notificationTokenByIfsRef.get(s.ifsRef)}
                        onViewed={markChangeAsSeen}
                        index={index}
                      />
                    </div>
                  ))
                )}
              </motion.section>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

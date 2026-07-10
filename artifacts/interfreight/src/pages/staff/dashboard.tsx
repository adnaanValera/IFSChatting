import { useState, useRef, useEffect } from "react";
import {
  useGetDashboardStats,
  useGetStatusBreakdown,
  useGetRecentActivity,
  useListUploads,
  useStaffLogout,
  useGetMe,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Package, FileSpreadsheet, LogOut,
  UploadCloud, Loader2, Clock, CheckCircle2, AlertTriangle, Ship,
  Truck, Trash2, MessageSquare, ChevronDown, ChevronUp, Send, Mail, Home, History,
  Building2, Download, Search, ChevronRight,
  Menu, X, UserCheck, UserX,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";

type Tab = "overview" | "import" | "history" | "messages" | "cards" | "authorize";

type Announcement = {
  id: number;
  title: string;
  message: string;
  active: boolean;
  updatedAt: string;
};

type CompanyItem = { id: number; companyName: string; shipmentCount: number };
type PendingSignup = {
  id: number;
  fullName: string;
  companyName: string;
  email: string;
  phoneNumber?: string | null;
  profilePictureUrl?: string | null;
  role: string;
  status?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
};
type Shipment = {
  id: number; ifsRef: string; mraRef?: string; containerNo?: string;
  shipper?: string; consignee?: string; cargoDescription?: string;
  invoiceNo?: string; pod?: string; finalPortDestination?: string;
  status: string; companyName: string; extraFields?: Record<string, unknown>;
  entry?: string; lastUpdated?: string;
};

type OperationalAlert = {
  id: number;
  identifier: string;
  consignee: string;
  shipper: string;
  cargoDescription: string;
  invoiceNo: string;
  eta?: string;
  status?: string;
  mraRef?: string;
};

const CARD_COLS = [
  { key: "ifsRef",              label: "IFS Ref" },
  { key: "type",                label: "Type",             extra: true },
  { key: "blNo",                label: "BL / Manifest No.", extra: true },
  { key: "containerNo",         label: "Container No." },
  { key: "shipper",             label: "Shipper" },
  { key: "consignee",           label: "Consignee" },
  { key: "cargoDescription",    label: "Cargo Desc" },
  { key: "invoiceNo",           label: "Invoice No." },
  { key: "pod",                 label: "POD" },
  { key: "finalPortDestination",label: "FPD" },
  { key: "agent",               label: "Agent",            extra: true },
  { key: "mraRef",              label: "MRA Ref" },
  { key: "entry",               label: "Entry" },
  { key: "status",              label: "Status" },
] as const;

function getCardCell(s: Shipment, key: string, extra?: boolean): string {
  if (!extra) return (s as any)[key] ?? "";
  const ex = s.extraFields ?? {};
  if (key === "type")  return (ex["Type"]  ?? ex["type"]  ?? "") as string;
  if (key === "blNo")  return (ex["BL / Manifest No."] ?? ex["BL/Manifest No."] ?? ex["BL"] ?? ex["bl"] ?? "") as string;
  if (key === "agent") return (ex["Agent"] ?? ex["agent"] ?? "") as string;
  return "";
}

function safeReportName(value: string): string {
  return value.replace(/[\/\\?%*:|"<>]/g, "-").trim() || "Report";
}

function reportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_SECTIONS = [
  { label: "SHIPMENTS IN MALAWI", statuses: ["Delivered", "Awaiting Clearance"] },
  { label: "SHIPMENTS ENROUTE",   statuses: ["In Transit", "Enroute LLW", "Enroute BLZ", "Enroute"] },
  { label: "SHIPMENTS AT POD",    statuses: ["At Port", "Offloading"] },
  { label: "SHIPMENTS ON SEA",    statuses: ["Delayed", "On Sea", "At Sea"] },
];

const UNSPECIFIED_CONSIGNEE_KEY = "__unspecified__";

function groupByConsignee(shipments: Shipment[]): { key: string; name: string; rows: Shipment[] }[] {
  const map = new Map<string, { name: string; rows: Shipment[] }>();
  for (const s of shipments) {
    const name = (s.consignee ?? "").trim();
    const key = name ? name.toLowerCase() : UNSPECIFIED_CONSIGNEE_KEY;
    if (!map.has(key)) map.set(key, { name: name || "Unspecified Consignee", rows: [] });
    map.get(key)!.rows.push(s);
  }
  return [...map.entries()]
    .map(([key, { name, rows }]) => ({ key, name, rows }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeSectionLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function shipmentSectionLabel(shipment: Shipment): string {
  const extra = shipment.extraFields ?? {};
  const sourceSection = String(extra["Source Section"] ?? extra["sourceSection"] ?? "").trim();
  if (sourceSection) {
    const matchingSection = STATUS_SECTIONS.find((section) =>
      normalizeSectionLabel(section.label) === normalizeSectionLabel(sourceSection)
    );
    if (matchingSection) return matchingSection.label;
  }

  const status = shipment.status.toLowerCase();
  return STATUS_SECTIONS.find((section) => section.statuses.some(
    (st) => status.includes(st.toLowerCase()) || st.toLowerCase().includes(status),
  ))?.label ?? "OTHER SHIPMENTS";
}

function shipmentDateSortKey(value: string): number | null {
  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const wordDate = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]+)\b/);
  if (wordDate?.[1] && wordDate[2]) {
    const month = monthNames[wordDate[2].toLowerCase()];
    if (month !== undefined) return month * 100 + Number(wordDate[1]);
  }
  const monthFirstDate = value.match(/\b([A-Za-z]+)[\s-]+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthFirstDate?.[1] && monthFirstDate[2]) {
    const month = monthNames[monthFirstDate[1].toLowerCase()];
    if (month !== undefined) return month * 100 + Number(monthFirstDate[2]);
  }
  const slashDate = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/);
  if (slashDate?.[1] && slashDate[2]) {
    return Number(slashDate[2]) * 100 + Number(slashDate[1]);
  }
  return null;
}

function shipmentSortText(shipment: Shipment): string {
  return [
    shipment.status,
    shipment.pod ?? "",
    shipment.finalPortDestination ?? "",
    shipment.cargoDescription ?? "",
    ...Object.values(shipment.extraFields ?? {}).map((value) => String(value ?? "")),
  ].join(" ");
}

function sortRowsForSection(label: string, rows: Shipment[]): Shipment[] {
  if (label !== "SHIPMENTS ON SEA") return rows;
  return [...rows].sort((a, b) => {
    const aKey = shipmentDateSortKey(shipmentSortText(a)) ?? Number.MAX_SAFE_INTEGER;
    const bKey = shipmentDateSortKey(shipmentSortText(b)) ?? Number.MAX_SAFE_INTEGER;
    return aKey - bKey;
  });
}

function renderShipmentSections(shipments: Shipment[]) {
  const otherRows = shipments.filter(s => shipmentSectionLabel(s) === "OTHER SHIPMENTS");

  const renderSection = (label: string, rows: Shipment[]) => (
    <div key={label}>
      <div className="px-5 py-2 bg-[#1F3864] text-white text-xs font-bold uppercase tracking-wider">
        {label}
        <span className="ml-2 font-normal opacity-70">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-3 text-xs text-muted-foreground italic bg-muted/20">No shipments in this category</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#D6DCE4] text-secondary">
              <tr>
                {CARD_COLS.map(col => (
                  <th key={col.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b border-border">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.id} className={i % 2 === 1 ? "bg-[#F2F2F2]" : "bg-white"}>
                  {CARD_COLS.map(col => (
                    <td key={col.key} className="px-3 py-2 whitespace-nowrap border-b border-border/50">
                      {col.key === "status"
                        ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.status === "Delivered"          ? "bg-green-100 text-green-800" :
                            s.status === "In Transit"         ? "bg-amber-100 text-amber-800" :
                            s.status === "At Port"            ? "bg-indigo-100 text-indigo-800" :
                            s.status === "Awaiting Clearance" ? "bg-blue-100 text-blue-800" :
                            s.status === "Delayed"            ? "bg-red-100 text-red-800" :
                            "bg-muted text-muted-foreground"
                          }`}>{s.status}</span>
                        : getCardCell(s, col.key, "extra" in col ? (col as { extra?: boolean }).extra : undefined)
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {STATUS_SECTIONS.map(sec =>
        renderSection(sec.label, sortRowsForSection(sec.label, shipments.filter(s => shipmentSectionLabel(s) === sec.label)))
      )}
      {otherRows.length > 0 && renderSection("OTHER SHIPMENTS", otherRows)}
    </div>
  );
}

function renderOperationalAlertTable(
  items: OperationalAlert[],
  primaryLabel: "ETA" | "MRA Ref",
  emptyText: string,
  loading: boolean,
) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
        Loading...
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-10 text-sm">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider border-b border-border">
          <tr>
            <th className="px-4 py-3">{primaryLabel}</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Consignee</th>
            <th className="px-4 py-3">Shipper</th>
            <th className="px-4 py-3">Cargo Description</th>
            <th className="px-4 py-3">Invoice No.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={`${primaryLabel}-${item.id}`} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-bold text-secondary whitespace-nowrap">
                {primaryLabel === "ETA" && item.eta ? formatDate(item.eta) : item.mraRef}
              </td>
              <td className="px-4 py-3 font-semibold text-secondary whitespace-nowrap">{item.identifier}</td>
              <td className="px-4 py-3 text-muted-foreground">{item.consignee}</td>
              <td className="px-4 py-3 text-muted-foreground">{item.shipper}</td>
              <td className="px-4 py-3 text-muted-foreground min-w-[180px]">{item.cargoDescription}</td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{item.invoiceNo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isMasterUploading, setIsMasterUploading] = useState(false);
  const [masterUploadResult, setMasterUploadResult] = useState<any>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isTemplateUploading, setIsTemplateUploading] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<{ hasTemplate: boolean; uploadedAt?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingUploadId, setDownloadingUploadId] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [expandedStatusSection, setExpandedStatusSection] = useState<string | null>(null);
  const [expandedOverviewPanel, setExpandedOverviewPanel] = useState<"nearby" | "checking" | "new" | "activity" | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<number, string>>({});
  const [sendingReply, setSendingReply] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [pendingSignups, setPendingSignups] = useState<PendingSignup[]>([]);
  const [signupHistory, setSignupHistory] = useState<PendingSignup[]>([]);
  const [pendingSignupsLoading, setPendingSignupsLoading] = useState(false);
  const [pendingSignupAction, setPendingSignupAction] = useState<string | null>(null);
  const [pendingSignupPictures, setPendingSignupPictures] = useState<Record<number, string>>({});

  const { data: user } = useGetMe();
  const logoutMutation = useStaffLogout();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: statusBreakdown, isLoading: breakdownLoading } = useGetStatusBreakdown();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity();
  const { data: uploads, isLoading: uploadsLoading } = useListUploads();

  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [operationalAlerts, setOperationalAlerts] = useState<{
    nearbyConsignments: OperationalAlert[];
    needsChecking: OperationalAlert[];
  } | null>(null);
  const [operationalAlertsLoading, setOperationalAlertsLoading] = useState(false);

  const loadPendingSignups = async () => {
    setPendingSignupsLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/pending-signups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load pending signups");
      const rows = await res.json();
      setPendingSignups(rows);
      setPendingSignupPictures((current) => {
        const next = { ...current };
        for (const row of rows as PendingSignup[]) {
          if (next[row.id] === undefined) next[row.id] = row.profilePictureUrl || "";
        }
        return next;
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not load signups", description: err.message });
    } finally {
      setPendingSignupsLoading(false);
    }
  };

  const loadSignupHistory = async () => {
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/signup-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load signup history");
      setSignupHistory(await res.json());
    } catch {
      setSignupHistory([]);
    }
  };

  const handlePendingSignup = async (id: number, action: "approve" | "reject") => {
    setPendingSignupAction(`${action}-${id}`);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/pending-signups/${id}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profilePictureUrl: action === "approve" ? (pendingSignupPictures[id] ?? "").trim() : undefined,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `${action} failed`);
      }
      toast({
        title: action === "approve" ? "Signup approved" : "Signup rejected",
        description: action === "approve" ? "The user can now log in." : "The request was rejected.",
      });
      await loadPendingSignups();
      await loadSignupHistory();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setPendingSignupAction(null);
    }
  };

  // ── Company Cards state ───────────────────────────────────────────────────
  const [companiesList, setCompaniesList] = useState<CompanyItem[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [companyShipments, setCompanyShipments] = useState<Record<string, Shipment[]>>({});
  const [loadingCompany, setLoadingCompany] = useState<string | null>(null);
  const [downloadingCompany, setDownloadingCompany] = useState<string | null>(null);
  const [expandedConsignee, setExpandedConsignee] = useState<string | null>(null);
  const [downloadingConsignee, setDownloadingConsignee] = useState<string | null>(null);

  const typedUser = user as any;
  const isAdmin = typedUser?.role === "admin";

  const loadOperationalAlerts = async () => {
    setOperationalAlertsLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/stats/operational-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load operational alerts");
      setOperationalAlerts(await res.json());
    } catch {
      setOperationalAlerts({ nearbyConsignments: [], needsChecking: [] });
    } finally {
      setOperationalAlertsLoading(false);
    }
  };

  useEffect(() => {
    loadOperationalAlerts();
    loadPendingSignups();
    loadSignupHistory();
  }, []);

  const loadAnnouncement = async () => {
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/announcements/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setAnnouncement(data);
      setAnnouncementTitle(data?.title ?? "");
      setAnnouncementMessage(data?.message ?? "");
    } catch {
      setAnnouncement(null);
    }
  };

  useEffect(() => {
    if (isAdmin) loadAnnouncement();
  }, [isAdmin]);

  const saveAnnouncement = async (active = true) => {
    setAnnouncementSaving(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/announcements/current`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: announcementTitle, message: announcementMessage, active }),
      });
      if (!res.ok) throw new Error("Failed to save announcement");
      const data = await res.json();
      setAnnouncement(data);
      if (!data) {
        setAnnouncementTitle("");
        setAnnouncementMessage("");
      }
      toast({ title: active ? "Announcement published" : "Announcement cleared" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Announcement failed", description: err.message });
    } finally {
      setAnnouncementSaving(false);
    }
  };

  // ── Company Cards functions ───────────────────────────────────────────────
  const loadCompanies = async () => {
    if (companiesLoaded) return;
    setCompaniesLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/companies`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load companies");
      setCompaniesList(await res.json());
      setCompaniesLoaded(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setCompaniesLoading(false);
    }
  };

  const loadCompanyShipments = async (name: string) => {
    if (companyShipments[name]) return;
    setLoadingCompany(name);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/shipments?companyFilter=${encodeURIComponent(name)}&limit=500`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load shipments");
      const data = await res.json();
      setCompanyShipments(prev => ({ ...prev, [name]: data.items ?? [] }));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoadingCompany(null);
    }
  };

  const toggleCompanyCard = (name: string) => {
    if (expandedCompany === name) {
      setExpandedCompany(null);
    } else {
      setExpandedCompany(name);
      setExpandedConsignee(null);
      loadCompanyShipments(name);
    }
  };

  const toggleConsigneeCard = (companyName: string, consigneeKey: string) => {
    const key = `${companyName}::${consigneeKey}`;
    setExpandedConsignee(prev => (prev === key ? null : key));
  };

  const downloadConsigneeReport = async (companyName: string, consigneeKey: string, consigneeName: string, format: "excel" | "pdf") => {
    const key = `${companyName}::${consigneeKey}::${format}`;
    setDownloadingConsignee(key);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(
        `${base}/api/staff/company-report/${encodeURIComponent(companyName)}/consignee/${encodeURIComponent(consigneeKey)}/${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Status Report - ${safeReportName(companyName)} - ${safeReportName(consigneeName)} (${reportDateStamp()}).${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    } finally {
      setDownloadingConsignee(null);
    }
  };

  const downloadCompanyReport = async (name: string, format: "excel" | "pdf") => {
    setDownloadingCompany(`${name}::${format}`);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/company-report/${encodeURIComponent(name)}/${format}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Status Report - ${safeReportName(name)} (${reportDateStamp()}).${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    } finally {
      setDownloadingCompany(null);
    }
  };

  const loadFeedback = async () => {
    if (feedbackLoaded) return;
    setFeedbackLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/feedback`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load messages");
      setFeedback(await res.json());
      setFeedbackLoaded(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const checkTemplateStatus = async () => {
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/template-status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setTemplateStatus(await res.json());
    } catch { /* silent */ }
  };

  const handleTemplateFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx")) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Template must be an .xlsx file." });
      return;
    }
    setIsTemplateUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("intf_token");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/upload-template`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      await checkTemplateStatus();
      toast({ title: "Template Saved", description: "All future reports will use this template." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Template Upload Failed", description: err.message });
    } finally {
      setIsTemplateUploading(false);
      if (templateFileInputRef.current) templateFileInputRef.current.value = "";
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setIsMobileNavOpen(false);
    if (tab === "messages") loadFeedback();
    if (tab === "cards") loadCompanies();
    if (tab === "import") checkTemplateStatus();
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
        localStorage.removeItem("intf_session_duration_confirmed");
        queryClient.clear();
        setLocation("/auth");
      },
    });
  };

  const handleMasterFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx")) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Tracking master must be an .xlsx file." });
      return;
    }
    setIsMasterUploading(true);
    setMasterUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("intf_token");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/upload-master`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || result.error || "Upload failed");
      setMasterUploadResult(result);
      toast({
        title: result.failedRows > 0 ? "Master Uploaded with Warnings" : "Tracking Master Uploaded",
        description: result.message,
        variant: result.failedRows > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/status-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/recent-activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/uploads"] });
      loadOperationalAlerts();
      setCompaniesLoaded(false); // force reload of company list
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: err.message || "An error occurred" });
    } finally {
      setIsMasterUploading(false);
      if (masterFileInputRef.current) masterFileInputRef.current.value = "";
    }
  };

  const handleDownloadAllReports = async () => {
    setIsDownloadingZip(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/all-reports-zip`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2,"0")}.${String(today.getMonth()+1).padStart(2,"0")}.${String(today.getFullYear()).slice(2)}`;
      a.href = url; a.download = `IFS-Status-Reports-${dateStr}.zip`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast({ title: "Reports Downloaded", description: "All status reports have been saved as a ZIP file." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download Failed", description: err.message });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const invalid = files.filter((f) => !f.name.endsWith(".xlsx") && !f.name.endsWith(".csv"));
    if (invalid.length > 0) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: `${invalid.map((f) => f.name).join(", ")} — only .xlsx and .csv are supported.`,
      });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const token = localStorage.getItem("intf_token");

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || result.error || "Upload failed");

      setUploadResult(result);
      toast({
        title: result.failedRows > 0 ? "Upload Completed with Warnings" : "Upload Successful",
        description: result.message,
        variant: result.failedRows > 0 ? "destructive" : "default",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/status-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/recent-activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/uploads"] });
      loadOperationalAlerts();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: err.message || "An error occurred during upload" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteUpload = async (id: number, filename: string) => {
    if (!confirm(`Delete "${filename}" and all its shipment records? This cannot be undone.`)) return;
    setDeletingId(id);
    const token = localStorage.getItem("intf_token");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/uploads/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Delete failed");
      }
      toast({ title: "Upload deleted", description: `"${filename}" and its shipments have been removed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/status-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/recent-activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/uploads"] });
      loadOperationalAlerts();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadUpload = async (id: number, filename: string) => {
    setDownloadingUploadId(id);
    const token = localStorage.getItem("intf_token");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/uploads/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Download failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameMatch?.[1] || `${safeReportName(filename)}-${reportDateStamp()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    } finally {
      setDownloadingUploadId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete ALL uploads and ALL shipment data? This will completely wipe the system and cannot be undone.")) return;
    setDeletingAll(true);
    const token = localStorage.getItem("intf_token");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/uploads`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete all data");
      toast({ title: "All data cleared", description: "All uploads and shipments have been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/status-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/recent-activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/uploads"] });
      loadOperationalAlerts();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to clear data", description: err.message });
    } finally {
      setDeletingAll(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    const token = localStorage.getItem("intf_token");
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/staff/feedback/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFeedback((prev) => prev.map((f) => (f.id === id ? updated : f)));
    }
  };

  const handleSendReply = async (id: number) => {
    const text = replyTexts[id]?.trim();
    if (!text) return;
    setSendingReply(id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/feedback/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: text }),
      });
      if (!res.ok) throw new Error("Failed to save reply");
      const updated = await res.json();
      setFeedback((prev) => prev.map((f) => (f.id === id ? updated : f)));
      setReplyTexts((prev) => ({ ...prev, [id]: "" }));
      toast({ title: "Reply saved", description: "The reply has been recorded." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSendingReply(null);
    }
  };

  const handleDeleteFeedback = async (id: number) => {
    if (!confirm("Delete this message permanently?")) return;
    setDeletingFeedbackId(id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/staff/feedback/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete message." });
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const isLoading = statsLoading || breakdownLoading || activityLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const unreadCount = feedback.filter((f) => f.status === "unread").length;
  const dashboardStats = stats as any;
  const activityPayload = recentActivity as any;
  const recentUpdates = Array.isArray(activityPayload) ? activityPayload : (activityPayload?.recentActivity ?? []);
  const newConsignments = Array.isArray(activityPayload) ? [] : (activityPayload?.newConsignments ?? []);
  const sectionCount = (label: string) =>
    dashboardStats?.sectionCounts?.find((section: { label: string; count: number }) => section.label === label)?.count ?? 0;
  const overviewCards = [
    {
      label: "Total Containers",
      value: dashboardStats?.totalContainers ?? 0,
      note: "Managed in the system",
      icon: <Package size={22} />,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Companies",
      value: dashboardStats?.totalCompanies ?? 0,
      note: "Active clients",
      icon: <Users size={22} />,
      tone: "bg-green-50 text-green-600",
    },
    {
      label: "Shipments In Malawi",
      sectionLabel: "SHIPMENTS IN MALAWI",
      value: sectionCount("SHIPMENTS IN MALAWI"),
      note: "Delivered or clearance",
      icon: <CheckCircle2 size={22} />,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Shipments Enroute",
      sectionLabel: "SHIPMENTS ENROUTE",
      value: sectionCount("SHIPMENTS ENROUTE"),
      note: "Moving inland",
      icon: <Truck size={22} />,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Shipments At POD",
      sectionLabel: "SHIPMENTS AT POD",
      value: sectionCount("SHIPMENTS AT POD"),
      note: "At discharge port",
      icon: <Ship size={22} />,
      tone: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Shipments On Sea",
      sectionLabel: "SHIPMENTS ON SEA",
      value: sectionCount("SHIPMENTS ON SEA"),
      note: "Sea freight stage",
      icon: <AlertTriangle size={22} />,
      tone: "bg-red-50 text-red-600",
    },
  ];

  const navItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { id: "import", label: "Data Import", icon: <UploadCloud size={18} /> },
    { id: "cards", label: "Company Cards", icon: <Building2 size={18} />, badge: companiesLoaded ? companiesList.length : undefined },
    { id: "history", label: "Upload History", icon: <History size={18} />, badge: uploads?.length },
    { id: "authorize", label: "Authorize Sign Up", icon: <UserCheck size={18} />, badge: pendingSignups.length || undefined },
    { id: "messages", label: "Messages", icon: <MessageSquare size={18} />, badge: unreadCount || undefined },
  ];

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col">
      {/* Top bar */}
      <header className="bg-secondary text-white h-14 flex items-center px-4 sm:px-6 border-b border-white/10 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3 flex-1">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <LayoutDashboard size={18} className="text-primary" />
          <span className="font-bold text-base tracking-tight">Staff Dashboard</span>
          <Link
            href="/"
            className="ml-4 text-xs text-white/50 hover:text-white flex items-center gap-1 transition-colors"
          >
            <Home size={12} /> Home
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {typedUser && (
            <span className="text-sm text-white/60 hidden sm:block">
              {typedUser.fullName || typedUser.name}
              {isAdmin && (
                <span className="ml-2 text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full font-semibold">Admin</span>
              )}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setIsMobileNavOpen(false)}
          />
        )}
        {/* Left sidebar */}
        <aside className={`fixed lg:sticky top-14 left-0 z-50 lg:z-auto w-64 lg:w-56 shrink-0 bg-white border-r border-border flex flex-col h-[calc(100vh-3.5rem)] shadow-xl lg:shadow-sm transition-transform duration-200 ease-out ${
          isMobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}>
          <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-bold text-secondary text-sm">Menu</span>
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(false)}
              className="p-2 rounded-lg text-muted-foreground hover:text-secondary hover:bg-muted transition-colors"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
          <nav className="flex-1 py-4 px-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === item.id
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-secondary"
                }`}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    activeTab === item.id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}

            {isAdmin && (
              <>
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Admin</p>
                </div>
                <button
                  onClick={() => setLocation("/staff/users")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-secondary transition-all"
                >
                  <Users size={18} /> Manage Users
                </button>
              </>
            )}
          </nav>

          <div className="p-3 border-t border-border">
            <div className="text-xs text-muted-foreground/60 text-center">InterFreight Solutions</div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">

          {/* ── OVERVIEW ──────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-8 max-w-6xl">
              <div>
                <h2 className="text-2xl font-extrabold text-secondary mb-1">Dashboard</h2>
                <p className="text-sm text-muted-foreground">Overview of all shipments and activity</p>
              </div>

              {isAdmin && (
                <div className="bg-secondary text-white rounded-xl border border-white/10 shadow-sm p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-2">Customer Announcement</p>
                      <input
                        value={announcementTitle}
                        onChange={(e) => setAnnouncementTitle(e.target.value)}
                        placeholder="Announcement title"
                        className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex-[2]">
                      <textarea
                        value={announcementMessage}
                        onChange={(e) => setAnnouncementMessage(e.target.value)}
                        placeholder="Message customers should see on their dashboard"
                        rows={2}
                        className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-primary resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveAnnouncement(true)}
                        disabled={announcementSaving || !announcementTitle.trim() || !announcementMessage.trim()}
                        className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-bold disabled:opacity-50"
                      >
                        Publish
                      </button>
                      <button
                        type="button"
                        onClick={() => saveAnnouncement(false)}
                        disabled={announcementSaving || !announcement}
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {announcement && (
                    <p className="text-xs text-white/45 mt-3">
                      Live now: <span className="text-white/75 font-semibold">{announcement.title}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {overviewCards.map((card: any) => {
                  const sectionDetails = card.sectionLabel
                    ? (statusBreakdown as any[])?.find((item) => item.status === card.sectionLabel)
                    : null;
                  const isExpanded = expandedStatusSection === card.sectionLabel;

                  return (
                  <div key={card.label} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                    <button
                      type="button"
                      disabled={!card.sectionLabel}
                      onClick={() => card.sectionLabel && setExpandedStatusSection(prev => prev === card.sectionLabel ? null : card.sectionLabel)}
                      className={`w-full p-6 text-left ${card.sectionLabel ? "hover:bg-muted/20 transition-colors" : "cursor-default"}`}
                    >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
                        <h3 className="text-3xl font-extrabold text-secondary">{card.value}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`p-2.5 rounded-xl ${card.tone}`}>{card.icon}</div>
                        {card.sectionLabel && (
                          <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{card.note}</p>
                    </button>
                    {card.sectionLabel && isExpanded && (
                      <div className="px-6 pb-5 space-y-2 border-t border-border/60 bg-muted/10 pt-4">
                        {sectionDetails?.details?.length ? sectionDetails.details.map((detail: { status: string; count: number }) => (
                          <div key={detail.status} className="flex items-center justify-between gap-3">
                            <StatusBadge status={detail.status} />
                            <span className="font-semibold text-secondary text-sm">{detail.count}</span>
                          </div>
                        )) : (
                          <p className="text-xs text-muted-foreground py-1">No statuses in this section</p>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="space-y-3">
                  <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedOverviewPanel(prev => prev === "nearby" ? null : "nearby")}
                      className="w-full p-5 flex items-center justify-between gap-4 text-left bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Clock size={18} className="text-primary shrink-0" />
                        <span className="font-bold text-secondary truncate">Nearby Consignments</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-secondary bg-muted px-3 py-1 rounded-md text-sm">
                          {operationalAlerts?.nearbyConsignments?.length ?? 0}
                        </span>
                        <ChevronRight size={16} className={`text-muted-foreground transition-transform ${expandedOverviewPanel === "nearby" ? "rotate-90" : ""}`} />
                      </span>
                    </button>
                    {expandedOverviewPanel === "nearby" && renderOperationalAlertTable(
                      operationalAlerts?.nearbyConsignments ?? [],
                      "ETA",
                      "No ETA consignments within the next 15 days",
                      operationalAlertsLoading,
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedOverviewPanel(prev => prev === "checking" ? null : "checking")}
                      className="w-full p-5 flex items-center justify-between gap-4 text-left bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <AlertTriangle size={18} className="text-primary shrink-0" />
                        <span className="font-bold text-secondary truncate">Needs Checking</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-secondary bg-muted px-3 py-1 rounded-md text-sm">
                          {operationalAlerts?.needsChecking?.length ?? 0}
                        </span>
                        <ChevronRight size={16} className={`text-muted-foreground transition-transform ${expandedOverviewPanel === "checking" ? "rotate-90" : ""}`} />
                      </span>
                    </button>
                    {expandedOverviewPanel === "checking" && renderOperationalAlertTable(
                      operationalAlerts?.needsChecking ?? [],
                      "MRA Ref",
                      "No consignments currently need entry checking",
                      operationalAlertsLoading,
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedOverviewPanel(prev => prev === "new" ? null : "new")}
                      className="w-full p-5 flex items-center justify-between gap-4 text-left bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Package size={18} className="text-primary shrink-0" />
                        <span className="font-bold text-secondary truncate">New Consignments</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-secondary bg-muted px-3 py-1 rounded-md text-sm">
                          {newConsignments.length}
                        </span>
                        <ChevronRight size={16} className={`text-muted-foreground transition-transform ${expandedOverviewPanel === "new" ? "rotate-90" : ""}`} />
                      </span>
                    </button>
                    {expandedOverviewPanel === "new" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                            <tr>
                              <th className="px-5 py-3">Identifier</th>
                              <th className="px-5 py-3">Consignee</th>
                              <th className="px-5 py-3">Shipper</th>
                              <th className="px-5 py-3">Description</th>
                              <th className="px-5 py-3">Invoice</th>
                              <th className="px-5 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {newConsignments.map((item: any) => (
                              <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3.5 font-semibold text-secondary whitespace-nowrap">{item.identifier || item.containerNo || item.ifsRef}</td>
                                <td className="px-5 py-3.5 text-muted-foreground">{item.consignee || item.companyName || "N/A"}</td>
                                <td className="px-5 py-3.5 text-muted-foreground">{item.shipper || "N/A"}</td>
                                <td className="px-5 py-3.5 text-muted-foreground min-w-[220px]">{item.cargoDescription || "N/A"}</td>
                                <td className="px-5 py-3.5 text-muted-foreground">{item.invoiceNo || "N/A"}</td>
                                <td className="px-5 py-3.5"><StatusBadge status={item.status || "New"} /></td>
                              </tr>
                            ))}
                            {!newConsignments.length && (
                              <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                                  No new consignments found in the latest upload
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedOverviewPanel(prev => prev === "activity" ? null : "activity")}
                      className="w-full p-5 flex items-center justify-between gap-4 text-left bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Clock size={18} className="text-primary shrink-0" />
                        <span className="font-bold text-secondary truncate">Recent Activity</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-secondary bg-muted px-3 py-1 rounded-md text-sm">
                          {recentUpdates.length}
                        </span>
                        <ChevronRight size={16} className={`text-muted-foreground transition-transform ${expandedOverviewPanel === "activity" ? "rotate-90" : ""}`} />
                      </span>
                    </button>
                    {expandedOverviewPanel === "activity" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                            <tr>
                              <th className="px-5 py-3">Reference</th>
                              <th className="px-5 py-3">Company</th>
                              <th className="px-5 py-3">Changes</th>
                              <th className="px-5 py-3 text-right">Updated</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {recentUpdates.map((activity: any) => (
                              <tr key={activity.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3.5 font-semibold text-secondary">{activity.ifsRef}</td>
                                <td className="px-5 py-3.5 text-muted-foreground">{activity.companyName}</td>
                                <td className="px-5 py-3.5 min-w-[260px]">
                                  <div className="space-y-2">
                                    {(activity.changes ?? []).slice(0, 4).map((change: any, index: number) => (
                                      <div key={`${activity.id}-${change.field}-${index}`} className="text-xs">
                                        <span className="font-semibold text-secondary">{change.field}: </span>
                                        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{change.oldValue || "N/A"}</span>
                                        <span className="mx-1 font-semibold text-primary">-&gt;</span>
                                        <span className="font-semibold text-secondary">{change.newValue || "N/A"}</span>
                                      </div>
                                    ))}
                                    {(activity.changes ?? []).length > 4 && (
                                      <p className="text-xs text-muted-foreground">+{(activity.changes ?? []).length - 4} more change(s)</p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-right text-muted-foreground whitespace-nowrap text-xs">
                                  {formatDate(activity.lastUpdated)}
                                </td>
                              </tr>
                            ))}
                            {!recentUpdates.length && (
                              <tr>
                                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground text-sm">
                                  No changes found in the latest upload
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ── DATA IMPORT ───────────────────────────────── */}
          {activeTab === "import" && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h2 className="text-2xl font-extrabold text-secondary mb-1">Data Import</h2>
                <p className="text-sm text-muted-foreground">Upload the daily Tracking Master to generate per-client status reports</p>
              </div>

              {/* ── REPORT TEMPLATE ── */}
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={18} className="text-muted-foreground" />
                    <h3 className="font-bold text-secondary">Report Template</h3>
                  </div>
                  {templateStatus?.hasTemplate && (
                    <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-semibold">
                      <CheckCircle2 size={12} /> Template active
                    </span>
                  )}
                </div>
                <div className="p-5 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {templateStatus?.hasTemplate
                      ? <>Your template is in use. Reports will duplicate it and fill in the data. <span className="text-muted-foreground/70">Uploaded {templateStatus.uploadedAt ? new Date(templateStatus.uploadedAt).toLocaleDateString() : "recently"}.</span></>
                      : "Upload a sample .xlsx report once. All future reports will use it as their template — preserving your exact layout, styles, and branding."}
                  </p>
                  <div className="shrink-0">
                    <input type="file" ref={templateFileInputRef} className="hidden" accept=".xlsx" onChange={handleTemplateFileChange} disabled={isTemplateUploading} />
                    <button
                      onClick={() => !isTemplateUploading && templateFileInputRef.current?.click()}
                      disabled={isTemplateUploading}
                      className="flex items-center gap-2 border border-border hover:border-primary/50 hover:bg-primary/5 text-secondary font-medium px-4 py-2 rounded-lg transition-all disabled:opacity-60 text-sm whitespace-nowrap"
                    >
                      {isTemplateUploading
                        ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                        : <><UploadCloud size={14} /> {templateStatus?.hasTemplate ? "Replace Template" : "Upload Template"}</>
                      }
                    </button>
                  </div>
                </div>
              </div>

              {/* ── TRACKING MASTER UPLOAD ── */}
              <div className="bg-white rounded-xl border-2 border-primary/30 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between bg-primary/5">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={18} className="text-primary" />
                    <h3 className="font-bold text-secondary">Daily Tracking Master</h3>
                    <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full font-semibold">Main</span>
                  </div>
                </div>
                <div className="p-6 space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Upload your <strong>TRACKING_MASTER.xlsx</strong> file each day. The system will read every row, group shipments by consignee, and prepare individual status reports for every client — all ready to download as a ZIP.
                  </p>

                  {/* Drop zone */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                      isMasterUploading
                        ? "border-primary/50 bg-primary/5"
                        : "border-primary/30 hover:border-primary hover:bg-primary/5 cursor-pointer"
                    }`}
                    onClick={() => !isMasterUploading && masterFileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={masterFileInputRef}
                      className="hidden"
                      accept=".xlsx"
                      onChange={handleMasterFileChange}
                      disabled={isMasterUploading}
                    />
                    {isMasterUploading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <p className="font-semibold text-secondary">Processing Tracking Master…</p>
                        <p className="text-sm text-muted-foreground">Importing all shipments and grouping by consignee</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <UploadCloud className="w-12 h-12 text-primary/50" />
                        <p className="font-bold text-secondary text-lg">Click to Upload Tracking Master</p>
                        <p className="text-sm text-muted-foreground">TRACKING_MASTER.xlsx — single file</p>
                        <span className="mt-1 inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm">
                          <UploadCloud size={16} /> Choose File
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Result + Download ZIP */}
                  {masterUploadResult && (
                    <div className={`border rounded-xl p-5 ${masterUploadResult.failedRows > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                      <div className="flex gap-3">
                        {masterUploadResult.failedRows > 0
                          ? <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                          : <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
                        }
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-semibold ${masterUploadResult.failedRows > 0 ? "text-amber-800" : "text-green-800"}`}>
                            {masterUploadResult.failedRows > 0 ? "Uploaded with Warnings" : "Tracking Master Uploaded"}
                          </h4>
                          <p className={`text-sm mt-1 ${masterUploadResult.failedRows > 0 ? "text-amber-700" : "text-green-700"}`}>
                            {masterUploadResult.totalRows} rows across{" "}
                            <strong>{masterUploadResult.consignees?.length ?? 0} companies</strong> —{" "}
                            <span className="font-medium">{masterUploadResult.newRecords} new</span>,{" "}
                            <span className="font-medium">{masterUploadResult.updatedRecords} updated</span>
                            {masterUploadResult.failedRows > 0 && <span className="text-red-600">, {masterUploadResult.failedRows} failed</span>}
                          </p>
                          {masterUploadResult.consignees?.length > 0 && (
                            <p className="text-xs mt-2 text-muted-foreground">
                              Companies: {masterUploadResult.consignees.slice(0, 8).join(", ")}{masterUploadResult.consignees.length > 8 ? ` +${masterUploadResult.consignees.length - 8} more` : ""}
                            </p>
                          )}
                          {masterUploadResult.failureReasons?.length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs font-medium text-red-600 cursor-pointer">View failure reasons</summary>
                              <ul className="mt-2 space-y-1">
                                {masterUploadResult.failureReasons.map((r: string, i: number) => (
                                  <li key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 font-mono">{r}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      </div>

                      {/* Download ZIP button */}
                      {(masterUploadResult.consignees?.length ?? 0) > 0 && (
                        <button
                          onClick={handleDownloadAllReports}
                          disabled={isDownloadingZip}
                          className="mt-4 w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-white font-semibold px-5 py-3 rounded-lg transition-all disabled:opacity-60 text-sm shadow-sm"
                        >
                          {isDownloadingZip
                            ? <><Loader2 size={16} className="animate-spin" /> Generating Reports…</>
                            : <><Download size={16} /> Download All {masterUploadResult.consignees.length} Status Reports (ZIP)</>
                          }
                        </button>
                      )}
                    </div>
                  )}

                  {/* Download all even without just having uploaded */}
                  {!masterUploadResult && (
                    <button
                      onClick={handleDownloadAllReports}
                      disabled={isDownloadingZip}
                      className="w-full flex items-center justify-center gap-2 border border-border hover:border-primary/50 hover:bg-primary/5 text-secondary font-medium px-5 py-2.5 rounded-lg transition-all disabled:opacity-60 text-sm"
                    >
                      {isDownloadingZip
                        ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                        : <><Download size={15} /> Download All Current Reports (ZIP)</>
                      }
                    </button>
                  )}
                </div>
              </div>

              {/* ── OTHER FILE UPLOADS ── */}
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border flex items-center gap-2 bg-muted/20">
                  <FileSpreadsheet size={18} className="text-primary" />
                  <h3 className="font-bold text-secondary">Other Files</h3>
                  <span className="text-xs text-muted-foreground">(generic Excel / CSV upload)</span>
                </div>
                <div className="p-6">
                  <div
                    className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                      isUploading
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
                    }`}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".xlsx,.csv"
                      multiple
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <p className="font-semibold text-secondary text-lg">Processing File…</p>
                        <p className="text-sm text-muted-foreground">This may take a moment</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <UploadCloud className="w-12 h-12 text-muted-foreground/50" />
                        <p className="font-bold text-secondary text-lg">Click to Upload Excel Files</p>
                        <p className="text-sm text-muted-foreground">Select one or more .xlsx or .csv files</p>
                        <span className="mt-1 inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
                          <UploadCloud size={16} /> Choose Files
                        </span>
                      </div>
                    )}
                  </div>

                  {uploadResult && (
                    <div className={`mt-5 border rounded-xl p-5 ${uploadResult.failedRows > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                      <div className="flex gap-3">
                        {uploadResult.failedRows > 0
                          ? <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                          : <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
                        }
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-semibold ${uploadResult.failedRows > 0 ? "text-amber-800" : "text-green-800"}`}>
                            {uploadResult.failedRows > 0 ? "Upload Complete with Warnings" : "Upload Successful"}
                          </h4>
                          <p className={`text-sm mt-1 ${uploadResult.failedRows > 0 ? "text-amber-700" : "text-green-700"}`}>
                            {uploadResult.totalRows} rows —{" "}
                            <span className="font-medium text-green-700">{uploadResult.newRecords} new</span>,{" "}
                            <span className="font-medium text-blue-700">{uploadResult.updatedRecords} updated</span>
                            {uploadResult.failedRows > 0 && <span className="font-medium text-red-600">, {uploadResult.failedRows} failed</span>}
                          </p>
                          {uploadResult.failureReasons?.length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs font-medium text-red-600 cursor-pointer">View failure reasons</summary>
                              <ul className="mt-2 space-y-1">
                                {uploadResult.failureReasons.map((r: string, i: number) => (
                                  <li key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 font-mono">{r}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 border border-border rounded-xl p-4 bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tips</p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Supported: <strong>.xlsx</strong> and <strong>.csv</strong></li>
                      <li>Files named <code className="text-xs bg-muted px-1 rounded">Status Report - CompanyName.xlsx</code> are auto-tagged by company</li>
                      <li>Duplicate IFS Refs are updated, not duplicated</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── UPLOAD HISTORY ────────────────────────────── */}
          {activeTab === "history" && (
            <div className="space-y-6 max-w-4xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Upload History</h2>
                  <p className="text-sm text-muted-foreground">All uploaded files and their import results</p>
                </div>
                {uploads && uploads.length > 0 && (
                  <button
                    onClick={handleDeleteAll}
                    disabled={deletingAll}
                    className="flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all disabled:opacity-60 shrink-0"
                  >
                    {deletingAll
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />
                    }
                    {deletingAll ? "Clearing…" : "Delete All Data"}
                  </button>
                )}
              </div>

              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-2">
                    <History size={18} className="text-primary" />
                    <h3 className="font-bold text-secondary">
                      {uploads?.length ?? 0} Upload{uploads?.length !== 1 ? "s" : ""}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground">Click trash icon to delete individual upload</span>
                </div>

                {uploadsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : !uploads?.length ? (
                  <div className="py-16 text-center">
                    <FileSpreadsheet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-semibold text-secondary mb-1">No uploads yet</p>
                    <p className="text-sm text-muted-foreground">
                      Go to{" "}
                      <button
                        onClick={() => setActiveTab("import")}
                        className="text-primary underline"
                      >
                        Data Import
                      </button>{" "}
                      to upload your first file
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {uploads.map((upload) => (
                      <div key={upload.id} className="flex flex-col gap-3 px-4 py-4 hover:bg-muted/20 transition-colors group sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                        <div className="p-2 bg-muted rounded-lg shrink-0">
                          <FileSpreadsheet size={18} className="text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-secondary leading-snug break-words sm:truncate" title={upload.filename}>
                            {upload.filename}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Uploaded {formatDate(upload.uploadedAt)} · by {upload.uploadedBy}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                          <span className="text-xs bg-muted px-2 py-1 rounded font-medium text-muted-foreground">{upload.totalRows} rows</span>
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded font-medium">+{upload.newRecords} new</span>
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">~{upload.updatedRecords} updated</span>
                        </div>
                        <div className="flex items-center gap-2 sm:shrink-0">
                          <button
                            onClick={() => handleDownloadUpload(upload.id, upload.filename)}
                            disabled={downloadingUploadId === upload.id}
                            title="Download original uploaded file"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-secondary/90 disabled:opacity-60"
                          >
                            {downloadingUploadId === upload.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Download size={14} />
                            }
                            Download
                          </button>
                          <button
                            onClick={() => handleDeleteUpload(upload.id, upload.filename)}
                            disabled={deletingId === upload.id}
                            title="Delete this upload and its shipments"
                            className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 p-2 rounded-lg hover:bg-red-50"
                          >
                            {deletingId === upload.id
                              ? <Loader2 size={16} className="animate-spin" />
                              : <Trash2 size={16} />
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COMPANY CARDS ─────────────────────────────── */}
          {activeTab === "cards" && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Company Cards</h2>
                  <p className="text-sm text-muted-foreground">View and download status report cards per company</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleDownloadAllReports}
                    disabled={isDownloadingZip}
                    className="flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all disabled:opacity-60"
                  >
                    {isDownloadingZip ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    {isDownloadingZip ? "Generating..." : "Download All"}
                  </button>
                  <button
                    onClick={() => handleTabChange("import")}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all"
                  >
                    <UploadCloud size={15} /> Upload / Refresh Data
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search company…"
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                />
              </div>

              {companiesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : companiesList.length === 0 ? (
                <div className="bg-white rounded-xl border border-border shadow-sm py-20 text-center">
                  <Building2 className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-secondary mb-2">No companies yet</p>
                  <p className="text-sm text-muted-foreground">Upload shipment data to populate company cards.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {companiesList
                    .filter(c => !companySearch || c.companyName.toLowerCase().includes(companySearch.toLowerCase()))
                    .map(company => {
                      const isExpanded = expandedCompany === company.companyName;
                      const isLoadingThis = loadingCompany === company.companyName;
                      const isDownloadingExcel = downloadingCompany === `${company.companyName}::excel`;
                      const isDownloadingPdf = downloadingCompany === `${company.companyName}::pdf`;
                      const isDownloading = isDownloadingExcel;
                      const shipments = companyShipments[company.companyName] ?? [];

                      return (
                        <div key={company.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                          {/* Card header */}
                          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                            <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                              <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
                                <Building2 size={18} className="text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-secondary leading-snug break-words sm:truncate">{company.companyName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{company.shipmentCount} shipment{company.shipmentCount !== 1 ? "s" : ""}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:shrink-0">
                              <button
                                onClick={() => downloadCompanyReport(company.companyName, "excel")}
                                disabled={isDownloadingExcel || isDownloadingPdf}
                                className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold bg-secondary hover:bg-secondary/90 text-white px-2 sm:px-3 py-2 rounded-lg transition-all disabled:opacity-60"
                                title="Download Excel report"
                              >
                                {isDownloadingExcel ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                {isDownloading ? "Generating…" : "Download"}
                              </button>
                              <button
                                onClick={() => downloadCompanyReport(company.companyName, "pdf")}
                                disabled={isDownloadingExcel || isDownloadingPdf}
                                className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold bg-primary hover:bg-primary/90 text-white px-2 sm:px-3 py-2 rounded-lg transition-all disabled:opacity-60"
                                title="Download PDF report"
                              >
                                {isDownloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                PDF
                              </button>
                              <button
                                onClick={() => toggleCompanyCard(company.companyName)}
                                className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-secondary border border-border px-2 sm:px-3 py-2 rounded-lg transition-all"
                              >
                                {isLoadingThis ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />}
                                {isExpanded ? "Close" : "View"}
                              </button>
                            </div>
                          </div>

                          {/* Expanded: consignee groups within this company */}
                          {isExpanded && (
                            <div className="border-t border-border">
                              {isLoadingThis ? (
                                <div className="flex items-center justify-center py-10">
                                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                </div>
                              ) : shipments.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8 text-sm">No shipments found for this company.</p>
                              ) : (
                                <div className="divide-y divide-border">
                                  {groupByConsignee(shipments).map(group => {
                                    const consKey = `${company.companyName}::${group.key}`;
                                    const isConsExpanded = expandedConsignee === consKey;
                                    const isConsDownloadingExcel = downloadingConsignee === `${consKey}::excel`;
                                    const isConsDownloadingPdf = downloadingConsignee === `${consKey}::pdf`;
                                    const isConsDownloading = isConsDownloadingExcel;

                                    return (
                                      <div key={group.key} className="bg-muted/10">
                                        {/* Consignee sub-header */}
                                        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:pl-10 sm:pr-5">
                                          <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                                            <div className="p-2 bg-secondary/10 rounded-lg shrink-0">
                                              <Users size={15} className="text-secondary" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="font-semibold text-secondary text-sm leading-snug break-words sm:truncate">{group.name}</p>
                                              <p className="text-xs text-muted-foreground mt-0.5">
                                                {group.rows.length} shipment{group.rows.length !== 1 ? "s" : ""}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:shrink-0">
                                            <button
                                              onClick={() => downloadConsigneeReport(company.companyName, group.key, group.name, "excel")}
                                              disabled={isConsDownloadingExcel || isConsDownloadingPdf}
                                              className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/90 text-white px-2 py-1.5 rounded-lg transition-all disabled:opacity-60 sm:px-2.5"
                                              title="Download Excel report for this consignee"
                                            >
                                              {isConsDownloadingExcel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                              {isConsDownloading ? "Generating…" : "Download"}
                                            </button>
                                            <button
                                              onClick={() => downloadConsigneeReport(company.companyName, group.key, group.name, "pdf")}
                                              disabled={isConsDownloadingExcel || isConsDownloadingPdf}
                                              className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white px-2 py-1.5 rounded-lg transition-all disabled:opacity-60 sm:px-2.5"
                                              title="Download PDF report for this consignee"
                                            >
                                              {isConsDownloadingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                              PDF
                                            </button>
                                            <button
                                              onClick={() => toggleConsigneeCard(company.companyName, group.key)}
                                              className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-secondary border border-border px-2 py-1.5 rounded-lg transition-all sm:px-2.5"
                                            >
                                              <ChevronRight size={13} className={`transition-transform ${isConsExpanded ? "rotate-90" : ""}`} />
                                              {isConsExpanded ? "Close" : "View"}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Expanded consignee shipments table */}
                                        {isConsExpanded && (
                                          <div className="border-t border-border/60 bg-white">
                                            {renderShipmentSections(group.rows)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── MESSAGES ──────────────────────────────────── */}
          {activeTab === "authorize" && (
            <div className="space-y-6 max-w-5xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Authorize Sign Up</h2>
                  <p className="text-sm text-muted-foreground">Approve or reject new account requests before they can access tracking.</p>
                </div>
                <button onClick={() => { loadPendingSignups(); loadSignupHistory(); }} className="text-sm text-primary hover:underline">
                  Refresh
                </button>
              </div>

              {pendingSignupsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : pendingSignups.length === 0 ? (
                <div className="bg-white rounded-2xl border border-border shadow-sm py-20 text-center">
                  <UserCheck className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-secondary mb-2">No pending signups</p>
                  <p className="text-sm text-muted-foreground">New requests will appear here before accounts are created.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingSignups.map((signup) => {
                    const approving = pendingSignupAction === `approve-${signup.id}`;
                    const rejecting = pendingSignupAction === `reject-${signup.id}`;
                    return (
                      <div key={signup.id} className="bg-white rounded-xl border border-border shadow-sm p-5">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-bold text-secondary text-lg">{signup.fullName}</span>
                              <span className="text-xs font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-2 py-1 rounded-full">{signup.role}</span>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-2 text-sm">
                              <p><span className="text-muted-foreground">Company:</span> <span className="font-semibold text-secondary">{signup.companyName}</span></p>
                              <p><span className="text-muted-foreground">Phone:</span> <span className="font-semibold text-secondary">{signup.phoneNumber || "N/A"}</span></p>
                              <p><span className="text-muted-foreground">Email:</span> <span className="font-semibold text-secondary break-all">{signup.email}</span></p>
                              <p><span className="text-muted-foreground">Requested:</span> <span className="font-semibold text-secondary">{formatDate(signup.createdAt)}</span></p>
                            </div>
                            <div className="mt-4">
                              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Profile picture URL
                              </label>
                              <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                  type="url"
                                  value={pendingSignupPictures[signup.id] ?? ""}
                                  onChange={(e) => setPendingSignupPictures((current) => ({ ...current, [signup.id]: e.target.value }))}
                                  placeholder="https://..."
                                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                                {(pendingSignupPictures[signup.id] ?? "").trim() ? (
                                  <img
                                    src={pendingSignupPictures[signup.id]}
                                    alt={signup.fullName}
                                    className="h-14 w-14 rounded-full object-cover border border-border shrink-0"
                                  />
                                ) : (
                                  <div className="h-14 w-14 rounded-full border border-dashed border-border bg-muted/30 shrink-0" />
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handlePendingSignup(signup.id, "approve")}
                              disabled={!!pendingSignupAction}
                              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {approving ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
                              Yes
                            </button>
                            <button
                              onClick={() => handlePendingSignup(signup.id, "reject")}
                              disabled={!!pendingSignupAction}
                              className="inline-flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {rejecting ? <Loader2 size={15} className="animate-spin" /> : <UserX size={15} />}
                              No
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-secondary">Sign Up History</h3>
                    <p className="text-xs text-muted-foreground">All approval requests, newest first</p>
                  </div>
                  <span className="text-xs font-bold bg-muted text-muted-foreground px-2 py-1 rounded-full">{signupHistory.length}</span>
                </div>
                {signupHistory.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No signup history yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider border-b border-border">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Company</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Requested</th>
                          <th className="px-4 py-3">Reviewed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {signupHistory.map((signup) => (
                          <tr key={`history-${signup.id}`} className="hover:bg-muted/20">
                            <td className="px-4 py-3 font-semibold text-secondary whitespace-nowrap">{signup.fullName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{signup.companyName}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <div className="font-semibold text-secondary break-all">{signup.email}</div>
                              <div>{signup.phoneNumber || "N/A"}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                signup.status === "approved"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : signup.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {signup.status || "pending"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(signup.createdAt)}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {signup.reviewedAt ? formatDate(signup.reviewedAt) : "N/A"}
                              {signup.reviewedBy && <div className="text-[11px]">{signup.reviewedBy}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Messages</h2>
                  <p className="text-sm text-muted-foreground">Contact form submissions from the website</p>
                </div>
                <button
                  onClick={() => { setFeedbackLoaded(false); loadFeedback(); }}
                  className="text-sm text-primary hover:underline"
                >
                  Refresh
                </button>
              </div>

              {feedbackLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : feedback.length === 0 ? (
                <div className="bg-white rounded-2xl border border-border shadow-sm py-20 text-center">
                  <Mail className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-secondary mb-2">No messages yet</p>
                  <p className="text-sm text-muted-foreground">Messages from the website contact form will appear here.</p>
                </div>
              ) : (
                feedback.map((msg) => {
                  const isExpanded = expandedFeedback === msg.id;
                  const statusColor =
                    msg.status === "unread"
                      ? "bg-primary/10 text-primary"
                      : msg.status === "replied"
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground";

                  return (
                    <div
                      key={msg.id}
                      className={`bg-white rounded-xl border shadow-sm transition-all ${
                        msg.status === "unread" ? "border-primary/30" : "border-border"
                      }`}
                    >
                      <div
                        className="flex items-start gap-4 p-5 cursor-pointer"
                        onClick={() => {
                          setExpandedFeedback(isExpanded ? null : msg.id);
                          if (msg.status === "unread") handleMarkRead(msg.id);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-secondary">{msg.name}</span>
                            <span className="text-muted-foreground text-sm">&lt;{msg.email}&gt;</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                              {msg.status}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{msg.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(msg.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteFeedback(msg.id); }}
                            disabled={deletingFeedbackId === msg.id}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            title="Delete message"
                          >
                            {deletingFeedbackId === msg.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />
                            }
                          </button>
                          {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-5 pb-5 border-t border-border/60 pt-4">
                          <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap mb-5">{msg.message}</p>

                          {msg.replyText && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                              <p className="text-xs font-semibold text-green-700 mb-1">Your reply:</p>
                              <p className="text-sm text-green-800 whitespace-pre-wrap">{msg.replyText}</p>
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {msg.replyText ? "Update reply" : "Write a reply"} (internal note)
                            </label>
                            <textarea
                              rows={3}
                              value={replyTexts[msg.id] ?? ""}
                              onChange={(e) => setReplyTexts((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                              placeholder="Type your reply here…"
                              className="w-full px-4 py-3 rounded-xl border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm bg-background resize-none transition-all"
                            />
                            <button
                              onClick={() => handleSendReply(msg.id)}
                              disabled={sendingReply === msg.id || !replyTexts[msg.id]?.trim()}
                              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all disabled:opacity-50"
                            >
                              {sendingReply === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                              Save Reply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

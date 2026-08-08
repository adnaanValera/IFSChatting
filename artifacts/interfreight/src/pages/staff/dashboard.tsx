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
  UploadCloud, Clock, CheckCircle2, AlertTriangle, Ship,
  Truck, Trash2, MessageSquare, ChevronDown, ChevronUp, Send, Mail, Home, History,
  Building2, Download, Search, ChevronRight,
  Menu, X, UserCheck, UserX, Bell, Smartphone, ReceiptText, Check,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateOnly } from "@/lib/utils";
import { AccountSwitcher } from "@/components/auth/AccountSwitcher";
import { NotificationOptIn } from "@/components/auth/NotificationOptIn";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { saveAccount } from "@/lib/saved-accounts";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { isNativeAppEnvironment, isStandaloneDisplay } from "@/lib/pwa";
import { Spinner } from "@/components/ui/spinner";

type Tab = "overview" | "import" | "history" | "messages" | "problems" | "cards" | "authorize" | "activity" | "border" | "spreadsheet" | "asycuda";

type Announcement = {
  id: number;
  title: string;
  message: string;
  active: boolean;
  updatedAt: string;
  expiresAt?: string | null;
  audience?: string;
  targetUserIds?: string | null;
};

type CompanyItem = { id: number; companyName: string; shipmentCount: number };
const WEB_APP_ICON_REFRESH_KEY = "intf_web_app_icon_refresh_2026_07";
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
type AnnouncementCustomer = {
  id: number;
  fullName: string;
  companyName: string;
  email: string;
};
type SavedReport = {
  id: number;
  report_scope: string;
  company_name: string;
  consignee_name?: string | null;
  format: string;
  filename: string;
  mime_type: string;
  generated_by?: string | null;
  created_at: string;
};
type FeedbackItem = {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  phoneNumber?: string | null;
  source: string;
  category?: string | null;
  message: string;
  status: string;
  replyText?: string | null;
  repliedAt?: string | null;
  createdAt: string;
};
type ActivityItem = {
  id: number;
  fullName: string;
  companyName: string;
  email: string;
  lastSeenAt?: string | null;
  lastLoginAt?: string | null;
  activeSessions?: number;
  notificationDevices?: number;
  unreadNotifications?: number;
  lastNotificationAt?: string | null;
  lastViewedChangeAt?: string | null;
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

type BorderEntryRow = {
  shipmentId: number;
  ifsRef: string;
  mraRef: string;
  shipper: string;
  consignee: string;
  invoiceNo: string;
  borderName?: string;
  sourceSection?: string;
  arrivedAtBorder: string;
  sdoChecked: boolean;
  releaseOrderChecked: boolean;
  releasedFromBorder: string;
  driverPhone: string;
  arrivalConfirmed: boolean;
  finalConfirmed: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type SpreadsheetColumn = {
  id: string;
  label: string;
  width: string;
};

type SpreadsheetRow = {
  id: string;
  cells: Record<string, string>;
};

type SpreadsheetSelection = {
  rowId: string;
  columnId: string;
};

type SpreadsheetMerge = {
  rowId: string;
  columnId: string;
  span: number;
};

type SpreadsheetCellStyle = {
  fill: "none" | "yellow" | "green" | "blue";
  bold: boolean;
  align: "left" | "center" | "right";
};

const STAFF_STATIONS = ["Blantyre", "Lilongwe", "Mwanza", "Dedza", "Songwe", "Liwonde", "KIA", "Chileka", "Mchinji"] as const;
const READ_ONLY_BORDER_STATIONS = new Set(["Blantyre", "Lilongwe"]);
const BORDER_ONLY_STATIONS = new Set(["Mwanza", "Dedza", "Songwe", "Liwonde", "KIA", "Chileka", "Mchinji"]);
const normalizeBorderStation = (value: string) =>
  value.toLowerCase().replace(/\bborder\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const SPREADSHEET_COLUMN_LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const DEFAULT_SPREADSHEET_CELL_STYLE: SpreadsheetCellStyle = { fill: "none", bold: false, align: "left" };

const createSpreadsheetColumns = (): SpreadsheetColumn[] =>
  SPREADSHEET_COLUMN_LETTERS.map((letter) => ({ id: letter, label: letter, width: "120px" }));

const createSpreadsheetRows = (): SpreadsheetRow[] => {
  const columns = createSpreadsheetColumns();
  const rows = Array.from({ length: 300 }, (_, index) => ({
    id: `row-${index + 1}`,
    cells: Object.fromEntries(columns.map((column) => [column.id, ""])),
  }));

  rows[0]!.cells["A"] = "Section";
  rows[0]!.cells["B"] = "IFS Ref";
  rows[0]!.cells["C"] = "MRA Ref";
  rows[0]!.cells["D"] = "Shipper";
  rows[0]!.cells["E"] = "Consignee";
  rows[0]!.cells["F"] = "Invoice No.";
  rows[0]!.cells["G"] = "Status";
  rows[0]!.cells["H"] = "Notes";
  rows[1]!.cells["A"] = "Shipments on Sea";
  rows[1]!.cells["B"] = "IFS120/08/2026";
  rows[1]!.cells["C"] = "MRA902144";
  rows[1]!.cells["D"] = "Atlas Exporters";
  rows[1]!.cells["E"] = "Natpack";
  rows[1]!.cells["F"] = "INV-1022";
  rows[1]!.cells["G"] = "ETA 12-Aug";
  rows[1]!.cells["H"] = "Example row";
  rows[2]!.cells["A"] = "Shipments Enroute";
  rows[2]!.cells["B"] = "IFS121/08/2026";
  rows[2]!.cells["C"] = "MRA902145";
  rows[2]!.cells["D"] = "SV Industries";
  rows[2]!.cells["E"] = "Kris Offset";
  rows[2]!.cells["F"] = "INV-1023";
  rows[2]!.cells["G"] = "Enroute Blantyre";

  return rows;
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

function normalizeDateLikeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function normalizePhoneLikeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

function openPdfBlob(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the report file."));
    reader.readAsDataURL(blob);
  });
}

function postNativeAppMessage(payload: Record<string, unknown>) {
  if (typeof window === "undefined") return false;
  const bridge = (window as any).ReactNativeWebView;
  if (!bridge?.postMessage) return false;
  bridge.postMessage(JSON.stringify(payload));
  return true;
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
  ].join("  |  ");
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
  primaryLabel: "ETA" | "MRA Ref" | "Status",
  emptyText: string,
  loading: boolean,
) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Spinner className="w-5 h-5 mr-2" />
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
                {primaryLabel === "ETA"
                  ? (item.eta ? formatDateOnly(item.eta) : "N/A")
                  : primaryLabel === "MRA Ref"
                    ? item.mraRef
                    : (item.status || "N/A")}
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
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const knownFeedbackIdsRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const asycudaFileInputRef = useRef<HTMLInputElement>(null);
  const masterInvoiceFileInputRef = useRef<HTMLInputElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [showWebAppRefresh, setShowWebAppRefresh] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem(WEB_APP_ICON_REFRESH_KEY);
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isMasterUploading, setIsMasterUploading] = useState(false);
  const [masterUploadResult, setMasterUploadResult] = useState<any>(null);
  const [asycudaFile, setAsycudaFile] = useState<File | null>(null);
  const [masterInvoiceFile, setMasterInvoiceFile] = useState<File | null>(null);
  const [isAsycudaProcessing, setIsAsycudaProcessing] = useState(false);
  const [asycudaSummary, setAsycudaSummary] = useState<any>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isTemplateUploading, setIsTemplateUploading] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<{ hasTemplate: boolean; uploadedAt?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingUploadId, setDownloadingUploadId] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [expandedStatusSection, setExpandedStatusSection] = useState<string | null>(null);
  const [expandedOverviewPanel, setExpandedOverviewPanel] = useState<"nearby" | "checking" | "documents" | "mra" | "new" | "activity" | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<number, string>>({});
  const [sendingReply, setSendingReply] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementTargetAll, setAnnouncementTargetAll] = useState(true);
  const [announcementCustomers, setAnnouncementCustomers] = useState<AnnouncementCustomer[]>([]);
  const [announcementTargetIds, setAnnouncementTargetIds] = useState<number[]>([]);
  const [pendingSignups, setPendingSignups] = useState<PendingSignup[]>([]);

  const dismissWebAppRefresh = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(WEB_APP_ICON_REFRESH_KEY, "done");
    }
    setShowWebAppRefresh(false);
  };
  const [signupHistory, setSignupHistory] = useState<PendingSignup[]>([]);
  const [pendingSignupsLoading, setPendingSignupsLoading] = useState(false);
  const [pendingSignupAction, setPendingSignupAction] = useState<string | null>(null);
  const [clearingSignupId, setClearingSignupId] = useState<number | null>(null);
  const [pendingSignupPictures, setPendingSignupPictures] = useState<Record<number, string>>({});
  const nativeApp = typeof window !== "undefined" && isNativeAppEnvironment();

  const { data: user } = useGetMe();
  const logoutMutation = useStaffLogout();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: statusBreakdown, isLoading: breakdownLoading } = useGetStatusBreakdown();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity();
  const { data: uploads, isLoading: uploadsLoading } = useListUploads();
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedReportsLoading, setSavedReportsLoading] = useState(false);
  const [downloadingSavedReportId, setDownloadingSavedReportId] = useState<number | null>(null);

  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [activityRows, setActivityRows] = useState<ActivityItem[]>([]);
  const [accountActivityLoading, setAccountActivityLoading] = useState(false);
  const [borderEntries, setBorderEntries] = useState<BorderEntryRow[]>([]);
  const [borderEntriesLoading, setBorderEntriesLoading] = useState(false);
  const [borderSavingByShipment, setBorderSavingByShipment] = useState<Record<number, boolean>>({});
  const [borderSearch, setBorderSearch] = useState("");
  const [expandedBorderCard, setExpandedBorderCard] = useState<number | null>(null);
  const [borderMode, setBorderMode] = useState<"entry" | "exit">("entry");
  const [editingBorderShipmentId, setEditingBorderShipmentId] = useState<number | null>(null);
  const [borderEditSnapshot, setBorderEditSnapshot] = useState<BorderEntryRow | null>(null);
  const [spreadsheetColumns, setSpreadsheetColumns] = useState<SpreadsheetColumn[]>(() => createSpreadsheetColumns());
  const [spreadsheetRows, setSpreadsheetRows] = useState<SpreadsheetRow[]>(() => createSpreadsheetRows());
  const [selectedSpreadsheetCell, setSelectedSpreadsheetCell] = useState<SpreadsheetSelection | null>(
    { rowId: "row-1", columnId: "A" },
  );
  const [spreadsheetMerges, setSpreadsheetMerges] = useState<SpreadsheetMerge[]>([]);
  const [draggedSpreadsheetCell, setDraggedSpreadsheetCell] = useState<SpreadsheetSelection | null>(null);
  const [spreadsheetCellStyles, setSpreadsheetCellStyles] = useState<Record<string, SpreadsheetCellStyle>>({});
  const borderSaveTimersRef = useRef<Record<number, number>>({});
  const [stationSaving, setStationSaving] = useState(false);
  const [operationalAlerts, setOperationalAlerts] = useState<{
    nearbyConsignments: OperationalAlert[];
    needsChecking: OperationalAlert[];
    documentsNeeded: OperationalAlert[];
    mraRefNeeded: OperationalAlert[];
  } | null>(null);
  const [operationalAlertsLoading, setOperationalAlertsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    saveAccount(localStorage.getItem("intf_token"), user);
  }, [user]);

  useEffect(() => {
    void loadSavedReports(true);
  }, []);

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

  const loadSavedReports = async (silent = false) => {
    setSavedReportsLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/saved-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load saved reports");
      setSavedReports(await res.json());
    } catch (err: any) {
      if (!silent) {
        toast({ variant: "destructive", title: "Could not load saved reports", description: err.message });
      }
    } finally {
      setSavedReportsLoading(false);
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

  const clearSignupRequest = async (id: number) => {
    setClearingSignupId(id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/pending-signups/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not clear signup request");
      }
      toast({
        title: "Signup request cleared",
        description: "That person can now sign up again from scratch.",
      });
      await loadPendingSignups();
      await loadSignupHistory();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Clear failed", description: err.message });
    } finally {
      setClearingSignupId(null);
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
  const [downloadingConsignee, setDownloadingConsignee] = useState<string | null>(null);

  const typedUser = user as any;
  const normalizedUserRole = typeof typedUser?.role === "string" ? typedUser.role.trim().toLowerCase() : "";
  const isAdmin = normalizedUserRole === "admin";
  const isStaff = normalizedUserRole === "staff";
  const isStaffOrAdmin = isAdmin || isStaff;
  const staffStation = typeof typedUser?.station === "string" ? typedUser.station.trim() : "";
  const staffNeedsStation = isStaff && !staffStation;
  const stationRestrictedStaff = isStaff && BORDER_ONLY_STATIONS.has(staffStation);
  const borderReadOnlyStaff = isStaff && READ_ONLY_BORDER_STATIONS.has(staffStation);
  const borderReadOnlyViewer = isAdmin || borderReadOnlyStaff;
  const canUseSpreadsheetSample = isAdmin || (isStaff && staffStation === "Blantyre");

  const spreadsheetGridColumns = ["64px", ...spreadsheetColumns.map((column) => column.width)].join(" ");

  const createBlankSpreadsheetRow = (): SpreadsheetRow => ({
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cells: Object.fromEntries(spreadsheetColumns.map((column) => [column.id, ""])),
  });

  const spreadsheetColumnLabel = (index: number) => {
    let value = index + 1;
    let label = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  };

  const updateSpreadsheetCell = (rowId: string, columnId: string, value: string) => {
    setSpreadsheetRows((current) => current.map((row) => (
      row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row
    )));
  };

  const insertSpreadsheetRow = (index: number) => {
    setSpreadsheetRows((current) => {
      const next = [...current];
      next.splice(index, 0, createBlankSpreadsheetRow());
      return next;
    });
  };

  const deleteSpreadsheetRow = (rowId: string) => {
    setSpreadsheetRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      setSpreadsheetMerges((existing) => existing.filter((merge) => merge.rowId !== rowId));
      if (selectedSpreadsheetCell?.rowId === rowId) {
        setSelectedSpreadsheetCell(next[0] ? { rowId: next[0].id, columnId: spreadsheetColumns[0]?.id ?? "" } : null);
      }
      return next;
    });
  };

  const moveSpreadsheetRow = (index: number, direction: -1 | 1) => {
    setSpreadsheetRows((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(targetIndex, 0, row);
      return next;
    });
  };

  const selectedSpreadsheetIndex = spreadsheetRows.findIndex((row) => row.id === selectedSpreadsheetCell?.rowId);
  const selectedSpreadsheetRow = selectedSpreadsheetIndex >= 0 ? spreadsheetRows[selectedSpreadsheetIndex] : null;
  const selectedSpreadsheetColumn = spreadsheetColumns.find((column) => column.id === selectedSpreadsheetCell?.columnId) ?? null;
  const selectedSpreadsheetStyle = selectedSpreadsheetCell ? spreadsheetCellStyles[`${selectedSpreadsheetCell.rowId}:${selectedSpreadsheetCell.columnId}`] ?? DEFAULT_SPREADSHEET_CELL_STYLE : DEFAULT_SPREADSHEET_CELL_STYLE;

  const setSpreadsheetCellStyle = (updater: (current: SpreadsheetCellStyle) => SpreadsheetCellStyle) => {
    if (!selectedSpreadsheetCell) return;
    const key = `${selectedSpreadsheetCell.rowId}:${selectedSpreadsheetCell.columnId}`;
    setSpreadsheetCellStyles((current) => ({
      ...current,
      [key]: updater(current[key] ?? DEFAULT_SPREADSHEET_CELL_STYLE),
    }));
  };

  const autoFitColumns = (targetColumnId?: string) => {
    setSpreadsheetColumns((current) => current.map((column) => {
      if (targetColumnId && column.id !== targetColumnId) return column;
      const maxLength = Math.max(
        column.label.length,
        ...spreadsheetRows.map((row) => (row.cells[column.id] ?? "").length),
      );
      const width = Math.min(260, Math.max(80, maxLength * 9 + 24));
      return { ...column, width: `${width}px` };
    }));
  };

  const mergeSpreadsheetCellRight = () => {
    if (!selectedSpreadsheetCell) return;
    const columnIndex = spreadsheetColumns.findIndex((column) => column.id === selectedSpreadsheetCell.columnId);
    if (columnIndex < 0 || columnIndex >= spreadsheetColumns.length - 1) return;
    setSpreadsheetMerges((current) => {
      const filtered = current.filter((merge) => !(merge.rowId === selectedSpreadsheetCell.rowId && merge.columnId === selectedSpreadsheetCell.columnId));
      return [...filtered, { rowId: selectedSpreadsheetCell.rowId, columnId: selectedSpreadsheetCell.columnId, span: 2 }];
    });
  };

  const unmergeSpreadsheetCell = () => {
    if (!selectedSpreadsheetCell) return;
    setSpreadsheetMerges((current) => current.filter((merge) => !(merge.rowId === selectedSpreadsheetCell.rowId && merge.columnId === selectedSpreadsheetCell.columnId)));
  };

  const isMergedAwayCell = (rowId: string, columnIndex: number) => {
    return spreadsheetMerges.some((merge) => {
      if (merge.rowId !== rowId) return false;
      const startIndex = spreadsheetColumns.findIndex((column) => column.id === merge.columnId);
      return startIndex >= 0 && columnIndex > startIndex && columnIndex < startIndex + merge.span;
    });
  };

  const getMergeSpan = (rowId: string, columnId: string) => {
    return spreadsheetMerges.find((merge) => merge.rowId === rowId && merge.columnId === columnId)?.span ?? 1;
  };

  const swapSpreadsheetCells = (from: SpreadsheetSelection, to: SpreadsheetSelection) => {
    if (from.rowId === to.rowId && from.columnId === to.columnId) return;
    setSpreadsheetRows((current) => {
      const fromRow = current.find((row) => row.id === from.rowId);
      const toRow = current.find((row) => row.id === to.rowId);
      if (!fromRow || !toRow) return current;
      const fromValue = fromRow.cells[from.columnId] ?? "";
      const toValue = toRow.cells[to.columnId] ?? "";
      return current.map((row) => {
        if (row.id === from.rowId && row.id === to.rowId) {
          return {
            ...row,
            cells: { ...row.cells, [from.columnId]: toValue, [to.columnId]: fromValue },
          };
        }
        if (row.id === from.rowId) return { ...row, cells: { ...row.cells, [from.columnId]: toValue } };
        if (row.id === to.rowId) return { ...row, cells: { ...row.cells, [to.columnId]: fromValue } };
        return row;
      });
    });
  };


  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

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
      setOperationalAlerts({ nearbyConsignments: [], needsChecking: [], documentsNeeded: [], mraRefNeeded: [] });
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
      const res = await fetch(`${base}/api/staff/announcements/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setAnnouncement(data);
      setAnnouncementTitle(data?.title ?? "");
      setAnnouncementMessage(data?.message ?? "");
      setAnnouncementTargetAll((data?.audience ?? "all") === "all");
      setAnnouncementTargetIds(
        String(data?.targetUserIds ?? "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value)),
      );
    } catch {
      setAnnouncement(null);
    }
  };

  useEffect(() => {
    if (isStaffOrAdmin) {
      loadAnnouncement();
      loadAnnouncementCustomers();
    }
  }, [isStaffOrAdmin]);

  const loadAnnouncementCustomers = async () => {
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/announcement-customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load customers");
      setAnnouncementCustomers(await res.json());
    } catch {
      setAnnouncementCustomers([]);
    }
  };

  const saveAnnouncement = async (active = true) => {
    setAnnouncementSaving(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/announcements/current`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: announcementTitle,
          message: announcementMessage,
          active,
          targetAll: announcementTargetAll,
          targetUserIds: announcementTargetAll ? [] : announcementTargetIds,
        }),
      });
      if (!res.ok) throw new Error("Failed to save announcement");
      const data = await res.json();
      setAnnouncement(data);
      if (!data) {
        setAnnouncementTitle("");
        setAnnouncementMessage("");
        setAnnouncementTargetAll(true);
        setAnnouncementTargetIds([]);
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
      loadCompanyShipments(name);
    }
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
      const fileName = `Status Report - ${safeReportName(companyName)} - ${safeReportName(consigneeName)} (${reportDateStamp()}).${format === "pdf" ? "pdf" : "xlsx"}`;

      if (nativeApp) {
        postNativeAppMessage({
          type: "native-file-request",
          url: `${base}/api/staff/company-report/${encodeURIComponent(companyName)}/consignee/${encodeURIComponent(consigneeKey)}/${format}`,
          authToken: token,
          fileName,
          mimeType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: format === "pdf" ? "Open consignee report" : "Open consignee Excel report",
          openAfterSave: format === "pdf",
        });
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (format === "pdf") {
          openPdfBlob(url);
        } else {
          URL.revokeObjectURL(url);
        }
      }

      toast({ title: "Report ready", description: format === "pdf" ? "Choose where to open or share the PDF report." : "Choose where to open or share the Excel report." });
      void loadSavedReports(true);
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
      const fileName = `Status Report - ${safeReportName(name)} (${reportDateStamp()}).${format === "pdf" ? "pdf" : "xlsx"}`;

      if (nativeApp) {
        postNativeAppMessage({
          type: "native-file-request",
          url: `${base}/api/staff/company-report/${encodeURIComponent(name)}/${format}`,
          authToken: token,
          fileName,
          mimeType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: format === "pdf" ? "Open company report" : "Open company Excel report",
          openAfterSave: format === "pdf",
        });
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (format === "pdf") {
          openPdfBlob(url);
        } else {
          URL.revokeObjectURL(url);
        }
      }

      toast({ title: "Report ready", description: format === "pdf" ? "Choose where to open or share the PDF report." : "Choose where to open or share the Excel report." });
      void loadSavedReports(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    } finally {
      setDownloadingCompany(null);
    }
  };

  const handleDownloadSavedReport = async (report: SavedReport) => {
    setDownloadingSavedReportId(report.id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/saved-reports/${report.id}/download`, {
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
      const fileName = filenameMatch?.[1] || report.filename;
      const isPdf = (report.format || "").toLowerCase() === "pdf";

      if (nativeApp) {
        postNativeAppMessage({
          type: "native-file-request",
          url: `${base}/api/staff/saved-reports/${report.id}/download`,
          authToken: token,
          fileName,
          mimeType: isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: isPdf ? "Open saved PDF report" : "Open saved Excel report",
          openAfterSave: isPdf,
        });
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (isPdf) {
          openPdfBlob(url);
        } else {
          URL.revokeObjectURL(url);
        }
      }

      toast({ title: "Saved report ready", description: isPdf ? "Choose where to open or share the PDF report." : "Choose where to open or share the Excel report." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    } finally {
      setDownloadingSavedReportId(null);
    }
  };

  const loadFeedback = async (silent = false) => {
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
      if (!silent) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    } finally {
      setFeedbackLoading(false);
    }
  };

  const loadActivity = async (silent = false) => {
    setAccountActivityLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load activity");
      setActivityRows(await res.json());
    } catch (err: any) {
      if (!silent) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    } finally {
      setAccountActivityLoading(false);
    }
  };

  const loadBorderEntries = async (silent = false) => {
    setBorderEntriesLoading(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/border-entries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load border entry rows");
      setBorderEntries(await res.json());
    } catch (err: any) {
      if (!silent) {
        toast({ variant: "destructive", title: "Could not load border entry", description: err.message });
      }
    } finally {
      setBorderEntriesLoading(false);
    }
  };

  const handleChooseStation = async (station: typeof STAFF_STATIONS[number]) => {
    setStationSaving(true);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/station`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ station }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save station");
      }
      await queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Station saved", description: `${station} is now linked to this staff account.` });
      if (station !== "Blantyre") {
        setActiveTab("border");
        void loadBorderEntries(true);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not save station", description: err.message });
    } finally {
      setStationSaving(false);
    }
  };

  const saveBorderEntry = async (row: BorderEntryRow, mode: "arrival" | "final" | "correction") => {
    if (borderReadOnlyViewer && mode !== "correction") {
      return;
    }
    setBorderSavingByShipment((current) => ({ ...current, [row.shipmentId]: true }));
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/border-entries/${row.shipmentId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          arrivedAtBorder: row.arrivedAtBorder ?? "",
          sdoChecked: !!row.sdoChecked,
          releaseOrderChecked: !!row.releaseOrderChecked,
          releasedFromBorder: row.releasedFromBorder ?? "",
          driverPhone: row.driverPhone ?? "",
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save border entry");
      }
      setBorderEntries((current) => current.map((item) => (
        item.shipmentId === row.shipmentId
          ? {
              ...item,
              arrivalConfirmed: mode === "arrival" ? true : mode === "correction" ? !!row.arrivedAtBorder : item.arrivalConfirmed,
              finalConfirmed: mode === "final" ? true : mode === "correction" ? !!row.arrivedAtBorder && !!row.releasedFromBorder && !!row.driverPhone && (!!row.sdoChecked || !!row.releaseOrderChecked) : item.finalConfirmed,
            }
          : item
      )));
      if (mode === "final" && expandedBorderCard === row.shipmentId) {
        setExpandedBorderCard(null);
      }
      if (mode === "correction") {
        setEditingBorderShipmentId(null);
        setBorderEditSnapshot(null);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setBorderSavingByShipment((current) => ({ ...current, [row.shipmentId]: false }));
    }
  };

  const updateBorderEntryField = (shipmentId: number, field: "arrivedAtBorder" | "releasedFromBorder" | "driverPhone", value: string) => {
    if (borderReadOnlyViewer) {
      return;
    }
    const normalizedValue = field === "driverPhone" ? normalizePhoneLikeInput(value) : normalizeDateLikeInput(value);
    setBorderEntries((current) => {
      const next = current.map((row) => (
        row.shipmentId === shipmentId
          ? { ...row, [field]: normalizedValue || null }
          : row
      ));
      return next;
    });
  };

  const updateBorderEntryDraftField = (
    shipmentId: number,
    field: "arrivedAtBorder" | "releasedFromBorder" | "driverPhone" | "sdoChecked" | "releaseOrderChecked",
    value: string | boolean,
  ) => {
    if (borderReadOnlyViewer) {
      return;
    }
    setBorderEntries((current) => current.map((row) => (
      row.shipmentId === shipmentId
        ? {
            ...row,
            [field]:
              typeof value === "boolean"
                ? value
                : field === "driverPhone"
                ? normalizePhoneLikeInput(value)
                : normalizeDateLikeInput(value) || "",
          }
        : row
    )));
  };

  const startEditingBorderEntry = (row: BorderEntryRow) => {
    setEditingBorderShipmentId(row.shipmentId);
    setBorderEditSnapshot({ ...row });
  };

  const cancelEditingBorderEntry = () => {
    if (borderEditSnapshot) {
      setBorderEntries((current) => current.map((row) => (
        row.shipmentId === borderEditSnapshot.shipmentId ? borderEditSnapshot : row
      )));
    }
    setEditingBorderShipmentId(null);
    setBorderEditSnapshot(null);
  };

  const filteredBorderEntries = borderEntries.filter((row) => {
    const query = borderSearch.trim().toLowerCase();
    if (stationRestrictedStaff) {
      const rowBorder = normalizeBorderStation(row.borderName ?? "");
      const userBorder = normalizeBorderStation(staffStation);
      if (!rowBorder || !userBorder || !(rowBorder === userBorder || rowBorder.includes(userBorder) || userBorder.includes(rowBorder))) return false;
      if (borderMode === "entry" && row.finalConfirmed) return false;
      if (borderMode === "exit" && !row.finalConfirmed) return false;
    }
    if (!query) return true;
    return row.mraRef.toLowerCase().includes(query)
      || row.consignee.toLowerCase().includes(query)
      || (row.borderName ?? "").toLowerCase().includes(query);
  });

  useEffect(() => {
    const currentIds = feedback.map((item) => Number(item.id)).filter((id) => Number.isFinite(id));
    if (currentIds.length === 0) {
      knownFeedbackIdsRef.current = currentIds;
      return;
    }

    if (knownFeedbackIdsRef.current.length === 0) {
      knownFeedbackIdsRef.current = currentIds;
      return;
    }

    const newMessages = feedback.filter((item) => !knownFeedbackIdsRef.current.includes(Number(item.id)));
    if (newMessages.length > 0) {
      const latest = newMessages[0] as FeedbackItem;
      const isProblem = latest.source === "customer_problem";
      const title = isProblem ? "New Customer Problem" : "New Contact Message";
      const description = isProblem
        ? `${latest.name}${latest.category ? ` · ${latest.category}` : ""}`
        : `${latest.name}${latest.phoneNumber ? ` · ${latest.phoneNumber}` : ""}`;
      toast({
        title,
        description,
      });

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(title, {
            body: description,
            icon: "/ifs-app-icon-2026.png",
            badge: "/ifs-app-icon-2026.png",
            tag: `feedback-${latest.id}`,
          });
        } catch {
          // Ignore browser notification failures and keep the in-app alert.
        }
      }

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([180, 80, 180]);
      }
    }

    knownFeedbackIdsRef.current = currentIds;
  }, [feedback, toast]);

  useEffect(() => {
    if (!isStaffOrAdmin) return;
    void loadFeedback(true);
    const timer = window.setInterval(() => {
      void loadFeedback(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [isStaffOrAdmin]);

  useEffect(() => {
    return () => {
      Object.values(borderSaveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (stationRestrictedStaff && activeTab !== "border") {
      setActiveTab("border");
      void loadBorderEntries(true);
    }
  }, [stationRestrictedStaff, activeTab]);

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
    if (stationRestrictedStaff && tab !== "border") {
      setActiveTab("border");
      void loadBorderEntries(true);
      setIsMobileNavOpen(false);
      return;
    }
    setActiveTab(tab);
    setIsMobileNavOpen(false);
    if (tab === "messages" || tab === "problems") loadFeedback();
    if (tab === "cards") loadCompanies();
    if (tab === "import") checkTemplateStatus();
    if (tab === "activity") loadActivity();
    if (tab === "border") loadBorderEntries();
  };

  const openHomepageTracking = () => {
    setIsMobileNavOpen(false);
    window.location.assign("/#company-shipment-lookup");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const focus = params.get("focus");
    const allowedTabs: Tab[] = ["overview", "import", "history", "messages", "problems", "cards", "authorize", "activity", "border", "spreadsheet"];
    if (requestedTab && allowedTabs.includes(requestedTab as Tab)) {
      const nextTab = requestedTab as Tab;
      setActiveTab(stationRestrictedStaff && nextTab !== "border" ? "border" : nextTab);
      if (nextTab === "messages" || nextTab === "problems") void loadFeedback(true);
      if (nextTab === "cards") void loadCompanies();
      if (nextTab === "activity") void loadActivity(true);
      if (nextTab === "border") void loadBorderEntries(true);
    }
    if (focus === "announcement") {
      window.requestAnimationFrame(() => {
        document.getElementById("staff-announcement")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [location, stationRestrictedStaff]);

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to sign out?")) return;
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

  const handleAsycudaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({ variant: "destructive", title: "Invalid file type", description: "ASYCUDA file must be an Excel workbook." });
      if (asycudaFileInputRef.current) asycudaFileInputRef.current.value = "";
      return;
    }
    setAsycudaFile(file);
    setAsycudaSummary(null);
  };

  const handleMasterInvoiceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Master invoicing file must be an Excel workbook." });
      if (masterInvoiceFileInputRef.current) masterInvoiceFileInputRef.current.value = "";
      return;
    }
    setMasterInvoiceFile(file);
    setAsycudaSummary(null);
  };

  const handleProcessAsycuda = async () => {
    if (!asycudaFile || !masterInvoiceFile) {
      toast({ variant: "destructive", title: "Missing files", description: "Choose both the ASYCUDA and Master Invoicing files first." });
      return;
    }
    setIsAsycudaProcessing(true);
    const formData = new FormData();
    formData.append("asycudaFile", asycudaFile);
    formData.append("masterFile", masterInvoiceFile);
    const token = localStorage.getItem("intf_token");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/asycuda/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).error || "ASYCUDA processing failed");
      }
      const summaryHeader = res.headers.get("X-Asycuda-Summary");
      const summary = summaryHeader ? JSON.parse(decodeURIComponent(summaryHeader)) : null;
      setAsycudaSummary(summary);

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameMatch?.[1] || `ASYCUDA matched (${reportDateStamp()}).xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "ASYCUDA processed",
        description: summary
          ? `${summary.charges + summary.freight} cells filled across ${summary.sheets} sheet${summary.sheets === 1 ? "" : "s"}.`
          : "The completed workbook has been downloaded.",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "ASYCUDA failed", description: err.message || "Processing failed" });
    } finally {
      setIsAsycudaProcessing(false);
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
        <Spinner className="w-10 h-10" />
      </div>
    );
  }

  const messageFeedback = feedback.filter((item) => item.source === "public");
  const problemFeedback = feedback.filter((item) => item.source === "customer_problem");
  const unreadCount = messageFeedback.filter((f) => f.status === "unread").length;
  const unreadProblemCount = problemFeedback.filter((f) => f.status === "unread").length;
  const dashboardStats = stats as any;
  const activityPayload = recentActivity as any;
  const recentUpdates = Array.isArray(activityPayload) ? activityPayload : (activityPayload?.recentActivity ?? []);
  const newConsignments = Array.isArray(activityPayload) ? [] : (activityPayload?.newConsignments ?? []);
  const sectionCount = (label: string) =>
    dashboardStats?.sectionCounts?.find((section: { label: string; count: number }) => section.label === label)?.count ?? 0;
  const overviewCards = [
    {
      label: "Total Consignments",
      value: dashboardStats?.totalContainers ?? 0,
      note: "All active shipments in the system",
      icon: <Package size={22} />,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Companies",
      value: dashboardStats?.totalCompanies ?? 0,
      note: "Active customer accounts",
      icon: <Users size={22} />,
      tone: "bg-green-50 text-green-600",
    },
    {
      label: "In Malawi",
      sectionLabel: "SHIPMENTS IN MALAWI",
      value: sectionCount("SHIPMENTS IN MALAWI"),
      note: "Already in Malawi or under clearance",
      icon: <CheckCircle2 size={22} />,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Enroute",
      sectionLabel: "SHIPMENTS ENROUTE",
      value: sectionCount("SHIPMENTS ENROUTE"),
      note: "Moving inland toward Malawi",
      icon: <Truck size={22} />,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "At POD",
      sectionLabel: "SHIPMENTS AT POD",
      value: sectionCount("SHIPMENTS AT POD"),
      note: "At port of discharge",
      icon: <Ship size={22} />,
      tone: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "On Sea",
      sectionLabel: "SHIPMENTS ON SEA",
      value: sectionCount("SHIPMENTS ON SEA"),
      note: "Currently on the sea leg",
      icon: <AlertTriangle size={22} />,
      tone: "bg-red-50 text-red-600",
    },
  ];

  const priorityCards = [
    {
      id: "documents" as const,
      label: "Documents Required",
      helper: "Yellow-marked rows arriving within 15 days",
      value: operationalAlerts?.documentsNeeded?.length ?? 0,
      icon: <FileSpreadsheet size={20} />,
      tone: "bg-red-50 text-red-700 border-red-100",
    },
    {
      id: "mra" as const,
      label: "Missing MRA Ref",
      helper: "Enroute or Malawi shipments needing MRA Ref",
      value: operationalAlerts?.mraRefNeeded?.length ?? 0,
      icon: <AlertTriangle size={20} />,
      tone: "bg-amber-50 text-amber-700 border-amber-100",
    },
  ];

  const activityCards = [
    {
      id: "nearby" as const,
      label: "Arriving Soon",
      helper: "ETA within the next 15 days",
      value: operationalAlerts?.nearbyConsignments?.length ?? 0,
      icon: <Clock size={20} />,
      tone: "bg-blue-50 text-blue-700 border-blue-100",
    },
    {
      id: "new" as const,
      label: "New Consignments",
      helper: "Added in the latest upload",
      value: newConsignments.length,
      icon: <Package size={20} />,
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
    {
      id: "activity" as const,
      label: "Recent Activity",
      helper: "Important shipment changes from the latest upload",
      value: recentUpdates.length,
      icon: <Clock size={20} />,
      tone: "bg-slate-100 text-slate-700 border-slate-200",
    },
  ];

  const prioritySummary = priorityCards
    .filter((card) => card.value > 0)
    .map((card) => `${card.value} ${card.label.toLowerCase()}`)
    .slice(0, 4)
    .join("  |  ");

  const defaultPrimaryNavItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { id: "cards", label: "Status Reports", icon: <Building2 size={18} />, badge: companiesLoaded ? companiesList.length : undefined },
  ];

  const defaultSecondaryNavItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    ...(isAdmin ? [{ id: "activity" as Tab, label: "Activity", icon: <Clock size={18} /> }] : []),
    { id: "border", label: "Border", icon: <Truck size={18} />, badge: borderEntries.length || undefined },
    ...(canUseSpreadsheetSample ? [{ id: "spreadsheet" as Tab, label: "Spreadsheet", icon: <FileSpreadsheet size={18} /> }] : []),
    { id: "authorize", label: "Authorize Sign Up", icon: <UserCheck size={18} />, badge: pendingSignups.length || undefined },
    { id: "messages", label: "Messages", icon: <Bell size={18} />, badge: unreadCount || undefined },
    { id: "problems", label: "Problems", icon: <AlertTriangle size={18} />, badge: unreadProblemCount || undefined },
    { id: "history", label: "File Download", icon: <History size={18} />, badge: uploads?.length },
    { id: "import", label: "Tracking Uploads", icon: <UploadCloud size={18} /> },
  ];

  const primaryNavItems = stationRestrictedStaff ? [] : defaultPrimaryNavItems;
  const secondaryNavItems = stationRestrictedStaff
    ? defaultSecondaryNavItems.filter((item) => item.id === "border")
    : defaultSecondaryNavItems;

  const renderFeedbackCards = (items: FeedbackItem[], emptyTitle: string, emptyDescription: string, kind: "message" | "problem") => (
    feedbackLoading ? (
      <div className="flex items-center justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    ) : items.length === 0 ? (
      <div className="bg-white rounded-2xl border border-border shadow-sm py-20 text-center">
        {kind === "problem" ? (
          <AlertTriangle className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        ) : (
          <Mail className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        )}
        <p className="text-lg font-semibold text-secondary mb-2">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    ) : (
      items.map((msg) => {
        const isExpanded = expandedFeedback === msg.id;
        const statusColor =
          msg.status === "unread"
            ? "bg-primary/10 text-primary"
            : msg.status === "replied"
            ? "bg-green-100 text-green-700"
            : "bg-muted text-muted-foreground";

        const categoryLabel = msg.category
          ? msg.category.charAt(0).toUpperCase() + msg.category.slice(1)
          : "General";

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
                  {msg.phoneNumber && (
                    <span className="text-muted-foreground text-sm">{msg.phoneNumber}</span>
                  )}
                  {kind === "problem" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {categoryLabel}
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                    {msg.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-semibold text-secondary">{msg.company || "No company"}</span>
                  {kind === "problem" && <span>Customer dashboard problem</span>}
                </div>
                <p className="text-sm text-muted-foreground truncate">{msg.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(msg.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFeedback(msg.id); }}
                  disabled={deletingFeedbackId === msg.id}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  title={kind === "problem" ? "Delete problem" : "Delete message"}
                >
                  {deletingFeedbackId === msg.id
                    ? <Spinner className="h-[14px] w-[14px]" />
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
                    <p className="text-xs font-semibold text-green-700 mb-1">Reply saved:</p>
                    <p className="text-sm text-green-800 whitespace-pre-wrap">{msg.replyText}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {msg.replyText ? "Update note" : "Write a note"}
                  </label>
                  <textarea
                    rows={3}
                    value={replyTexts[msg.id] ?? ""}
                    onChange={(e) => setReplyTexts((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                    placeholder={kind === "problem" ? "Write an internal note or resolution..." : "Write a reply here..."}
                    className="w-full px-4 py-3 rounded-xl border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm bg-background resize-none transition-all"
                  />
                  <button
                    onClick={() => handleSendReply(msg.id)}
                    disabled={sendingReply === msg.id || !replyTexts[msg.id]?.trim()}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all disabled:opacity-50"
                  >
                    {sendingReply === msg.id ? <Spinner className="h-[14px] w-[14px]" /> : <Send size={14} />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })
    )
  );

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col overflow-x-hidden">
      {!stationRestrictedStaff && <NotificationOptIn storageKey="intf_push_prompt_staff" scope={{ type: "auth" }} />}
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
        <div className="flex items-center gap-3 sm:gap-4">
          {typedUser && (
            <span className="text-sm text-white/60 hidden sm:block">
              {typedUser.fullName || typedUser.name}
              {isAdmin && (
                <span className="ml-2 text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full font-semibold">Admin</span>
              )}
            </span>
          )}
          {!stationRestrictedStaff && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-1.5 py-1">
              <NotificationBell />
            </div>
          )}
          <AccountSwitcher currentToken={localStorage.getItem("intf_token")} />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </header>

      {staffNeedsStation ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-white shadow-sm p-8">
            <div className="text-center mb-8">
              <Truck className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-extrabold text-secondary mb-2">Choose Your Station</h2>
              <p className="text-sm text-muted-foreground">
                This is a one-time setup for staff. Once you choose your station, the dashboard will show the right working section for your station.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {STAFF_STATIONS.map((station) => (
                <button
                  key={station}
                  onClick={() => handleChooseStation(station)}
                  disabled={stationSaving}
                  className="rounded-xl border border-border bg-white px-4 py-4 text-left transition-all hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  <div className="font-bold text-secondary">{station}</div>
                </button>
              ))}
            </div>

            {stationSaving && (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-primary font-medium">
                <Spinner className="h-4 w-4" />
                Saving station...
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 overflow-x-hidden">
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
            {primaryNavItems.map((item) => (
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
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse shadow-[0_0_14px_rgba(191,33,49,0.22)] ${
                    activeTab === item.id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}

            {!stationRestrictedStaff && (
              <button
                onClick={openHomepageTracking}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-secondary transition-all"
              >
                <Search size={18} />
                <span className="flex-1 text-left">Tracking</span>
              </button>
            )}

            {secondaryNavItems.map((item) => (
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
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse shadow-[0_0_14px_rgba(191,33,49,0.22)] ${
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
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-8">

          {/* ── OVERVIEW ──────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-8 max-w-6xl">
              <div>
                <h2 className="text-2xl font-extrabold text-secondary mb-1">Dashboard</h2>
                <p className="text-sm text-muted-foreground">Today&apos;s priorities, shipment overview, and recent activity in one place.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {showWebAppRefresh && (installed || isStandaloneDisplay()) && (
                  <button
                    type="button"
                    onClick={() => {
                      dismissWebAppRefresh();
                      setLocation("/app-install?refresh=1");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-secondary/15 bg-secondary/5 px-4 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10"
                  >
                    <Download size={16} />
                    Update App Icon
                  </button>
                )}
                {canInstall && (
                  <button
                    type="button"
                    onClick={() => void promptInstall()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <Smartphone size={16} />
                    Download App
                  </button>
                )}
              </div>

              {isStaffOrAdmin && (
                <div id="staff-announcement" className="bg-secondary text-white rounded-xl border border-white/10 shadow-sm p-4 sm:p-5">
                  <div className="flex flex-col gap-3">
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
                    <div className="flex-[2]">
                      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-white/70">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            checked={announcementTargetAll}
                            onChange={() => setAnnouncementTargetAll(true)}
                          />
                          All customers
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            checked={!announcementTargetAll}
                            onChange={() => setAnnouncementTargetAll(false)}
                          />
                          Selected customers
                        </label>
                      </div>
                      {!announcementTargetAll && (
                        <div className="max-h-44 overflow-y-auto rounded-lg border border-white/15 bg-white/5 p-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {announcementCustomers.map((customer) => (
                              <label key={customer.id} className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={announcementTargetIds.includes(customer.id)}
                                  onChange={(e) => setAnnouncementTargetIds((current) => (
                                    e.target.checked
                                      ? [...current, customer.id]
                                      : current.filter((id) => id !== customer.id)
                                  ))}
                                  className="mt-0.5"
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold text-white">{customer.companyName}</span>
                                  <span className="block text-xs text-white/55 truncate">{customer.fullName} - {customer.email}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveAnnouncement(true)}
                        disabled={announcementSaving || !announcementTitle.trim() || !announcementMessage.trim() || (!announcementTargetAll && announcementTargetIds.length === 0)}
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
                      {announcement.expiresAt ? (
                        <span className="ml-2">· Expires {formatDateOnly(announcement.expiresAt)}</span>
                      ) : null}
                    </p>
                  )}
                </div>
              )}

              <section className="space-y-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today&apos;s Priorities</p>
                  <h3 className="text-xl font-extrabold text-secondary">What needs action now</h3>
                  <p className="text-sm text-muted-foreground">
                    {prioritySummary || "No urgent shipment actions at the moment."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-5">
                  {priorityCards.map((card) => {
                    const isExpanded = expandedOverviewPanel === card.id;
                    const hasItems = card.value > 0;
                    return (
                      <div key={card.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedOverviewPanel((prev) => prev === card.id ? null : card.id)}
                          className="w-full p-5 text-left hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
                              <h3 className="text-3xl font-extrabold text-secondary">{card.value}</h3>
                              <p className="mt-2 text-xs text-muted-foreground">{card.helper}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className={`rounded-xl border px-3 py-3 ${card.tone} ${hasItems ? "animate-pulse shadow-[0_0_18px_rgba(191,33,49,0.12)]" : ""}`}>
                                {card.icon}
                              </div>
                              <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>
                        </button>

                        {card.id === "nearby" && isExpanded && renderOperationalAlertTable(
                          operationalAlerts?.nearbyConsignments ?? [],
                          "ETA",
                          "No ETA consignments within the next 15 days",
                          operationalAlertsLoading,
                        )}
                        {card.id === "documents" && isExpanded && renderOperationalAlertTable(
                          operationalAlerts?.documentsNeeded ?? [],
                          "ETA",
                          "No yellow-marked document rows within the next 15 days",
                          operationalAlertsLoading,
                        )}
                        {card.id === "mra" && isExpanded && renderOperationalAlertTable(
                          operationalAlerts?.mraRefNeeded ?? [],
                          "Status",
                          "No enroute or Malawi consignments are missing MRA Ref",
                          operationalAlertsLoading,
                        )}
                        {card.id === "new" && isExpanded && (
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
                    );
                  })}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Shipment Overview</p>
                  <h3 className="text-xl font-extrabold text-secondary">Where consignments currently are</h3>
                  <p className="text-sm text-muted-foreground">Open a card to see the status details inside each shipment group.</p>
                </div>

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
              </section>

              <section className="space-y-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent Activity</p>
                  <h3 className="text-xl font-extrabold text-secondary">Latest shipment changes and arrivals</h3>
                  <p className="text-sm text-muted-foreground">Arriving soon, new consignments, and recent shipment changes are kept together here.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {activityCards.map((card) => {
                    const isExpanded = expandedOverviewPanel === card.id;
                    const hasItems = card.value > 0;
                    return (
                      <div key={card.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedOverviewPanel((prev) => prev === card.id ? null : card.id)}
                          className="w-full p-5 text-left hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
                              <h3 className="text-3xl font-extrabold text-secondary">{card.value}</h3>
                              <p className="mt-2 text-xs text-muted-foreground">{card.helper}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className={`rounded-xl border px-3 py-3 ${card.tone} ${hasItems ? "animate-pulse shadow-[0_0_18px_rgba(191,33,49,0.12)]" : ""}`}>
                                {card.icon}
                              </div>
                              <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>
                        </button>

                        {card.id === "nearby" && isExpanded && renderOperationalAlertTable(
                          operationalAlerts?.nearbyConsignments ?? [],
                          "ETA",
                          "No ETA consignments within the next 15 days",
                          operationalAlertsLoading,
                        )}
                        {card.id === "new" && isExpanded && (
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
                        {card.id === "activity" && isExpanded && (
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
                    );
                  })}
                </div>

                {/* compatibility state support for existing direct links */}
                {false && expandedOverviewPanel === "activity" && (
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
              </section>
            </div>
          )}

          {/* ── DATA IMPORT ───────────────────────────────── */}
          {activeTab === "import" && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h2 className="text-2xl font-extrabold text-secondary mb-1">Tracking Uploads</h2>
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
                        ? <><Spinner className="h-[14px] w-[14px]" /> Saving…</>
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
                        <Spinner className="w-12 h-12" />
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
                            ? <><Spinner className="h-4 w-4" /> Generating Reports…</>
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
                        ? <><Spinner className="h-[15px] w-[15px]" /> Generating…</>
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
                        <Spinner className="w-12 h-12" />
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
          {activeTab === "border" && (
            <div className="space-y-6 max-w-7xl">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Border</h2>
                  <p className="text-sm text-muted-foreground">
                    {borderReadOnlyViewer
                      ? "Shipment details and border fields are read-only for Blantyre, Lilongwe staff, and admin."
                      : "Search for the shipment, confirm arrival first, then complete the final border release details."}
                  </p>
                </div>
                <button
                  onClick={() => loadBorderEntries()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-secondary transition-all hover:border-primary/50 hover:bg-primary/5"
                >
                  <Clock size={14} />
                  Refresh
                </button>
              </div>

              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                {borderEntriesLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : borderEntries.length === 0 ? (
                  <div className="py-20 text-center">
                    <Truck className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-secondary mb-2">No border rows found</p>
                    <p className="text-sm text-muted-foreground">Upload the latest tracking master and this section will populate automatically.</p>
                  </div>
                ) : stationRestrictedStaff ? (
                  <div className="w-full overflow-x-hidden p-4 sm:p-5 space-y-5">
                    <div className="grid w-full grid-cols-2 overflow-hidden rounded-2xl border border-border shadow-sm">
                      <button
                        type="button"
                        onClick={() => setBorderMode("entry")}
                        className={`min-h-[52px] px-4 py-3 text-base font-bold transition-colors ${borderMode === "entry" ? "bg-amber-400 text-secondary" : "bg-amber-300 text-secondary/90 hover:bg-amber-400"}`}
                      >
                        Border entry
                      </button>
                      <button
                        type="button"
                        onClick={() => setBorderMode("exit")}
                        className={`min-h-[52px] border-l border-white/30 px-4 py-3 text-base font-bold transition-colors ${borderMode === "exit" ? "bg-blue-600 text-white" : "bg-blue-500 text-white/95 hover:bg-blue-600"}`}
                      >
                        Border exit
                      </button>
                    </div>

                    <div className="relative w-full max-w-xl">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={borderSearch}
                        onChange={(e) => setBorderSearch(e.target.value)}
                        placeholder="Search by MRA Ref or Consignee"
                        className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    {filteredBorderEntries.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                        <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-lg font-semibold text-secondary">No matching border entries</p>
                        <p className="mt-2 text-sm text-muted-foreground">Try a different MRA Ref or consignee name.</p>
                      </div>
                    ) : (
                      <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                        {filteredBorderEntries.map((row) => {
                          const isExpanded = expandedBorderCard === row.shipmentId;
                          const isSaving = !!borderSavingByShipment[row.shipmentId];
                          const isExitCard = borderMode === "exit" || row.finalConfirmed;
                          const canConfirmFinal = !isExitCard && row.arrivalConfirmed && (row.sdoChecked || row.releaseOrderChecked) && !!row.releasedFromBorder && !!row.driverPhone;
                          return (
                            <div key={row.shipmentId} className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                              <button
                                type="button"
                                onClick={() => setExpandedBorderCard(isExpanded ? null : row.shipmentId)}
                                className="w-full min-w-0 text-left px-4 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                      <span className="min-w-0 break-words font-extrabold text-secondary max-w-full sm:max-w-[180px]">{row.consignee || "N/A"}</span>
                                      <span className="min-w-0 break-words text-muted-foreground max-w-full sm:max-w-[160px]">MRA: {row.mraRef || "N/A"}</span>
                                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.arrivalConfirmed ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`}>
                                        {isExitCard ? "Completed" : row.arrivalConfirmed ? "Awaiting final" : "Arrival pending"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-1 shrink-0">
                                    {isExpanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                                  </div>
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="border-t border-border bg-muted/10 px-5 py-5">
                                  {isExitCard ? (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arrived at Border</p>
                                        <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-secondary">{row.arrivedAtBorder || "N/A"}</div>
                                      </div>
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Released from Border</p>
                                        <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-secondary">{row.releasedFromBorder || "N/A"}</div>
                                      </div>
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
                                        <div className="flex gap-2">
                                          <span className={`rounded-lg px-3 py-2 text-sm font-semibold ${row.sdoChecked ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"}`}>SDO</span>
                                          <span className={`rounded-lg px-3 py-2 text-sm font-semibold ${row.releaseOrderChecked ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}>Release Order</span>
                                        </div>
                                      </div>
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Driver's Phone Number</p>
                                        <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-secondary">{row.driverPhone || "N/A"}</div>
                                      </div>
                                      <div className="sm:col-span-2 text-xs text-muted-foreground">
                                        {row.updatedAt ? `Last saved ${formatDate(row.updatedAt)}` : "Completed border exit"}
                                      </div>
                                    </div>
                                  ) : (
                                  <div className="space-y-4">
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arrived at Border</p>
                                        <input
                                          type="text"
                                          value={row.arrivedAtBorder ?? ""}
                                          onChange={(e) => updateBorderEntryDraftField(row.shipmentId, "arrivedAtBorder", e.target.value)}
                                          placeholder="DD/MM/YYYY"
                                          inputMode="numeric"
                                          pattern="[0-9/]*"
                                          maxLength={10}
                                          readOnly={row.arrivalConfirmed}
                                          disabled={row.arrivalConfirmed}
                                          className={`w-full rounded-lg border border-input px-3 py-2 text-sm outline-none ${row.arrivalConfirmed ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : "bg-background focus:border-primary focus:ring-2 focus:ring-primary/20"}`}
                                        />
                                      </div>
                                      <div className="flex items-end">
                                        <button
                                          type="button"
                                          onClick={() => void saveBorderEntry(row, "arrival")}
                                          disabled={isSaving || row.arrivalConfirmed || !row.arrivedAtBorder}
                                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-secondary/90 disabled:opacity-60"
                                        >
                                          {isSaving ? <Spinner className="h-4 w-4" /> : <CheckCircle2 size={16} />}
                                          Confirm Arrival
                                        </button>
                                      </div>
                                    </div>

                                    <div className="sm:col-span-2">
                                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
                                      <div className={`grid grid-cols-2 overflow-hidden rounded-lg border ${row.arrivalConfirmed ? "border-border" : "border-border/60 opacity-80"}`}>
                                        <button
                                          type="button"
                                          onClick={() => row.arrivalConfirmed && updateBorderEntryDraftField(row.shipmentId, "sdoChecked", !row.sdoChecked)}
                                          disabled={!row.arrivalConfirmed}
                                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-bold transition-all ${row.sdoChecked ? "bg-red-600 text-white" : "bg-red-500 text-white"} ${row.arrivalConfirmed ? "hover:bg-red-500/90" : "cursor-not-allowed"}`}
                                        >
                                          <span>SDO</span>
                                          <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold ${row.sdoChecked ? "bg-white/20 text-white" : "bg-white text-red-700"}`}>
                                            {row.sdoChecked ? <Check size={10} /> : ""}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => row.arrivalConfirmed && updateBorderEntryDraftField(row.shipmentId, "releaseOrderChecked", !row.releaseOrderChecked)}
                                          disabled={!row.arrivalConfirmed}
                                          className={`flex items-center justify-between gap-2 border-l px-2.5 py-1.5 text-xs font-bold transition-all ${row.releaseOrderChecked ? "bg-green-600 text-white" : "bg-green-500 text-white"} ${row.arrivalConfirmed ? "hover:bg-green-500/90" : "cursor-not-allowed border-border/60"}`}
                                        >
                                          <span>Release Order</span>
                                          <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold ${row.releaseOrderChecked ? "bg-white/20 text-white" : "bg-white text-green-700"}`}>
                                            {row.releaseOrderChecked ? <Check size={10} /> : ""}
                                          </span>
                                        </button>
                                      </div>
                                    </div>

                                    <div>
                                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Released from Border</p>
                                      <input
                                        type="text"
                                        value={row.releasedFromBorder ?? ""}
                                        onChange={(e) => updateBorderEntryDraftField(row.shipmentId, "releasedFromBorder", e.target.value)}
                                        placeholder="DD/MM/YYYY"
                                        inputMode="numeric"
                                        pattern="[0-9/]*"
                                        maxLength={10}
                                        disabled={!row.arrivalConfirmed}
                                        className={`w-full rounded-lg border border-input px-3 py-2 text-sm outline-none ${row.arrivalConfirmed ? "bg-background focus:border-primary focus:ring-2 focus:ring-primary/20" : "bg-muted/30 cursor-not-allowed"}`}
                                      />
                                    </div>
                                    <div>
                                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Driver's Phone Number</p>
                                      <input
                                        type="text"
                                        value={row.driverPhone ?? ""}
                                        onChange={(e) => updateBorderEntryDraftField(row.shipmentId, "driverPhone", e.target.value)}
                                        placeholder="265..."
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={15}
                                        disabled={!row.arrivalConfirmed}
                                        className={`w-full rounded-lg border border-input px-3 py-2 text-sm outline-none ${row.arrivalConfirmed ? "bg-background focus:border-primary focus:ring-2 focus:ring-primary/20" : "bg-muted/30 cursor-not-allowed"}`}
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">
                                      {row.updatedAt ? `Last saved ${formatDate(row.updatedAt)}` : row.arrivalConfirmed ? "Saved" : "Waiting for arrival"}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => void saveBorderEntry(row, "final")}
                                      disabled={isSaving || !canConfirmFinal}
                                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-60"
                                    >
                                      {isSaving ? <Spinner className="h-4 w-4" /> : <CheckCircle2 size={16} />}
                                      Confirm Final
                                    </button>
                                  </div>
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
                ) : (
                  <div className="space-y-4">
                    <div className="inline-flex overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setBorderMode("entry")}
                        className={`min-h-[48px] px-4 py-3 text-sm font-bold transition-colors ${borderMode === "entry" ? "bg-amber-400 text-secondary" : "bg-amber-300 text-secondary/90 hover:bg-amber-400"}`}
                      >
                        Border entry
                      </button>
                      <button
                        type="button"
                        onClick={() => setBorderMode("exit")}
                        className={`min-h-[48px] border-l border-white/30 px-4 py-3 text-sm font-bold transition-colors ${borderMode === "exit" ? "bg-blue-600 text-white" : "bg-blue-500 text-white/95 hover:bg-blue-600"}`}
                      >
                        Border exit
                      </button>
                    </div>

                  <div className="overflow-x-auto">
                    <table className="w-full table-auto text-sm">
                      <thead className="bg-muted/30 border-b border-border">
                        <tr>
                          {["IFS Ref", "MRA Ref", "Shipper", "Consignee", "Invoice No.", "Arrived at Border", "SDO", "Release Order", "Released from Border", "Driver Phone", ""].map((label) => (
                            <th key={label} className="px-3 py-3 text-left font-semibold text-secondary whitespace-nowrap">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {borderEntries.filter((row) => (borderMode === "entry" ? !row.finalConfirmed : row.finalConfirmed)).map((row) => {
                          const isEditing = editingBorderShipmentId === row.shipmentId;
                          return (
                          <tr key={row.shipmentId} className={`border-b border-border/70 hover:bg-muted/10 transition-colors align-top ${row.arrivalConfirmed ? "bg-amber-50/80" : ""}`}>
                            <td className="px-3 py-3 font-semibold text-secondary whitespace-nowrap">{row.ifsRef}</td>
                            <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{row.mraRef}</td>
                            <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{row.shipper}</td>
                            <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{row.consignee}</td>
                            <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{row.invoiceNo}</td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={row.arrivedAtBorder ?? ""}
                                onChange={(e) => updateBorderEntryField(row.shipmentId, "arrivedAtBorder", e.target.value)}
                                placeholder="DD/MM/YYYY"
                                inputMode="numeric"
                                pattern="[0-9-]*"
                                maxLength={10}
                                readOnly={borderReadOnlyViewer && !isEditing}
                                disabled={borderReadOnlyViewer && !isEditing}
                                className={`w-full min-w-[120px] rounded-lg border border-input px-3 py-2 text-sm outline-none ${borderReadOnlyViewer && !isEditing ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : "bg-background focus:border-primary focus:ring-2 focus:ring-primary/20"}`}
                              />
                            </td>
                            <td className="px-3 py-3 text-center">
                              {isEditing ? (
                                <button
                                  type="button"
                                  onClick={() => updateBorderEntryDraftField(row.shipmentId, "sdoChecked", !row.sdoChecked)}
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.sdoChecked ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"}`}
                                >
                                  SDO
                                </button>
                              ) : (
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${row.sdoChecked ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                                  {row.sdoChecked ? <Check size={12} /> : "-"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {isEditing ? (
                                <button
                                  type="button"
                                  onClick={() => updateBorderEntryDraftField(row.shipmentId, "releaseOrderChecked", !row.releaseOrderChecked)}
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.releaseOrderChecked ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}
                                >
                                  RO
                                </button>
                              ) : (
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${row.releaseOrderChecked ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                                  {row.releaseOrderChecked ? <Check size={12} /> : "-"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={row.releasedFromBorder ?? ""}
                                onChange={(e) => updateBorderEntryField(row.shipmentId, "releasedFromBorder", e.target.value)}
                                placeholder="DD/MM/YYYY"
                                inputMode="numeric"
                                pattern="[0-9/]*"
                                maxLength={10}
                                readOnly={borderReadOnlyViewer && !isEditing}
                                disabled={borderReadOnlyViewer && !isEditing}
                                className={`w-full min-w-[120px] rounded-lg border border-input px-3 py-2 text-sm outline-none ${borderReadOnlyViewer && !isEditing ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : "bg-background focus:border-primary focus:ring-2 focus:ring-primary/20"}`}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={row.driverPhone ?? ""}
                                onChange={(e) => updateBorderEntryField(row.shipmentId, "driverPhone", e.target.value)}
                                placeholder="265..."
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={15}
                                readOnly={borderReadOnlyViewer && !isEditing}
                                disabled={borderReadOnlyViewer && !isEditing}
                                className={`w-full min-w-[120px] rounded-lg border border-input px-3 py-2 text-sm outline-none ${borderReadOnlyViewer && !isEditing ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : "bg-background focus:border-primary focus:ring-2 focus:ring-primary/20"}`}
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                              {borderReadOnlyViewer ? (
                                isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void saveBorderEntry(row, "correction")}
                                      disabled={!!borderSavingByShipment[row.shipmentId]}
                                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                    >
                                      {borderSavingByShipment[row.shipmentId] ? <Spinner className="h-[13px] w-[13px]" /> : null}
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditingBorderEntry}
                                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEditingBorderEntry(row)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:border-primary/40 hover:bg-primary/5"
                                  >
                                    Edit
                                  </button>
                                )
                              ) : borderSavingByShipment[row.shipmentId]
                                ? <span className="inline-flex items-center gap-2 text-primary"><Spinner className="h-[13px] w-[13px]" /> Saving...</span>
                                : row.updatedAt
                                ? `Saved ${formatDate(row.updatedAt)}`
                                : "Auto-save"}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "spreadsheet" && canUseSpreadsheetSample && (
            <div className="space-y-6 max-w-[96rem]">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Spreadsheet</h2>
                  <p className="text-sm text-muted-foreground">
                    Sample editable sheet for Blantyre staff and admin. This version is table-style so it feels closer to the tracking master.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSpreadsheetRows((current) => [...current, createBlankSpreadsheetRow()])}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary/90"
                >
                  <FileSpreadsheet size={16} />
                  Add Row
                </button>
              </div>

              <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
                <div className="border-b border-border bg-muted/20 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Sample Sheet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A simple Excel-like sheet with rows 1 to 300, columns A to Z, basic formatting, merge, drag, and autofit tools.
                  </p>
                </div>

                <div className="border-b border-border bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
                      {selectedSpreadsheetCell && selectedSpreadsheetColumn
                        ? `Selected: ${selectedSpreadsheetColumn.label || spreadsheetColumnLabel(spreadsheetColumns.findIndex((column) => column.id === selectedSpreadsheetColumn.id))}${selectedSpreadsheetIndex + 1}`
                        : "Select a cell"}
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setSpreadsheetRows((current) => [...current, createBlankSpreadsheetRow()])}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-primary/90"
                      >
                        Add Row
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedSpreadsheetIndex >= 0 && insertSpreadsheetRow(selectedSpreadsheetIndex)}
                        disabled={selectedSpreadsheetIndex < 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-40"
                      >
                        Insert Above
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedSpreadsheetIndex >= 0 && moveSpreadsheetRow(selectedSpreadsheetIndex, -1)}
                        disabled={selectedSpreadsheetIndex <= 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-40"
                      >
                        Move Up
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedSpreadsheetIndex >= 0 && moveSpreadsheetRow(selectedSpreadsheetIndex, 1)}
                        disabled={selectedSpreadsheetIndex < 0 || selectedSpreadsheetIndex >= spreadsheetRows.length - 1}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-40"
                      >
                        Move Down
                      </button>
                      <button
                        type="button"
                        onClick={mergeSpreadsheetCellRight}
                        disabled={!selectedSpreadsheetCell}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-40"
                      >
                        Merge Right
                      </button>
                      <button
                        type="button"
                        onClick={unmergeSpreadsheetCell}
                        disabled={!selectedSpreadsheetCell}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-40"
                      >
                        Unmerge
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedSpreadsheetCell && deleteSpreadsheetRow(selectedSpreadsheetCell.rowId)}
                        disabled={!selectedSpreadsheetCell || spreadsheetRows.length === 1}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
                      >
                        Delete Row
                      </button>
                      <button
                        type="button"
                        onClick={() => autoFitColumns(selectedSpreadsheetCell?.columnId)}
                        disabled={!selectedSpreadsheetCell}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-40"
                      >
                        Fit Selected
                      </button>
                      <button
                        type="button"
                        onClick={() => autoFitColumns()}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-secondary"
                      >
                        Fit All
                      </button>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setSpreadsheetCellStyle((current) => ({ ...current, bold: !current.bold }))}
                        disabled={!selectedSpreadsheetCell}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${selectedSpreadsheetStyle.bold ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-secondary"}`}
                      >
                        Bold
                      </button>
                      {([
                        { key: "left", label: "Left" },
                        { key: "center", label: "Center" },
                        { key: "right", label: "Right" },
                      ] as const).map((alignOption) => (
                        <button
                          key={alignOption.key}
                          type="button"
                          onClick={() => setSpreadsheetCellStyle((current) => ({ ...current, align: alignOption.key }))}
                          disabled={!selectedSpreadsheetCell}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${selectedSpreadsheetStyle.align === alignOption.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-secondary"}`}
                        >
                          {alignOption.label}
                        </button>
                      ))}
                      {([
                        { key: "none", label: "No Fill", className: "bg-white" },
                        { key: "yellow", label: "Yellow", className: "bg-amber-200" },
                        { key: "green", label: "Green", className: "bg-emerald-200" },
                        { key: "blue", label: "Blue", className: "bg-sky-200" },
                      ] as const).map((fillOption) => (
                        <button
                          key={fillOption.key}
                          type="button"
                          onClick={() => setSpreadsheetCellStyle((current) => ({ ...current, fill: fillOption.key }))}
                          disabled={!selectedSpreadsheetCell}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${selectedSpreadsheetStyle.fill === fillOption.key ? "border-primary shadow-sm" : "border-border bg-white text-secondary"}`}
                        >
                          <span className={`h-3.5 w-3.5 rounded-full border border-black/10 ${fillOption.className}`} />
                          {fillOption.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[2400px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-white">
                        <th className="border border-border px-3 py-2 text-center text-[11px] font-bold text-muted-foreground">#</th>
                        {spreadsheetColumns.map((column, index) => (
                          <th key={`letter-${column.id}`} className="border border-border px-3 py-2 text-center text-[11px] font-bold text-muted-foreground">
                            {spreadsheetColumnLabel(index)}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-muted/30">
                        <th className="border border-border px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Row</th>
                        {spreadsheetColumns.map((column) => (
                          <th
                            key={column.id}
                            style={{ width: column.width, minWidth: column.width }}
                            className="border border-border px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap text-muted-foreground"
                          >
                            {column.label || column.id}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {spreadsheetRows.map((row, index) => (
                        <tr key={row.id} className="align-top">
                          <td
                            className="border border-border px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                            draggable
                            onDragStart={() => setDraggedSpreadsheetCell({ rowId: row.id, columnId: spreadsheetColumns[0]?.id ?? "" })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (draggedSpreadsheetCell?.rowId && draggedSpreadsheetCell.rowId !== row.id) {
                                const fromIndex = spreadsheetRows.findIndex((item) => item.id === draggedSpreadsheetCell.rowId);
                                const toIndex = index;
                                if (fromIndex >= 0 && toIndex >= 0) {
                                  const direction = fromIndex < toIndex ? 1 : -1;
                                  let workingIndex = fromIndex;
                                  while (workingIndex !== toIndex) {
                                    moveSpreadsheetRow(workingIndex, direction);
                                    workingIndex += direction;
                                  }
                                }
                              }
                            }}
                          >
                            {index + 1}
                          </td>
                          {spreadsheetColumns.map((column, columnIndex) => {
                            if (isMergedAwayCell(row.id, columnIndex)) return null;
                            const colSpan = getMergeSpan(row.id, column.id);
                            const isSelected = selectedSpreadsheetCell?.rowId === row.id && selectedSpreadsheetCell?.columnId === column.id;
                            const styleKey = `${row.id}:${column.id}`;
                            const cellStyle = spreadsheetCellStyles[styleKey] ?? DEFAULT_SPREADSHEET_CELL_STYLE;
                            const fillClass =
                              cellStyle.fill === "yellow" ? "bg-amber-100" :
                              cellStyle.fill === "green" ? "bg-emerald-100" :
                              cellStyle.fill === "blue" ? "bg-sky-100" :
                              "bg-white";
                            const textAlignClass =
                              cellStyle.align === "center" ? "text-center" :
                              cellStyle.align === "right" ? "text-right" :
                              "text-left";
                            return (
                              <td
                                key={`${row.id}-${column.id}`}
                                colSpan={colSpan}
                                style={{ width: column.width, minWidth: column.width }}
                                className={`border border-border px-1.5 py-1.5 ${fillClass} ${isSelected ? "outline outline-2 outline-primary/60" : ""}`}
                                draggable
                                onDragStart={() => setDraggedSpreadsheetCell({ rowId: row.id, columnId: column.id })}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => {
                                  if (draggedSpreadsheetCell) {
                                    swapSpreadsheetCells(draggedSpreadsheetCell, { rowId: row.id, columnId: column.id });
                                    setDraggedSpreadsheetCell(null);
                                  }
                                }}
                              >
                                <input
                                  type="text"
                                  value={row.cells[column.id] ?? ""}
                                  onClick={() => setSelectedSpreadsheetCell({ rowId: row.id, columnId: column.id })}
                                  onChange={(e) => updateSpreadsheetCell(row.id, column.id, e.target.value)}
                                  className={`w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-secondary outline-none focus:border-primary focus:bg-white ${textAlignClass} ${cellStyle.bold ? "font-bold" : ""}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "asycuda" && isAdmin && (
            <div className="space-y-6 max-w-5xl">
              <div>
                <h2 className="text-2xl font-extrabold text-secondary mb-1">ASYCUDA</h2>
                <p className="text-sm text-muted-foreground">Upload the master invoicing workbook and the ASYCUDA workbook, then process and download the matched result.</p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-border flex items-center gap-2 bg-muted/20">
                    <FileSpreadsheet size={18} className="text-primary" />
                    <h3 className="font-bold text-secondary">Master Invoicing</h3>
                  </div>
                  <div className="p-6">
                    <div className="border-2 border-dashed rounded-xl p-10 text-center transition-colors border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer" onClick={() => !isAsycudaProcessing && masterInvoiceFileInputRef.current?.click()}>
                      <input type="file" ref={masterInvoiceFileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleMasterInvoiceFileSelect} disabled={isAsycudaProcessing} />
                      <div className="flex flex-col items-center gap-3">
                        <UploadCloud className="w-12 h-12 text-muted-foreground/50" />
                        <p className="font-bold text-secondary text-lg">Choose Master Invoicing</p>
                        <p className="text-sm text-muted-foreground">{masterInvoiceFile?.name || "Excel workbook (.xlsx / .xls)"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-border flex items-center gap-2 bg-muted/20">
                    <ReceiptText size={18} className="text-primary" />
                    <h3 className="font-bold text-secondary">ASYCUDA Workbook</h3>
                  </div>
                  <div className="p-6">
                    <div className="border-2 border-dashed rounded-xl p-10 text-center transition-colors border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer" onClick={() => !isAsycudaProcessing && asycudaFileInputRef.current?.click()}>
                      <input type="file" ref={asycudaFileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleAsycudaFileSelect} disabled={isAsycudaProcessing} />
                      <div className="flex flex-col items-center gap-3">
                        <UploadCloud className="w-12 h-12 text-muted-foreground/50" />
                        <p className="font-bold text-secondary text-lg">Choose ASYCUDA File</p>
                        <p className="text-sm text-muted-foreground">{asycudaFile?.name || "Excel workbook (.xlsx / .xls)"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-border shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-secondary">Process and download</p>
                    <p className="text-sm text-muted-foreground">The tool fills blank local charges and freight cells, marks them green, and downloads the completed workbook.</p>
                  </div>
                  <button type="button" onClick={handleProcessAsycuda} disabled={isAsycudaProcessing || !asycudaFile || !masterInvoiceFile} className="inline-flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-white font-semibold px-5 py-3 rounded-lg transition-all disabled:opacity-60">
                    {isAsycudaProcessing ? <Spinner className="w-4 h-4" /> : <Download size={16} />}
                    {isAsycudaProcessing ? "Processing..." : "Process and Download"}
                  </button>
                </div>

                {asycudaSummary && (
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
                    {[
                      ["Charges", asycudaSummary.charges],
                      ["Freight", asycudaSummary.freight],
                      ["Sheets", asycudaSummary.sheets],
                      ["Remaining", asycudaSummary.remaining],
                      ["Missing", asycudaSummary.missing],
                      ["Mismatch", asycudaSummary.mismatch],
                      ["Ambiguous", asycudaSummary.ambiguous],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
                        <p className="text-xl font-extrabold text-secondary mt-1">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-6 max-w-4xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">File Download</h2>
                  <p className="text-sm text-muted-foreground">Latest files stay at the top so the right one is always easy to download</p>
                </div>
                {uploads && uploads.length > 0 && (
                  <button
                    onClick={handleDeleteAll}
                    disabled={deletingAll}
                    className="flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all disabled:opacity-60 shrink-0"
                  >
                    {deletingAll
                      ? <Spinner className="h-[15px] w-[15px]" />
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
                      {uploads?.length ?? 0} File{uploads?.length !== 1 ? "s" : ""}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground">Newest file is first. Click trash icon to delete individual file.</span>
                </div>

                {uploadsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : !uploads?.length ? (
                  <div className="py-16 text-center">
                    <FileSpreadsheet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-semibold text-secondary mb-1">No files yet</p>
                    <p className="text-sm text-muted-foreground">
                      Go to{" "}
                      <button
                        onClick={() => setActiveTab("import")}
                        className="text-primary underline"
                      >
                        Tracking Uploads
                      </button>{" "}
                      to upload your first file
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {uploads.map((upload, index) => {
                      const isLatest = index === 0;
                      return (
                      <div key={upload.id} className={`flex flex-col gap-3 px-4 py-4 hover:bg-muted/20 transition-colors group sm:flex-row sm:items-center sm:gap-4 sm:px-6 ${isLatest ? "download-ready-glow" : ""}`}>
                        <div className={`p-2 rounded-lg shrink-0 ${isLatest ? "bg-green-50 border border-green-200" : "bg-muted"}`}>
                          <FileSpreadsheet size={18} className="text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-sm text-secondary leading-snug break-words sm:truncate" title={upload.filename}>
                              {upload.filename}
                            </p>
                            {isLatest && (
                              <span className="download-ready-badge inline-flex items-center gap-2 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-semibold">
                                <span className="live-updates-dot !bg-green-500 !shadow-[0_0_0_3px_rgba(34,197,94,0.16),0_0_14px_rgba(34,197,94,0.42)]" />
                                Latest to download
                              </span>
                            )}
                          </div>
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
                              ? <Spinner className="h-[14px] w-[14px]" />
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
                              ? <Spinner className="h-4 w-4" />
                              : <Trash2 size={16} />
                            }
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Download size={18} className="text-primary" />
                    <h3 className="font-bold text-secondary">
                      {savedReports.length} Saved Report{savedReports.length !== 1 ? "s" : ""}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground">Latest saved Excel and PDF report copies</span>
                </div>

                {savedReportsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Spinner className="w-8 h-8" />
                  </div>
                ) : !savedReports.length ? (
                  <div className="py-16 text-center">
                    <FileSpreadsheet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-semibold text-secondary mb-1">No saved reports yet</p>
                    <p className="text-sm text-muted-foreground">Generate an Excel or PDF status report and it will be saved here automatically.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {savedReports.map((report, index) => {
                      const isLatest = index === 0;
                      const label = report.report_scope === "consignee" && report.consignee_name
                        ? `${report.company_name} / ${report.consignee_name}`
                        : report.company_name;

                      return (
                        <div key={report.id} className={`flex flex-col gap-3 px-4 py-4 hover:bg-muted/20 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-6 ${isLatest ? "download-ready-glow" : ""}`}>
                          <div className={`p-2 rounded-lg shrink-0 ${isLatest ? "bg-green-50 border border-green-200" : "bg-muted"}`}>
                            <FileSpreadsheet size={18} className="text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-sm text-secondary leading-snug break-words sm:truncate" title={report.filename}>
                                {report.filename}
                              </p>
                              {isLatest && (
                                <span className="download-ready-badge inline-flex items-center gap-2 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-semibold">
                                  <span className="live-updates-dot !bg-green-500 !shadow-[0_0_0_3px_rgba(34,197,94,0.16),0_0_14px_rgba(34,197,94,0.42)]" />
                                  Latest saved
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {label} · {String(report.format).toUpperCase()} · Saved {formatDate(report.created_at)}{report.generated_by ? ` · by ${report.generated_by}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 sm:shrink-0">
                            <button
                              onClick={() => handleDownloadSavedReport(report)}
                              disabled={downloadingSavedReportId === report.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-secondary/90 disabled:opacity-60"
                            >
                              {downloadingSavedReportId === report.id
                                ? <Spinner className="h-[14px] w-[14px]" />
                                : <Download size={14} />
                              }
                              Download
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
                  <h2 className="text-2xl font-extrabold text-secondary mb-1">Status Reports</h2>
                  <p className="text-sm text-muted-foreground">View and download status report cards per company</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleDownloadAllReports}
                    disabled={isDownloadingZip}
                    className="flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all disabled:opacity-60"
                  >
                    {isDownloadingZip ? <Spinner className="h-[15px] w-[15px]" /> : <Download size={15} />}
                    {isDownloadingZip ? "Generating..." : "Download All"}
                  </button>
                  <button
                    onClick={() => handleTabChange("import")}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all"
                  >
                    <UploadCloud size={15} /> Tracking Uploads
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
                  <Spinner className="w-8 h-8" />
                </div>
              ) : companiesList.length === 0 ? (
                <div className="bg-white rounded-xl border border-border shadow-sm py-20 text-center">
                  <Building2 className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-secondary mb-2">No companies yet</p>
                  <p className="text-sm text-muted-foreground">Upload shipment data to populate status reports.</p>
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
                                {isDownloadingExcel ? <Spinner className="h-[14px] w-[14px]" /> : <Download size={14} />}
                                {isDownloading ? "Generating…" : "Download"}
                              </button>
                              <button
                                onClick={() => downloadCompanyReport(company.companyName, "pdf")}
                                disabled={isDownloadingExcel || isDownloadingPdf}
                                className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold bg-primary hover:bg-primary/90 text-white px-2 sm:px-3 py-2 rounded-lg transition-all disabled:opacity-60"
                                title="Download PDF report"
                              >
                                {isDownloadingPdf ? <Spinner className="h-[14px] w-[14px]" /> : <Download size={14} />}
                                PDF
                              </button>
                              <button
                                onClick={() => toggleCompanyCard(company.companyName)}
                                className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-secondary border border-border px-2 sm:px-3 py-2 rounded-lg transition-all"
                              >
                                {isLoadingThis ? <Spinner className="h-[14px] w-[14px]" /> : <ChevronRight size={14} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />}
                                {isExpanded ? "Close" : "View"}
                              </button>
                            </div>
                          </div>

                          {/* Expanded: consignee groups within this company */}
                          {isExpanded && (
                            <div className="border-t border-border">
                              {isLoadingThis ? (
                                <div className="flex items-center justify-center py-10">
                                  <Spinner className="w-6 h-6" />
                                </div>
                              ) : shipments.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8 text-sm">No shipments found for this company.</p>
                              ) : (
                                <div className="divide-y divide-border">
                                  {groupByConsignee(shipments).map(group => {
                                    const consKey = `${company.companyName}::${group.key}`;
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
                                          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:shrink-0">
                                            <button
                                              onClick={() => downloadConsigneeReport(company.companyName, group.key, group.name, "excel")}
                                              disabled={isConsDownloadingExcel || isConsDownloadingPdf}
                                              className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/90 text-white px-2 py-1.5 rounded-lg transition-all disabled:opacity-60 sm:px-2.5"
                                              title="Download Excel report for this consignee"
                                            >
                                              {isConsDownloadingExcel ? <Spinner className="h-[13px] w-[13px]" /> : <Download size={13} />}
                                              {isConsDownloading ? "Generating…" : "Download"}
                                            </button>
                                            <button
                                              onClick={() => downloadConsigneeReport(company.companyName, group.key, group.name, "pdf")}
                                              disabled={isConsDownloadingExcel || isConsDownloadingPdf}
                                              className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white px-2 py-1.5 rounded-lg transition-all disabled:opacity-60 sm:px-2.5"
                                              title="Download PDF report for this consignee"
                                            >
                                              {isConsDownloadingPdf ? <Spinner className="h-[13px] w-[13px]" /> : <Download size={13} />}
                                              PDF
                                            </button>
                                          </div>
                                        </div>

                                        <div className="border-t border-border/60 bg-white">
                                          {renderShipmentSections(group.rows)}
                                        </div>
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
                  <Spinner className="w-8 h-8" />
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
                              {approving ? <Spinner className="h-[15px] w-[15px]" /> : <UserCheck size={15} />}
                              Yes
                            </button>
                            <button
                              onClick={() => handlePendingSignup(signup.id, "reject")}
                              disabled={!!pendingSignupAction}
                              className="inline-flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {rejecting ? <Spinner className="h-[15px] w-[15px]" /> : <UserX size={15} />}
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
                          <th className="px-4 py-3 text-right">Action</th>
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
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => clearSignupRequest(signup.id)}
                                disabled={clearingSignupId === signup.id || !!pendingSignupAction}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                              >
                                {clearingSignupId === signup.id ? <Spinner className="h-[14px] w-[14px]" /> : <Trash2 size={14} />}
                                Clear
                              </button>
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
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-extrabold text-secondary">Messages</h2>
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary animate-pulse shadow-[0_0_14px_rgba(191,33,49,0.2)]">
                      <Bell size={13} />
                      {unreadCount} unread
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">Contact form submissions from the website</p>
                </div>
                <button
                  onClick={() => { setFeedbackLoaded(false); loadFeedback(); }}
                  className="text-sm text-primary hover:underline"
                >
                  Refresh
                </button>
              </div>
              {renderFeedbackCards(
                messageFeedback,
                "No messages yet",
                "Messages from the website contact form will appear here.",
                "message",
              )}
            </div>
          )}

          {activeTab === "problems" && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-extrabold text-secondary">Problems</h2>
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary animate-pulse shadow-[0_0_14px_rgba(191,33,49,0.2)]">
                      <Bell size={13} />
                      {unreadProblemCount} unread
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">Bug and problem reports sent from the customer dashboard.</p>
                </div>
                <button
                  onClick={() => { setFeedbackLoaded(false); loadFeedback(); }}
                  className="text-sm text-primary hover:underline"
                >
                  Refresh
                </button>
              </div>

              {renderFeedbackCards(
                problemFeedback,
                "No problems yet",
                "Customer dashboard problem reports will appear here.",
                "problem",
              )}
            </div>
          )}

          {activeTab === "activity" && isAdmin && (
            <div className="space-y-6 max-w-5xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary">Activity</h2>
                  <p className="text-sm text-muted-foreground">See which customers received updates, opened the dashboard, and viewed shipment changes.</p>
                </div>
                <button
                  onClick={() => { void loadActivity(); }}
                  className="text-sm text-primary hover:underline"
                >
                  Refresh
                </button>
              </div>

              {accountActivityLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner className="w-8 h-8" />
                </div>
              ) : activityRows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-border shadow-sm py-20 text-center">
                  <Clock className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-secondary mb-2">No activity yet</p>
                  <p className="text-sm text-muted-foreground">Customer read activity will appear here once notifications start being opened.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider border-b border-border">
                        <tr>
                          <th className="px-4 py-3">Account</th>
                          <th className="px-4 py-3">Company</th>
                          <th className="px-4 py-3">Notifications</th>
                          <th className="px-4 py-3">Unread</th>
                          <th className="px-4 py-3">Latest Sent</th>
                          <th className="px-4 py-3">Last Entered</th>
                          <th className="px-4 py-3">Viewed Change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {activityRows.map((row) => {
                          const activeSessions = Number(row.activeSessions ?? 0);
                          const notificationDevices = Number(row.notificationDevices ?? 0);
                          const unreadNotifications = Number(row.unreadNotifications ?? 0);
                          return (
                            <tr key={`activity-${row.id}`} className="hover:bg-muted/20">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-secondary">{row.fullName}</div>
                                <div className="text-muted-foreground break-all">{row.email}</div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{row.companyName || "N/A"}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  notificationDevices > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                                }`}>
                                  {notificationDevices > 0 ? `Enabled (${notificationDevices})` : "Not enabled"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  unreadNotifications > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                                }`}>
                                  {unreadNotifications > 0 ? `${unreadNotifications} unread` : "All read"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                {row.lastNotificationAt ? formatDate(row.lastNotificationAt) : "Never"}
                              </td>
                              <td className="px-4 py-3 font-semibold text-secondary whitespace-nowrap">
                                {row.lastSeenAt ? formatDate(row.lastSeenAt) : "Never"}
                                <div className="mt-1">
                                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                                    activeSessions > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                                  }`}>
                                    {activeSessions > 0 ? `Active (${activeSessions})` : "Offline"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                {row.lastViewedChangeAt ? formatDate(row.lastViewedChangeAt) : "Not yet"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
      )}
    </div>
  );
}







import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown, FileText, Anchor, MapPin, Flag,
  User, Box, Ship, Truck, Boxes, Bell,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type Variant = "container" | "truck" | "pallet";

function resolveVariant(extraFields?: Record<string, unknown> | null): Variant {
  const t = String(extraFields?.["Type"] ?? extraFields?.["type"] ?? "").toUpperCase().trim();
  if (t === "LCL") return "pallet";
  if (t === "FTL" || t === "LTL") return "truck";
  return "container";
}

const T = {
  truck: {
    label: "TRUCK",
    cardBorder: "border-red-900/30",
    cardBg: "#0d0808",
    headerBg: "linear-gradient(145deg, #220808 0%, #160606 55%, #0d0808 100%)",
    dotColor: "#ef4444",
    iconWrap: "bg-red-800/40 border-2 border-red-600/60",
    iconColor: "text-red-400",
    fieldIconColor: "text-red-500",
    fieldBorder: "border-red-900/20",
    cargoBg: "linear-gradient(105deg, #200707 0%, #0d0808 100%)",
    cargoDecor: "text-red-900/20",
    dividerColor: "#dc2626",
    statusFooterBg: "linear-gradient(180deg, #0d0808 0%, #090505 100%)",
    pillBg: "bg-red-600",
    pillDot: "bg-red-300",
    pillText: "text-white",
    headerIcon: <Truck size={30} />,
    collapsedIconWrap: "bg-red-700/25 border border-red-600/40",
    collapsedIconColor: "text-red-400",
  },
  container: {
    label: "CONTAINER",
    cardBorder: "border-blue-900/30",
    cardBg: "#070e1c",
    headerBg: "linear-gradient(145deg, #0c2040 0%, #091628 55%, #070e1c 100%)",
    dotColor: "#3b82f6",
    iconWrap: "bg-blue-800/40 border-2 border-blue-500/60",
    iconColor: "text-blue-400",
    fieldIconColor: "text-blue-500",
    fieldBorder: "border-blue-900/20",
    cargoBg: "linear-gradient(105deg, #0c2040 0%, #070e1c 100%)",
    cargoDecor: "text-blue-900/20",
    dividerColor: "#2563eb",
    statusFooterBg: "linear-gradient(180deg, #070e1c 0%, #050c16 100%)",
    pillBg: "bg-blue-600",
    pillDot: "bg-blue-300",
    pillText: "text-white",
    headerIcon: <Ship size={30} />,
    collapsedIconWrap: "bg-blue-700/25 border border-blue-600/40",
    collapsedIconColor: "text-blue-400",
  },
  pallet: {
    label: "PALLETS",
    cardBorder: "border-orange-700/40",
    cardBg: "#081017",
    headerBg: "linear-gradient(145deg, #111820 0%, #0b1218 52%, #1a0d04 100%)",
    dotColor: "#f97316",
    iconWrap: "bg-orange-800/35 border-2 border-orange-500/70",
    iconColor: "text-orange-300",
    fieldIconColor: "text-orange-500",
    fieldBorder: "border-orange-900/25",
    cargoBg: "linear-gradient(105deg, #101820 0%, #081017 58%, #1c0d04 100%)",
    cargoDecor: "text-orange-900/20",
    dividerColor: "#f97316",
    statusFooterBg: "linear-gradient(180deg, #081017 0%, #0b0806 100%)",
    pillBg: "bg-orange-600",
    pillDot: "bg-orange-200",
    pillText: "text-white",
    headerIcon: <Boxes size={30} />,
    collapsedIconWrap: "bg-orange-700/25 border border-orange-500/45",
    collapsedIconColor: "text-orange-300",
  },
} as const;

function customerFriendlyStatus(status?: string | null): string {
  const text = String(status ?? "").trim();
  const lower = text.toLowerCase();
  const etaMatch = text.match(/\bETA\s+([A-Za-z]+)\s+(.+)$/i);
  if (etaMatch?.[1] && etaMatch[2]) return `Expected at ${etaMatch[1]}: ${etaMatch[2].trim()}`;
  if (lower.includes("at pod") || lower.includes("at port")) return "At port of discharge";
  if (lower.includes("on sea") || lower.includes("at sea")) return "On sea";
  if (lower.includes("enroute")) return "Enroute to destination";
  if (lower.includes("in transit")) return "In transit";
  if (lower.includes("awaiting clearance")) return "Awaiting clearance";
  if (lower.includes("delivered")) return "Delivered";
  return text || "N/A";
}

function StatusPill({
  status,
  theme,
  large = false,
}: {
  status: string;
  theme: typeof T[Variant];
  large?: boolean;
}) {
  const displayStatus = customerFriendlyStatus(status);
  return (
    <span
      className={`relative inline-flex items-center gap-2 font-bold rounded-full max-w-full text-center leading-tight ${theme.pillBg} ${theme.pillText} shadow-[0_0_18px_rgba(255,255,255,0.12)] ${
        large
          ? "px-5 sm:px-8 py-3.5 text-sm sm:text-base tracking-wider sm:tracking-widest w-full justify-center"
          : "px-3 py-1.5 text-[11px] tracking-wide"
      }`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${theme.pillDot} opacity-60`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${theme.pillDot}`} />
      </span>
      {displayStatus.toUpperCase()}
    </span>
  );
}

function FieldCell({
  icon,
  label,
  value,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  theme: typeof T[Variant];
}) {
  const displayValue = value?.toString().trim() || "N/A";
  return (
    <div className="flex flex-col gap-1 py-4">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <span className={theme.fieldIconColor}>{icon}</span>
        {label}
      </span>
      <span className="text-white font-semibold text-sm leading-snug">{displayValue}</span>
    </div>
  );
}

function extraText(extraFields: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = extraFields?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

const containerJourneySteps = ["On Sea", "At POD", "Enroute", "In Malawi"];
const inlandJourneySteps = ["At POD", "Enroute", "In Malawi"];

function journeyIndex(status: string, steps: string[], sourceSection?: string): number {
  const section = sourceSection?.toLowerCase() ?? "";
  if (section.includes("malawi")) return steps.length - 1;
  if (section.includes("enroute")) return Math.max(0, steps.length - 2);
  if (section.includes("pod")) return steps[0] === "On Sea" ? 1 : 0;
  if (section.includes("sea")) return 0;

  const text = status.toLowerCase();
  if (text.includes("delivered") || text.includes("malawi") || text.includes("clearance")) return steps.length - 1;
  if (text.includes("enroute") || text.includes("transit")) return Math.max(0, steps.length - 2);
  if (text.includes("pod") || text.includes("port") || text.includes("offloading")) return steps[0] === "On Sea" ? 1 : 0;
  return 0;
}

function ShipmentJourney({ status, theme, variant, sourceSection = "" }: { status: string; theme: typeof T[Variant]; variant: Variant; sourceSection?: string }) {
  const steps = variant === "container" ? containerJourneySteps : inlandJourneySteps;
  const activeIndex = journeyIndex(status, steps, sourceSection);
  const progress = steps.length <= 1 ? 0 : (activeIndex / (steps.length - 1)) * 100;

  return (
    <div className="px-4 sm:px-5 py-4">
      <div className={`relative grid gap-2 ${steps.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        <div className="absolute left-0 right-0 top-3 h-px bg-white/10" />
        <motion.div
          className="absolute left-0 top-3 h-px"
          style={{ background: theme.dividerColor }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
        {steps.map((step, i) => {
          const reached = i <= activeIndex;
          return (
            <div key={step} className="relative flex flex-col items-center gap-2">
              <span
                className="z-10 h-6 w-6 rounded-full border flex items-center justify-center"
                style={{
                  borderColor: reached ? theme.dividerColor : "rgba(255,255,255,0.18)",
                  background: reached ? `${theme.dividerColor}33` : "rgba(255,255,255,0.05)",
                  boxShadow: reached ? `0 0 18px ${theme.dividerColor}55` : "none",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: reached ? theme.dividerColor : "rgba(255,255,255,0.28)" }}
                />
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wide text-center ${reached ? "text-white" : "text-zinc-600"}`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ShipmentCardProps {
  shipment: {
    id: number;
    ifsRef?: string;
    mraRef?: string | null;
    containerNo?: string | null;
    shipper?: string | null;
    consignee?: string | null;
    cargoDescription?: string | null;
    invoiceNo?: string | null;
    pod?: string | null;
    entry?: string | null;
    finalPortDestination?: string | null;
    status: string;
    companyName?: string | null;
    lastUpdated?: string;
    extraFields?: Record<string, unknown> | null;
  };
  statusChange?: { oldValue: string; newValue: string };
  highlight?: boolean;
  changeToken?: string;
  onViewed?: (changeToken?: string) => void;
  index?: number;
  defaultOpen?: boolean;
}

export function ShipmentCard({ shipment: s, statusChange, highlight = false, changeToken, onViewed, defaultOpen = false }: ShipmentCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const variant = resolveVariant(s.extraFields);
  const theme = T[variant];
  const ef = s.extraFields ?? {};
  const typeLabel = String(ef["Type"] ?? ef["type"] ?? "").toUpperCase() || null;
  const sourceSection = String(ef["Source Section"] ?? ef["sourceSection"] ?? ef["Section"] ?? "").trim();
  const blManifestNo = extraText(s.extraFields, "BL / Manifest No.", "BL/Manifest No.", "BL", "bl", "Manifest No.", "manifestNo");
  const collapsedIdentifier = variant === "container" ? (s.containerNo || "N/A") : (blManifestNo || "N/A");

  const handleToggle = () => {
    setIsOpen((current) => {
      const next = !current;
      if (next && statusChange) onViewed?.(changeToken);
      return next;
    });
  };

  return (
    <div
      id={`shipment-${s.ifsRef}`}
      className={`rounded-xl sm:rounded-2xl overflow-hidden border glow-card glow-card--reactive shipment-card ${highlight ? "shipment-card--changed" : ""} ${theme.cardBorder} shadow-2xl scroll-mt-28`}
      style={{ background: theme.cardBg }}
    >
      <button className="w-full text-left" onClick={handleToggle}>
        <div
          className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 hover:brightness-110 transition-all ${highlight && !isOpen ? "shipment-card__summary--changed" : ""}`}
          style={{ background: isOpen ? "transparent" : theme.headerBg }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${theme.collapsedIconWrap}`}>
              <span className={theme.collapsedIconColor}>
                {variant === "truck" ? <Truck size={16} /> : variant === "pallet" ? <Boxes size={16} /> : <Ship size={16} />}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.dotColor }}>
                {theme.label}
                {typeLabel ? ` - ${typeLabel}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-white font-bold text-sm sm:text-[15px] leading-tight truncate max-w-full">
                  {collapsedIdentifier}
                </p>
                {s.entry && <span className="text-[11px] text-zinc-400 truncate">{s.entry}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-[11px] text-zinc-500 truncate">{s.companyName || s.consignee || "N/A"}</p>
                {s.invoiceNo && <span className="text-[11px] text-zinc-500 truncate">Inv: {s.invoiceNo}</span>}
              </div>
              <p className="text-[11px] text-zinc-400 truncate">{s.cargoDescription?.trim() || "N/A"}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 shrink-0 min-w-[88px] sm:min-w-[116px]">
            <div className="flex flex-col items-end gap-0.5 max-w-[104px] sm:max-w-[130px]">
              <StatusPill status={s.status} theme={theme} />
              {statusChange && (
                <span className="shipment-card__change-bell" aria-label="Shipment changed">
                  <Bell size={13} />
                </span>
              )}
            </div>
            <div className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}>
              <ChevronDown size={15} className="text-zinc-500" />
            </div>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pt-4 pb-4 relative overflow-hidden" style={{ background: theme.headerBg }}>
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(circle, ${theme.dotColor} 1px, transparent 1px)`,
                backgroundSize: "18px 18px",
              }}
            />
            <div
              className={`absolute right-4 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none ${theme.cargoDecor}`}
              style={{ color: theme.dotColor }}
            >
              {variant === "truck"
                ? <Truck size={120} strokeWidth={0.7} />
                : variant === "pallet"
                ? <Boxes size={120} strokeWidth={0.7} />
                : <Ship size={120} strokeWidth={0.7} />}
            </div>

            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] mb-2 relative z-10" style={{ color: theme.dotColor }}>
              {theme.label}
            </p>

            <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:flex sm:flex-row sm:items-center">
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 ${theme.iconWrap}`}>
                <span className={theme.iconColor}>{theme.headerIcon}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-500 uppercase tracking-[0.22em] font-semibold mb-0.5">IFS Ref</p>
                <p className="text-lg sm:text-2xl font-extrabold text-white leading-tight break-all">
                  {s.ifsRef || "—"}
                </p>
              </div>

              <div className="col-span-2 flex flex-col items-start sm:col-auto sm:items-end gap-1 pt-1 sm:pt-0">
                <StatusPill status={s.status} theme={theme} />
                {statusChange && (
                  <motion.span
                    initial={{ opacity: 0.45 }}
                    animate={{ opacity: [0.65, 1, 0.65] }}
                    transition={{ duration: 1.4, repeat: 1 }}
                    className="text-[11px] font-semibold text-white/70"
                  >
                    {customerFriendlyStatus(statusChange.oldValue)} -&gt; {customerFriendlyStatus(statusChange.newValue)}
                  </motion.span>
                )}
              </div>
            </div>
          </div>

          <div className="relative h-px mx-0">
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(90deg, ${theme.dividerColor} 0%, ${theme.dividerColor}66 40%, transparent 100%)` }}
            />
            <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 rounded-full" style={{ background: theme.dividerColor }} />
          </div>

          <div className={`divide-y ${theme.fieldBorder}`}>
            <div className={`grid grid-cols-2 px-4 sm:px-5 ${theme.fieldBorder} sm:grid-cols-2 sm:divide-x`}>
              <div className="pr-3 sm:pr-5">
                <FieldCell icon={<FileText size={11} />} label="MRA Ref" value={s.mraRef} theme={theme} />
              </div>
              <div className="pl-3 sm:pl-5">
                <FieldCell
                  icon={variant === "container" ? <Box size={11} /> : <FileText size={11} />}
                  label={variant === "container" ? "Container No." : "BL / Manifest No."}
                  value={variant === "container" ? s.containerNo : blManifestNo}
                  theme={theme}
                />
              </div>
            </div>

            <div className={`grid grid-cols-2 px-4 sm:px-5 ${theme.fieldBorder} sm:grid-cols-2 sm:divide-x`}>
              <div className="pr-3 sm:pr-5">
                <FieldCell icon={<User size={11} />} label="Shipper" value={s.shipper} theme={theme} />
              </div>
              <div className="pl-3 sm:pl-5">
                <FieldCell icon={<User size={11} />} label="Consignee" value={s.consignee || s.companyName} theme={theme} />
              </div>
            </div>

            <div className={`px-4 sm:px-5 flex items-center justify-between gap-3 relative overflow-hidden`} style={{ background: theme.cargoBg }}>
              <div className="flex-1 py-3">
                <FieldCell icon={<Box size={11} />} label="Cargo Description" value={s.cargoDescription} theme={theme} />
              </div>
              <div className={`shrink-0 opacity-20 ${theme.cargoDecor}`} style={{ color: theme.dotColor }}>
                {variant === "truck"
                  ? <Truck size={56} strokeWidth={0.9} />
                  : variant === "pallet"
                  ? <Boxes size={56} strokeWidth={0.9} />
                  : <Box size={56} strokeWidth={0.9} />}
              </div>
            </div>

            <div className={`grid grid-cols-3 px-4 sm:px-5 ${theme.fieldBorder} sm:grid-cols-3 sm:divide-x`}>
              <div className="pr-2 sm:pr-5">
                <FieldCell icon={<FileText size={11} />} label="Invoice No." value={s.invoiceNo} theme={theme} />
              </div>
              <div className="px-2 sm:px-5">
                <FieldCell icon={<Anchor size={11} />} label="POD" value={s.pod} theme={theme} />
              </div>
              <div className="pl-2 sm:pl-5">
                <FieldCell icon={<MapPin size={11} />} label="Entry" value={s.entry} theme={theme} />
              </div>
            </div>

            <div className="px-4 sm:px-5">
              <FieldCell icon={<Flag size={11} />} label="Final Port Destination (FPD)" value={s.finalPortDestination} theme={theme} />
            </div>

            <ShipmentJourney status={s.status} theme={theme} variant={variant} sourceSection={sourceSection} />

            <div className="px-4 sm:px-5 pt-3 pb-4" style={{ background: theme.statusFooterBg }}>
              <p className="text-[10px] text-zinc-600 uppercase tracking-[0.22em] text-center mb-3 font-semibold">
                Status
              </p>
              <StatusPill status={s.status} theme={theme} large />
              {statusChange && (
                <motion.p
                  initial={{ opacity: 0.5, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-center text-xs font-semibold text-zinc-300 mt-3"
                >
                  {customerFriendlyStatus(statusChange.oldValue)} -&gt; {customerFriendlyStatus(statusChange.newValue)}
                </motion.p>
              )}
              {s.lastUpdated && (
                <p className="text-center text-[10px] text-zinc-600 mt-3">
                  Last updated · {formatDate(s.lastUpdated)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

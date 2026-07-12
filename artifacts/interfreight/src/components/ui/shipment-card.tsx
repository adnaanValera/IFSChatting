import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, FileText, Anchor, MapPin, Flag,
  User, Box, Ship, Truck, Boxes,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

/* ── Variant ──────────────────────────────────────────────────────────────── */

type Variant = "container" | "truck" | "pallet";

function resolveVariant(extraFields?: Record<string, unknown> | null): Variant {
  const t = String(
    extraFields?.["Type"] ?? extraFields?.["type"] ?? ""
  ).toUpperCase().trim();
  if (t === "LCL") return "pallet";
  if (t === "FTL" || t === "LTL") return "truck";
  return "container"; // FCL or unknown → container/ship card
}

/* ── Themes ───────────────────────────────────────────────────────────────── */

const T = {
  truck: {
    label: "TRUCK",
    cardBorder: "border-red-900/30",
    cardBg: "#0d0808",
    headerBg: "linear-gradient(145deg, #220808 0%, #160606 55%, #0d0808 100%)",
    dotColor: "#ef4444",
    iconWrap: "bg-red-800/40 border-2 border-red-600/60",
    iconColor: "text-red-400",
    accentLine: "from-red-600/90 via-red-500/40 to-transparent",
    fieldIconColor: "text-red-500",
    fieldBorder: "border-red-900/20",
    cargoBg: "linear-gradient(105deg, #200707 0%, #0d0808 100%)",
    cargoDecor: "text-red-900/20",
    dividerColor: "#dc2626",
    statusFooterBg: "linear-gradient(180deg, #0d0808 0%, #090505 100%)",
    pillBg: "bg-red-600",
    pillDot: "bg-red-300",
    pillText: "text-white",
    badgeBg: "bg-red-600",
    badgeIcon: <Truck size={13} />,
    headerIcon: <Truck size={30} />,
    cargoIcon: <Truck size={48} strokeWidth={0.8} />,
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
    accentLine: "from-blue-600/90 via-blue-500/40 to-transparent",
    fieldIconColor: "text-blue-500",
    fieldBorder: "border-blue-900/20",
    cargoBg: "linear-gradient(105deg, #0c2040 0%, #070e1c 100%)",
    cargoDecor: "text-blue-900/20",
    dividerColor: "#2563eb",
    statusFooterBg: "linear-gradient(180deg, #070e1c 0%, #050c16 100%)",
    pillBg: "bg-blue-600",
    pillDot: "bg-blue-300",
    pillText: "text-white",
    badgeBg: "bg-blue-600",
    badgeIcon: <Ship size={13} />,
    headerIcon: <Ship size={30} />,
    cargoIcon: <Box size={48} strokeWidth={0.8} />,
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
    accentLine: "from-orange-500/95 via-orange-400/45 to-transparent",
    fieldIconColor: "text-orange-500",
    fieldBorder: "border-orange-900/25",
    cargoBg: "linear-gradient(105deg, #101820 0%, #081017 58%, #1c0d04 100%)",
    cargoDecor: "text-orange-900/20",
    dividerColor: "#f97316",
    statusFooterBg: "linear-gradient(180deg, #081017 0%, #0b0806 100%)",
    pillBg: "bg-orange-600",
    pillDot: "bg-orange-200",
    pillText: "text-white",
    badgeBg: "bg-orange-600",
    badgeIcon: <Boxes size={13} />,
    headerIcon: <Boxes size={30} />,
    cargoIcon: <Boxes size={48} strokeWidth={0.8} />,
    collapsedIconWrap: "bg-orange-700/25 border border-orange-500/45",
    collapsedIconColor: "text-orange-300",
  },
} as const;

/* ── Sub-components ───────────────────────────────────────────────────────── */

function HeaderBadge({ theme }: { theme: typeof T[Variant] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${theme.badgeBg} text-white font-bold rounded-full px-4 py-2 text-xs tracking-widest uppercase shrink-0`}
    >
      <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />
      {theme.badgeIcon}
      IN TRANSIT
    </span>
  );
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
          : "px-3 py-1.5 text-[11px] sm:text-xs tracking-wide sm:tracking-wider"
      }`}
    >
      <span className={`relative flex h-2 w-2 shrink-0`}>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${theme.pillDot} opacity-60`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${theme.pillDot}`} />
      </span>
      {displayStatus.toUpperCase()}
    </span>
  );
}

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
      <span
        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500`}
      >
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

/* ── Main component ───────────────────────────────────────────────────────── */

const containerJourneySteps = ["On Sea", "At POD", "Enroute", "In Malawi"];
const inlandJourneySteps = ["At POD", "Enroute", "In Malawi"];

function journeyIndex(status: string, steps: string[], sourceSection?: string): number {
  const section = sourceSection.toLowerCase();
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
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
        {steps.map((step, i) => {
          const reached = i <= activeIndex;
          return (
            <div key={step} className="relative flex flex-col items-center gap-2">
              <motion.span
                initial={{ scale: 0.85 }}
                animate={{ scale: reached ? 1 : 0.9 }}
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
              </motion.span>
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
  index?: number;
  defaultOpen?: boolean;
}

export function ShipmentCard({ shipment: s, statusChange, highlight = false, index = 0, defaultOpen = false }: ShipmentCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const variant = resolveVariant(s.extraFields);
  const theme = T[variant];

  // Extra fields helpers
  const ef = s.extraFields ?? {};
  const typeLabel = String(ef["Type"] ?? ef["type"] ?? "").toUpperCase() || null;
  const sourceSection = String(ef["Source Section"] ?? ef["sourceSection"] ?? ef["Section"] ?? "").trim();
  const blManifestNo = extraText(s.extraFields, "BL / Manifest No.", "BL/Manifest No.", "BL", "bl", "Manifest No.", "manifestNo");
  const collapsedIdentifier = variant === "container" ? (s.containerNo || "N/A") : (blManifestNo || "N/A");

  return (
    <motion.div
      id={`shipment-${s.ifsRef}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.34, ease: "easeOut" }}
      className={`rounded-xl sm:rounded-2xl overflow-hidden border glow-card glow-card--reactive shipment-card ${highlight ? "shipment-card--changed" : ""} ${theme.cardBorder} shadow-2xl scroll-mt-28`}
      style={{ background: theme.cardBg }}
    >
      {/* ── Collapsed header — always visible ─────────────────────────────── */}
      <button className="w-full text-left" onClick={() => setIsOpen((o) => !o)}>
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 hover:brightness-110 transition-all"
          style={{ background: isOpen ? "transparent" : theme.headerBg }}
        >
          {/* Left: icon + ref */}
          <div className="flex items-center gap-3 min-w-0 w-full">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${theme.collapsedIconWrap}`}
            >
              <span className={theme.collapsedIconColor}>
                {variant === "truck" ? <Truck size={18} /> : variant === "pallet" ? <Boxes size={18} /> : <Ship size={18} />}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: theme.dotColor }}
              >
                {theme.label}
                {typeLabel ? ` · ${typeLabel}` : ""}
              </p>
              <p className="text-white font-bold text-sm sm:text-base leading-tight truncate">
                {collapsedIdentifier}
              </p>
              {s.companyName && (
                <p className="text-xs text-zinc-500 truncate mt-0.5">{s.companyName}</p>
              )}
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {s.cargoDescription?.trim() || "N/A"}
              </p>
            </div>
          </div>

          {/* Right: status + chevron */}
          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0 w-full sm:w-auto">
            <div className="flex flex-col items-end gap-1 max-w-[calc(100%-1.75rem)]">
              <StatusPill status={s.status} theme={theme} />
              {statusChange && (
                <motion.span
                  initial={{ opacity: 0.45 }}
                  animate={{ opacity: [0.65, 1, 0.65] }}
                  transition={{ duration: 1.8, repeat: 2 }}
                  className="text-[11px] font-semibold text-white/70"
                >
                  {customerFriendlyStatus(statusChange.oldValue)} -&gt; {customerFriendlyStatus(statusChange.newValue)}
                </motion.span>
              )}
            </div>
            <div
              className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            >
              <ChevronDown size={16} className="text-zinc-500" />
            </div>
          </div>
        </div>
      </button>

      {/* ── Expanded card ─────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* ── Header section ── */}
            <div
              className="px-4 sm:px-5 pt-5 pb-5 relative overflow-hidden"
              style={{ background: theme.headerBg }}
            >
              {/* Dot-grid decoration */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle, ${theme.dotColor} 1px, transparent 1px)`,
                  backgroundSize: "18px 18px",
                }}
              />
              {/* Decorative large background icon */}
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

              {/* Type label */}
              <p
                className="text-[11px] font-extrabold uppercase tracking-[0.25em] mb-3 relative z-10"
                style={{ color: theme.dotColor }}
              >
                {theme.label}
              </p>

              {/* Icon + IFS Ref + Badge row */}
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
                <div
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 ${theme.iconWrap}`}
                >
                  <span className={theme.iconColor}>{theme.headerIcon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">
                    IFS Ref
                  </p>
                  <p className="text-xl sm:text-2xl font-extrabold text-white leading-tight break-all">
                    {s.ifsRef || "—"}
                  </p>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-1">
                  <StatusPill status={s.status} theme={theme} />
                  {statusChange && (
                    <motion.span
                      initial={{ opacity: 0.45 }}
                      animate={{ opacity: [0.65, 1, 0.65] }}
                      transition={{ duration: 1.8, repeat: 2 }}
                      className="text-[11px] font-semibold text-white/70"
                    >
                      {customerFriendlyStatus(statusChange.oldValue)} -&gt; {customerFriendlyStatus(statusChange.newValue)}
                    </motion.span>
                  )}
                </div>
              </div>
            </div>

            {/* Accent divider */}
            <div className="relative h-px mx-0">
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(90deg, ${theme.dividerColor} 0%, ${theme.dividerColor}66 40%, transparent 100%)` }}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 rounded-full"
                style={{ background: theme.dividerColor }}
              />
            </div>

            {/* ── Field grid ── */}
            <div className={`divide-y ${theme.fieldBorder}`}>

              {/* MRA Ref | Container/Pallet No. */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 sm:divide-x ${theme.fieldBorder} px-4 sm:px-5`}>
                  <div className="sm:pr-5">
                    <FieldCell icon={<FileText size={11} />} label="MRA Ref" value={s.mraRef} theme={theme} />
                  </div>
                  <div className="sm:pl-5">
                    <FieldCell
                      icon={variant === "container" ? <Box size={11} /> : <FileText size={11} />}
                      label={variant === "container" ? "Container No." : "BL / Manifest No."}
                      value={variant === "container" ? s.containerNo : blManifestNo}
                      theme={theme}
                    />
                  </div>
                </div>

              {/* Shipper | Consignee */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 sm:divide-x ${theme.fieldBorder} px-4 sm:px-5`}>
                  <div className="sm:pr-5">
                    <FieldCell icon={<User size={11} />} label="Shipper" value={s.shipper} theme={theme} />
                  </div>
                  <div className="sm:pl-5">
                    <FieldCell icon={<User size={11} />} label="Consignee" value={s.consignee || s.companyName} theme={theme} />
                  </div>
                </div>

              {/* Cargo Description — full width with decorative icon */}
              <div
                  className={`px-4 sm:px-5 flex items-center justify-between gap-4 relative overflow-hidden`}
                  style={{ background: theme.cargoBg }}
                >
                  <div className="flex-1 py-4">
                    <FieldCell
                      icon={<Box size={11} />}
                      label="Cargo Description"
                      value={s.cargoDescription}
                      theme={theme}
                    />
                  </div>
                  <div
                    className={`shrink-0 opacity-20 ${theme.cargoDecor}`}
                    style={{ color: theme.dotColor }}
                  >
                    {variant === "truck"
                      ? <Truck size={56} strokeWidth={0.9} />
                      : variant === "pallet"
                      ? <Boxes size={56} strokeWidth={0.9} />
                      : <Box size={56} strokeWidth={0.9} />}
                  </div>
                </div>

              {/* Invoice No. | POD | Entry */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 sm:divide-x ${theme.fieldBorder} px-4 sm:px-5`}>
                <div className="sm:pr-5">
                  <FieldCell icon={<FileText size={11} />} label="Invoice No." value={s.invoiceNo} theme={theme} />
                </div>
                <div className="sm:px-5">
                  <FieldCell icon={<Anchor size={11} />} label="POD" value={s.pod} theme={theme} />
                </div>
                <div className="sm:pl-5">
                  <FieldCell icon={<MapPin size={11} />} label="Entry" value={s.entry} theme={theme} />
                </div>
              </div>

              {/* Final Port Destination */}
              <div className="px-4 sm:px-5">
                  <FieldCell
                    icon={<Flag size={11} />}
                    label="Final Port Destination (FPD)"
                    value={s.finalPortDestination}
                    theme={theme}
                  />
                </div>

              <ShipmentJourney status={s.status} theme={theme} variant={variant} sourceSection={sourceSection} />

              {/* STATUS footer */}
              <div
                className="px-4 sm:px-5 pt-4 pb-5"
                style={{ background: theme.statusFooterBg }}
              >
                <p className="text-[10px] text-zinc-600 uppercase tracking-[0.22em] text-center mb-3 font-semibold">
                  Status
                </p>
                <StatusPill status={s.status} theme={theme} large />
                {statusChange && (
                  <motion.p
                    initial={{ opacity: 0.5, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


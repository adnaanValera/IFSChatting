import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, FileText, Anchor, MapPin, Flag,
  User, Box, Ship, Truck,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

/* ── Variant ──────────────────────────────────────────────────────────────── */

type Variant = "container" | "truck";

function resolveVariant(extraFields?: Record<string, unknown> | null): Variant {
  const t = String(
    extraFields?.["Type"] ?? extraFields?.["type"] ?? ""
  ).toUpperCase().trim();
  if (t === "LCL" || t === "FTL" || t === "LTL") return "truck";
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
  return (
    <span
      className={`inline-flex items-center gap-2 font-bold rounded-full ${theme.pillBg} ${theme.pillText} ${
        large
          ? "px-8 py-3.5 text-base tracking-widest w-full justify-center"
          : "px-3 py-1.5 text-xs tracking-wider"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${theme.pillDot} shrink-0`} />
      {status?.toUpperCase()}
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
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1 py-4">
      <span
        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500`}
      >
        <span className={theme.fieldIconColor}>{icon}</span>
        {label}
      </span>
      <span className="text-white font-semibold text-sm leading-snug">{value}</span>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */

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
  index?: number;
  defaultOpen?: boolean;
}

export function ShipmentCard({ shipment: s, index = 0, defaultOpen = false }: ShipmentCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const variant = resolveVariant(s.extraFields);
  const theme = T[variant];

  // Extra fields helpers
  const ef = s.extraFields ?? {};
  const typeLabel = String(ef["Type"] ?? ef["type"] ?? "").toUpperCase() || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28, ease: "easeOut" }}
      className={`rounded-2xl overflow-hidden border ${theme.cardBorder} shadow-2xl`}
      style={{ background: theme.cardBg }}
    >
      {/* ── Collapsed header — always visible ─────────────────────────────── */}
      <button className="w-full text-left" onClick={() => setIsOpen((o) => !o)}>
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 hover:brightness-110 transition-all"
          style={{ background: isOpen ? "transparent" : theme.headerBg }}
        >
          {/* Left: icon + ref */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${theme.collapsedIconWrap}`}
            >
              <span className={theme.collapsedIconColor}>
                {variant === "truck" ? <Truck size={18} /> : <Ship size={18} />}
              </span>
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: theme.dotColor }}
              >
                {theme.label}
                {typeLabel ? ` · ${typeLabel}` : ""}
              </p>
              <p className="text-white font-bold text-base leading-tight truncate">
                {s.ifsRef || s.containerNo || "—"}
              </p>
              {s.companyName && (
                <p className="text-xs text-zinc-500 truncate mt-0.5">{s.companyName}</p>
              )}
            </div>
          </div>

          {/* Right: status + chevron */}
          <div className="flex items-center gap-3 shrink-0">
            <StatusPill status={s.status} theme={theme} />
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
              className="px-5 pt-5 pb-5 relative overflow-hidden"
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
              <div className="relative z-10 flex items-center gap-4">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 ${theme.iconWrap}`}
                >
                  <span className={theme.iconColor}>{theme.headerIcon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">
                    IFS Ref
                  </p>
                  <p className="text-2xl font-extrabold text-white leading-tight break-all">
                    {s.ifsRef || "—"}
                  </p>
                </div>

                <StatusPill status={s.status} theme={theme} />
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

              {/* MRA Ref | Container No. */}
              {(s.mraRef || s.containerNo) && (
                <div className={`grid grid-cols-2 divide-x ${theme.fieldBorder} px-5`}>
                  <div className="pr-5">
                    <FieldCell icon={<FileText size={11} />} label="MRA Ref" value={s.mraRef} theme={theme} />
                  </div>
                  <div className="pl-5">
                    <FieldCell icon={<Box size={11} />} label="Container No." value={s.containerNo} theme={theme} />
                  </div>
                </div>
              )}

              {/* Shipper | Consignee */}
              {(s.shipper || s.consignee) && (
                <div className={`grid grid-cols-2 divide-x ${theme.fieldBorder} px-5`}>
                  <div className="pr-5">
                    <FieldCell icon={<User size={11} />} label="Shipper" value={s.shipper} theme={theme} />
                  </div>
                  <div className="pl-5">
                    <FieldCell icon={<User size={11} />} label="Consignee" value={s.consignee || s.companyName} theme={theme} />
                  </div>
                </div>
              )}

              {/* Cargo Description — full width with decorative icon */}
              {s.cargoDescription && (
                <div
                  className={`px-5 flex items-center justify-between gap-4 relative overflow-hidden`}
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
                      : <Box size={56} strokeWidth={0.9} />}
                  </div>
                </div>
              )}

              {/* Invoice No. | POD | Entry */}
              {(s.invoiceNo || s.pod || s.entry) && (() => {
                const cols = [s.invoiceNo, s.pod, s.entry].filter(Boolean);
                return (
                  <div
                    className={`grid divide-x ${theme.fieldBorder} px-5`}
                    style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
                  >
                    {s.invoiceNo && (
                      <div className="pr-5 first:pl-0 last:pr-0">
                        <FieldCell icon={<FileText size={11} />} label="Invoice No." value={s.invoiceNo} theme={theme} />
                      </div>
                    )}
                    {s.pod && (
                      <div className="px-5 first:pl-0 last:pr-0">
                        <FieldCell icon={<Anchor size={11} />} label="POD" value={s.pod} theme={theme} />
                      </div>
                    )}
                    {s.entry && (
                      <div className="pl-5 first:pl-0 last:pr-0">
                        <FieldCell icon={<MapPin size={11} />} label="Entry" value={s.entry} theme={theme} />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Final Port Destination */}
              {s.finalPortDestination && (
                <div className="px-5">
                  <FieldCell
                    icon={<Flag size={11} />}
                    label="Final Port Destination (FPD)"
                    value={s.finalPortDestination}
                    theme={theme}
                  />
                </div>
              )}

              {/* STATUS footer */}
              <div
                className="px-5 pt-4 pb-5"
                style={{ background: theme.statusFooterBg }}
              >
                <p className="text-[10px] text-zinc-600 uppercase tracking-[0.22em] text-center mb-3 font-semibold">
                  Status
                </p>
                <StatusPill status={s.status} theme={theme} large />
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

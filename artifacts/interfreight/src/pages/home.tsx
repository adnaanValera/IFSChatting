import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Truck, Ship, Plane, Warehouse, ShieldCheck, Clock, Globe, Award,
  ChevronRight, LogIn, LayoutDashboard, LogOut, ArrowRight,
  Phone, Mail, MapPin, Send, CheckCircle2, AlertCircle,
  Search, Building2, SearchX, X,
  TrainFront, Boxes, ClipboardCheck, Download,
} from "lucide-react";
import { ShipmentCard } from "@/components/ui/shipment-card";
import { Spinner } from "@/components/ui/spinner";
import consolidationImg from "@assets/WhatsApp_Image_2026-06-30_at_13.47.05_1783091673424.jpeg";
import warehouseImg from "@assets/WhatsApp_Image_2026-06-30_at_13.47.25_1783091673421.jpeg";
import worldMapImage from "@assets/premium_world_map.png";
import fullLogoUrl from "@assets/Inter_freight_logo_nobg.png";
import { Link } from "wouter";
import { useGetMe, useStaffLogout, useListShipments } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { isStandaloneDisplay } from "@/lib/pwa";

const services = [
  {
    icon: Truck,
    title: "Road Freight",
    desc: "Reliable door-to-door trucking across Malawi and the region. Full loads, part loads, and weekly consolidation runs handled with precision.",
  },
  {
    icon: Ship,
    title: "Ocean Freight",
    desc: "FCL and LCL shipping through the ports of Beira, Dar es Salaam, and Durban. Competitive rates with full end-to-end visibility.",
  },
  {
    icon: Plane,
    title: "Air Freight",
    desc: "Time-critical cargo moved fast. Scheduled and charter air services for urgent or high-value shipments across the continent.",
  },
  {
    icon: TrainFront,
    title: "Rail Freight",
    desc: "Cost-effective rail solutions for bulk cargo movements across Southern Africa's major rail corridors.",
  },
  {
    icon: Warehouse,
    title: "Warehousing & Customs",
    desc: "Secure bonded warehousing in Blantyre plus full MRA customs clearance - declarations, duties, and compliance handled end-to-end.",
  },
  {
    icon: ClipboardCheck,
    title: "Import & Export Consultation",
    desc: "Practical guidance for documentation, clearance planning, and day-to-day import/export decisions.",
  },
  {
    icon: Boxes,
    title: "Packaging & Palletization",
    desc: "Cargo preparation support including packaging, palletization, and careful handling for safer movement.",
  },
];

const stats = [
  { value: "2020", label: "Established in Malawi" },
  { value: "Blantyre", label: "Commercial City Base" },
  { value: "Border Points", label: "Malawi Coverage" },
  { value: "Mon-Fri", label: "8:00 AM - 5:00 PM" },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Licensed & Compliant",
    desc: "MRA-registered clearing agent fully compliant with Malawi customs regulations.",
  },
  {
    icon: Clock,
    title: "Fast Turnaround",
    desc: "We prioritise speed at every step - from port arrival to final-mile delivery.",
  },
  {
    icon: Globe,
    title: "Regional Coverage",
    desc: "Corridors into Zambia, Zimbabwe, Mozambique, Tanzania, and South Africa.",
  },
  {
    icon: Award,
    title: "Dedicated Account Manager",
    desc: "Every client gets a named point of contact who knows your cargo and deadlines.",
  },
];

const continentPoints = [
  { label: "North America", x: 178, y: 278 },
  { label: "South America", x: 372, y: 662 },
  { label: "Europe", x: 714, y: 220 },
  { label: "Africa", x: 844, y: 516 },
  { label: "Asia", x: 1230, y: 304 },
  { label: "Australia", x: 1450, y: 742 },
];

const worldRoutes = continentPoints.flatMap((point, index) => ([
  {
    mode: `${point.label} In`,
    color: "#A31E2C",
    origin: point.label,
    destination: "Malawi",
    note: `Imports and inbound cargo from ${point.label}.`,
    path: `M${point.x} ${point.y} C${Math.round((point.x + 918) / 2)} ${Math.round(point.y - 48 + index * 8)}, ${Math.round((point.x + 918) / 2) + 48} ${Math.round((point.y + 644) / 2)}, 918 644`,
  },
  {
    mode: `${point.label} Out`,
    color: "#F8F8F6",
    origin: "Malawi",
    destination: point.label,
    note: `Exports and outbound cargo to ${point.label}.`,
    path: `M918 644 C${Math.round((point.x + 918) / 2) - 36} ${Math.round((point.y + 644) / 2)}, ${Math.round((point.x + 918) / 2)} ${Math.round(point.y + 56 - index * 7)}, ${point.x} ${point.y}`,
  },
]));

const routeSummaryCards = [
  {
    title: "Import",
    description: "We import from around the world.",
    color: "#A31E2C",
  },
  {
    title: "Export",
    description: "We export around the world.",
    color: "#F8F8F6",
  },
];

function setReactiveGlowTarget(event: React.MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--glow-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  event.currentTarget.style.setProperty("--glow-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

function AnimatedStat({ value, label, index }: { value: string; label: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.35 }}
    >
      <p className="text-3xl md:text-4xl font-extrabold text-primary mb-2">
        {value}
      </p>
      <p className="text-white/60 text-sm font-medium uppercase tracking-wider">{label}</p>
    </motion.div>
  );
}

function WorldMapNetwork() {
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [activeContinent, setActiveContinent] = useState<string | null>(null);

  return (
    <section className="py-14">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/15 bg-secondary/82 shadow-xl backdrop-blur-md glow-card overflow-hidden">
          <div className="px-6 py-8 sm:px-10 sm:py-10 text-center border-b border-white/10">
            <p className="text-primary font-semibold tracking-widest uppercase text-sm mb-3">
              Import & Export Network
            </p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
              Connected Beyond Borders
            </h2>
            <p className="text-white/65 text-lg max-w-3xl mx-auto">
              We import from around the world and we export around the world.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-0">
            <div className="p-5 sm:p-8">
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/35 shadow-inner">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.10),transparent_40%),radial-gradient(circle_at_55%_68%,rgba(163,30,44,0.24),transparent_18%)]" />
                <div className="absolute inset-0 opacity-35 blur-2xl [background:radial-gradient(circle_at_56%_69%,rgba(163,30,44,0.45),transparent_10%),radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.18),transparent_35%)]" />
                <img
                  src={worldMapImage}
                  alt="InterFreight global shipping network"
                  className="relative z-10 w-full h-auto object-cover opacity-92 [filter:drop-shadow(0_0_18px_rgba(255,255,255,0.18))]"
                />
                <svg viewBox="0 0 1660 948" className="absolute inset-0 z-20 h-full w-full">
                  <defs>
                    <filter id="routeGlow">
                      <feGaussianBlur stdDeviation="4.8" result="blur" />
                      <feFlood floodColor="#ffffff" floodOpacity="0.8" result="whiteFlood" />
                      <feComposite in="whiteFlood" in2="blur" operator="in" result="whiteGlow" />
                      <feMerge>
                        <feMergeNode in="whiteGlow" />
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <radialGradient id="malawiGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgba(163,30,44,0.95)" />
                      <stop offset="100%" stopColor="rgba(163,30,44,0)" />
                    </radialGradient>
                  </defs>

                  <ellipse cx="918" cy="644" rx="42" ry="72" fill="url(#malawiGlow)" opacity="0.9" />

                  {worldRoutes.map((route, index) => {
                    const isActive = activeRoute === route.mode || activeRoute === route.origin || activeRoute === route.destination;
                    return (
                      <g key={route.mode}>
                        <path
                          d={route.path}
                          fill="none"
                          stroke={route.color}
                          strokeOpacity={isActive ? "0.42" : "0.2"}
                          strokeWidth="2"
                          strokeDasharray="8 10"
                        />
                        <motion.path
                          d={route.path}
                          fill="none"
                          stroke={route.color}
                          strokeWidth={isActive ? 3.4 : route.mode === "ROAD" ? 2.8 : 2.4}
                          strokeOpacity={isActive ? 1 : 0.88}
                          strokeLinecap="round"
                          filter="url(#routeGlow)"
                          strokeDasharray="26 280"
                          animate={{ strokeDashoffset: [0, -306] }}
                          transition={{ duration: isActive ? 2.7 : 3.8, repeat: Infinity, ease: "linear", delay: index * 0.45 }}
                        />
                      </g>
                    );
                  })}

                  {[0, 1, 2].map((index) => (
                    <motion.circle
                      key={`malawi-pulse-${index}`}
                      cx="918"
                      cy="644"
                      r="14"
                      fill="none"
                      stroke={index === 2 ? "#ffffff" : "#A31E2C"}
                      strokeOpacity={index === 2 ? 0.18 : 0.32}
                      strokeWidth={index === 2 ? 1.5 : 2}
                      animate={{ r: [12, 30, 12], opacity: [0.25, 0.85, 0.25] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: index * 0.3 }}
                    />
                  ))}

                  {[...continentPoints, { x: 918, y: 644, label: "Malawi", tone: "#A31E2C" }].map((point) => {
                    const isActive = activeRoute === point.label || activeContinent === point.label;
                    return (
                      <motion.g
                        key={point.label}
                        onMouseEnter={() => setActiveContinent(point.label)}
                        onMouseLeave={() => setActiveContinent(null)}
                        animate={{ y: isActive ? -6 : 0, scale: isActive ? 1.02 : 1 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle cx={point.x} cy={point.y} r={isActive ? "7" : "6"} fill={"tone" in point ? point.tone : "#F8F8F6"} />
                        <circle cx={point.x} cy={point.y} r={isActive ? "22" : "18"} fill="none" stroke={"tone" in point ? point.tone : "#F8F8F6"} strokeOpacity={isActive ? "0.42" : "0.25"} />
                        {isActive ? (
                          <circle cx={point.x} cy={point.y} r="25" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.2" />
                        ) : null}
                        <text x={point.x + 16} y={point.y - 14} fill={"tone" in point ? point.tone : "#F8F8F6"} fontSize="18" fontWeight="700" opacity={isActive ? "1" : "0.9"}>
                          {point.label}
                        </text>
                      </motion.g>
                    );
                  })}
                </svg>
              </div>
            </div>

            <div className="border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[0.03] p-6 sm:p-8 space-y-4">
              {routeSummaryCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08, duration: 0.35 }}
                  onMouseMove={setReactiveGlowTarget}
                  onMouseEnter={() => setActiveRoute(card.title === "Import" || card.title === "Export" ? "Malawi" : card.title)}
                  onMouseLeave={() => setActiveRoute(null)}
                  className={`rounded-2xl border border-white/10 bg-white/[0.04] p-5 glow-card glow-card--reactive ${activeRoute === card.title ? "route-card-active" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold tracking-[0.26em] uppercase" style={{ color: card.color }}>
                      {card.title}
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <p className="text-white font-bold text-lg mt-3">{card.title} Worldwide</p>
                  <p className="text-white/58 text-sm mt-2">{card.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StaffTracker() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input.trim());
      if (input.trim()) setHasSearched(true);
    }, 400);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading } = useListShipments({
    search: search || undefined,
    limit: 50,
  });

  const shipments = data?.items ?? [];

  const handleClear = () => {
    setInput("");
    setSearch("");
    setHasSearched(false);
    inputRef.current?.focus();
  };

  return (
    <section className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div className="text-center mb-10 rounded-3xl border border-white/15 bg-white/90 px-6 py-10 shadow-xl backdrop-blur-md">
          <p className="text-primary font-semibold tracking-widest uppercase text-sm mb-3">
            Staff &amp; Admin
          </p>
          <h2 className="text-4xl font-extrabold text-secondary mb-3">
            Company Shipment Lookup
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Search any company name to instantly pull up all their containers.
          </p>
        </div>

        <div onMouseMove={setReactiveGlowTarget} className="bg-white rounded-2xl shadow-lg border border-border p-5 mb-8 glow-card glow-card--reactive glow-card--light">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={20} />
            <input
              ref={inputRef}
              type="text"
              placeholder='e.g. "Atomic Hardware" or "Shire Ltd"'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full pl-11 pr-10 py-3.5 rounded-xl border border-input text-base focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-background"
              autoFocus
            />
            {input && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-secondary transition-colors"
                aria-label="Clear search"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {!hasSearched ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Enter a company name above</p>
            <p className="text-sm mt-1">All matching containers will appear as cards below</p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Spinner className="w-10 h-10 text-primary mb-4" />
            <p>Searching...</p>
          </div>
        ) : shipments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onMouseMove={setReactiveGlowTarget}
            className="bg-white rounded-2xl border border-border p-14 flex flex-col items-center text-center shadow-sm glow-card glow-card--reactive glow-card--light"
          >
            <SearchX className="w-14 h-14 text-muted-foreground mb-4 opacity-40" />
            <h3 className="text-xl font-bold text-secondary mb-2">No containers found</h3>
            <p className="text-muted-foreground max-w-sm">
              No shipments match <span className="font-semibold text-secondary">"{search}"</span>.
              Try a different spelling.
            </p>
          </motion.div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-secondary">{data?.total ?? shipments.length}</span> container{(data?.total ?? shipments.length) !== 1 ? "s" : ""} found
                {search && <> for <span className="font-semibold text-secondary">"{search}"</span></>}
              </p>
            </div>
            <div className="space-y-4">
              {shipments.map((shipment, index) => (
                <ShipmentCard key={shipment.id} shipment={shipment} index={index} />
              ))}
            </div>
            {(data?.total ?? 0) > shipments.length && (
              <p className="text-center text-sm text-muted-foreground mt-8">
                Showing {shipments.length} of {data?.total} - refine your search to narrow results
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe();
  const logoutMutation = useStaffLogout();

  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
        localStorage.removeItem("intf_session_duration_confirmed");
        queryClient.clear();
        window.location.href = "/";
      },
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendError("");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to send message");
      }
      setSent(true);
      setForm({ name: "", email: "", company: "", message: "" });
    } catch (err: any) {
      setSendError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const role = (user as any)?.role;
  const dashboardHref = role === "staff" || role === "admin" ? "/staff/dashboard" : "/dashboard";

  useEffect(() => {
    if (!isStandaloneDisplay() || userLoading) return;
    if (user) {
      window.location.replace(dashboardHref);
      return;
    }
    window.location.replace("/auth");
  }, [dashboardHref, user, userLoading]);

  return (
    <div className="relative min-h-screen bg-secondary">
      <div className="fixed inset-0 z-0">
        <img
          src="/assets/hero-port.png"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/95 via-secondary/82 to-secondary/70" />
      </div>

      <div className="relative z-10">
        <Navbar />

        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-20 sm:px-6">
          <div className="relative z-10 mx-auto max-w-4xl px-1 pt-12 text-center sm:px-6 sm:pt-16">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              onMouseMove={setReactiveGlowTarget}
              className="hero-reactive-panel rounded-[28px] border border-white/15 bg-secondary/72 px-4 py-8 shadow-2xl backdrop-blur-md glow-card glow-card--reactive sm:px-10 md:px-14"
            >
              <img
                src={fullLogoUrl}
                alt="InterFreight Solutions"
                className="logo-soft-glow mx-auto mb-5 h-16 w-auto object-contain sm:h-20 md:h-24"
              />
              <p className="text-primary font-semibold tracking-[0.2em] uppercase text-sm mb-5">
                Malawi
              </p>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/60 sm:text-base sm:tracking-[0.3em]">
                Shipping made simple
              </p>
              <h1 className="mb-5 text-[2.6rem] font-extrabold leading-[1.02] text-white sm:text-5xl md:text-7xl">
                Moving Africa{" "}
                <span className="text-primary">Forward</span>
              </h1>
              <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/72 sm:text-xl md:text-2xl">
                Established in Blantyre, Malawi, with freight forwarding, customs clearance,
                and cargo handling across key regional corridors.
              </p>

              <div className="flex flex-col items-center justify-center gap-3">
                <div className="flex w-full flex-col justify-center gap-3 sm:flex-row sm:gap-4">
                  <motion.a
                    href="/#services"
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="reactive-button group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-base font-bold text-white shadow-xl transition-all hover:bg-primary/90 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
                  >
                    Our Services
                    <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </motion.a>
                  <motion.a
                    href="/#contact"
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="reactive-button reactive-button--white inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-6 py-3.5 text-base font-semibold text-white transition-all backdrop-blur-sm hover:bg-white/20 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
                  >
                    Contact Us
                  </motion.a>
                  {role === "customer" && (
                    <Link
                      href="/dashboard"
                      className="reactive-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-bold text-secondary shadow-xl transition-all hover:bg-white/90 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
                    >
                      <MapPin size={20} />
                      My Tracking
                    </Link>
                  )}
                  {(role === "staff" || role === "admin") && (
                    <Link
                      href="/staff/dashboard"
                      className="reactive-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-bold text-secondary shadow-xl transition-all hover:bg-white/90 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
                    >
                      <LayoutDashboard size={20} />
                      Staff / Admin Dashboard
                    </Link>
                  )}
                </div>

                <Link
                  href="/app-install"
                  className="reactive-button reactive-button--white inline-flex items-center justify-center gap-2 rounded-lg border border-white/45 bg-primary/12 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-primary/18"
                >
                  <Download size={16} />
                  Download Our App
                </Link>
              </div>

              {(!role || role === "customer") && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="mx-auto mt-8 max-w-lg"
                >
                  <div
                    onMouseMove={setReactiveGlowTarget}
                    className="relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl glow-card glow-card--reactive"
                    style={{ background: "linear-gradient(135deg, rgba(17,19,21,0.92) 0%, rgba(30,8,8,0.88) 100%)", backdropFilter: "blur(12px)" }}
                  >
                    <div className="h-0.5 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

                    <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
                      <div className="w-11 h-11 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                        <Search size={20} className="text-primary" />
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-white font-bold text-base leading-tight">Track Your Shipment</p>
                        <p className="text-white/50 text-sm mt-0.5">
                          {role === "customer"
                            ? "Go to your dashboard to view all containers"
                            : "Log in to your account to view your containers"}
                        </p>
                      </div>

                      {role === "customer" ? (
                        <Link
                          href="/dashboard"
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-primary/90 sm:w-auto sm:shrink-0"
                        >
                          <LogIn size={14} /> My Dashboard
                        </Link>
                      ) : (
                        <Link
                          href="/auth"
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-primary/90 sm:w-auto sm:shrink-0"
                        >
                          <LogIn size={14} /> Log In {"->"}
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 opacity-50">
            <div className="w-px h-10 bg-white animate-pulse" />
            <span className="text-white text-xs tracking-widest uppercase">Scroll</span>
          </div>
        </section>

        <section id="services" className="py-24 scroll-mt-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div onMouseMove={setReactiveGlowTarget} className="text-center mb-16 rounded-3xl border border-white/15 bg-white/90 px-6 py-10 shadow-xl backdrop-blur-md glow-card glow-card--reactive glow-card--light">
              <p className="text-primary font-semibold tracking-widest uppercase text-sm mb-3">
                What We Do
              </p>
              <h2 className="text-4xl md:text-5xl font-extrabold text-secondary mb-4">
                Our Services
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                End-to-end logistics tailored for businesses importing and exporting across Africa.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {services.map(({ icon: Icon, title, desc }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  whileHover={{ y: -6 }}
                  onMouseMove={setReactiveGlowTarget}
                  className="bg-white border border-border rounded-2xl p-7 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group glow-card glow-card--reactive glow-card--light"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                    <Icon className="text-primary" size={24} />
                  </div>
                  <h3 className="font-bold text-secondary text-lg mb-2">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div onMouseMove={setReactiveGlowTarget} className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center rounded-3xl border border-white/15 bg-secondary/80 px-6 py-10 shadow-xl backdrop-blur-md glow-card glow-card--reactive">
              {stats.map(({ value, label }, i) => (
                <AnimatedStat key={label} value={value} label={label} index={i} />
              ))}
            </div>
          </div>
        </section>

        <WorldMapNetwork />

        <section className="py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div onMouseMove={setReactiveGlowTarget} className="rounded-3xl border border-white/15 bg-white/90 p-8 shadow-xl backdrop-blur-md glow-card glow-card--reactive glow-card--light">
                <p className="text-primary font-semibold tracking-widest uppercase text-sm mb-3">
                  Why InterFreight
                </p>
                <h2 className="text-4xl md:text-5xl font-extrabold text-secondary mb-6 leading-tight">
                  The partner your cargo deserves
                </h2>
                <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                  Inter Freight Solutions was established in 2020 in Malawi, based in the commercial
                  city of Blantyre. Our team supports cargo through key Malawi border points including
                  Mwanza, Songwe, Mchinji, Dedza, Muloza, Chiponde, and Marka in Nsanje.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 mb-8">
                  <div onMouseMove={setReactiveGlowTarget} className="rounded-2xl border border-border bg-background/70 p-4 glow-card glow-card--reactive glow-card--light">
                    <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Vision</p>
                    <p className="text-secondary text-sm font-semibold leading-relaxed">
                      To earn client confidence through honesty, integrity, and dependable service.
                    </p>
                  </div>
                  <div onMouseMove={setReactiveGlowTarget} className="rounded-2xl border border-border bg-background/70 p-4 glow-card glow-card--reactive glow-card--light">
                    <p className="text-primary text-xs font-bold uppercase tracking-widest mb-2">Mission</p>
                    <p className="text-secondary text-sm font-semibold leading-relaxed">
                      To provide complete logistics solutions that are efficient, reliable, and affordable.
                    </p>
                  </div>
                </div>
                <a
                  href="/#contact"
                  className="inline-flex items-center gap-2 text-primary font-semibold hover:gap-3 transition-all"
                >
                  Get in touch <ArrowRight size={18} />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {features.map(({ icon: Icon, title, desc }, i) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    whileHover={{ y: -5, scale: 1.01 }}
                    onMouseMove={setReactiveGlowTarget}
                    className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all glow-card glow-card--reactive glow-card--light"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                        <Icon className="text-primary" size={18} />
                      </div>
                      <h4 className="font-bold text-secondary text-sm">{title}</h4>
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-10 overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div onMouseMove={setReactiveGlowTarget} className="relative min-h-[500px] flex flex-col lg:flex-row items-stretch overflow-hidden rounded-3xl border border-white/15 shadow-2xl backdrop-blur-md glow-card glow-card--reactive">
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55 }}
                className="w-full lg:w-1/2 relative min-h-[280px] sm:min-h-[380px] lg:min-h-[500px] bg-[#111315]"
              >
                <img
                  src={consolidationImg}
                  alt="Weekly Consolidation South Africa to Malawi"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-secondary/10" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: 0.08 }}
                className="w-full lg:w-1/2 bg-secondary/90 flex items-center"
              >
                <div className="px-10 py-16 lg:px-16 max-w-xl">
                  <p className="text-primary font-semibold tracking-[0.2em] uppercase text-sm mb-4">
                    Featured Service
                  </p>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-6">
                    Weekly Consolidation
                  </h2>

                  <div onMouseMove={setReactiveGlowTarget} className="flex items-center gap-4 bg-white/10 border border-white/20 rounded-xl px-5 py-4 mb-8 w-fit glow-card glow-card--reactive">
                    <span className="text-3xl" role="img" aria-label="South Africa">ZA</span>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Weekly</span>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-px bg-primary" />
                        <ChevronRight className="text-primary" size={16} />
                        <div className="w-8 h-px bg-primary" />
                      </div>
                    </div>
                    <span className="text-3xl" role="img" aria-label="Malawi">MW</span>
                  </div>

                  <p className="text-white/70 text-lg leading-relaxed mb-8">
                    <span className="text-white font-semibold">South Africa to Malawi.</span>{" "}
                    We run weekly consolidation services so your cargo never waits long. Share a container, pay only for the space you need - ideal for importers of all sizes.
                  </p>

                  <ul className="space-y-3 mb-10">
                    {[
                      "Palletised & loose cargo accepted",
                      "Door-to-door delivery available",
                      "Full customs clearance included",
                      "Competitive per-CBM / per-kg rates",
                    ].map((point) => (
                      <li key={point} className="flex items-center gap-3 text-white/80 text-sm">
                        <CheckCircle2 className="text-primary shrink-0" size={17} />
                        {point}
                      </li>
                    ))}
                  </ul>

                  <motion.a
                    href="/#contact"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="reactive-button inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-7 py-4 rounded-xl transition-all text-sm shadow-lg"
                  >
                    Get a Quote <ArrowRight size={16} />
                  </motion.a>
                </div>
              </motion.div>
            </div>

            <div onMouseMove={setReactiveGlowTarget} className="relative h-64 overflow-hidden rounded-3xl border border-white/15 shadow-2xl mt-8 glow-card glow-card--reactive">
              <img
                src={warehouseImg}
                alt="InterFreight warehouse"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-secondary/70 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-white/60 text-sm font-semibold uppercase tracking-[0.2em] mb-2">Trusted Across the Region</p>
                  <p className="text-white text-3xl md:text-4xl font-extrabold">
                    Your cargo. Our commitment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {(role === "staff" || role === "admin") && <StaffTracker />}

        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <div onMouseMove={setReactiveGlowTarget} className="bg-secondary/90 border border-white/15 rounded-2xl px-8 py-10 flex flex-col md:flex-row items-center gap-8 shadow-xl backdrop-blur-md glow-card glow-card--reactive">
                <div className="flex-1 text-center md:text-left">
                  <p className="text-primary font-semibold tracking-widest uppercase text-xs mb-2">
                    Client Portal
                  </p>
                  <h3 className="text-2xl font-extrabold text-white mb-2">
                    Are you a registered client?
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Log in or create an account to access your company's full shipment reports,
                    statuses, and live tracking - all in one place.
                  </p>
                </div>
                <div className="shrink-0 flex flex-col gap-3 w-full md:w-auto">
                  {user ? (
                    <>
                      <Link
                        href={dashboardHref}
                        className="reactive-button inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-7 py-3.5 rounded-lg transition-all text-sm whitespace-nowrap shadow-lg"
                      >
                        <LayoutDashboard size={16} />
                        Go to My Dashboard
                      </Link>
                      <button
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                        className="reactive-button reactive-button--white inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3 rounded-lg transition-all text-sm"
                      >
                        <LogOut size={15} />
                        Sign Out
                      </button>
                      <Link
                        href="/app-install"
                        className="reactive-button reactive-button--white inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3 rounded-lg transition-all text-sm"
                      >
                        <Download size={15} />
                        Download Our App
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/auth"
                        className="reactive-button inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-7 py-3.5 rounded-lg transition-all text-sm whitespace-nowrap shadow-lg"
                      >
                        <LogIn size={16} />
                        Log In / Sign Up
                      </Link>
                      <p className="text-white/40 text-xs text-center">
                        Registered companies only
                      </p>
                      <Link
                        href="/app-install"
                        className="reactive-button reactive-button--white inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3 rounded-lg transition-all text-sm"
                      >
                        <Download size={15} />
                        Download Our App
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="py-24 scroll-mt-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div onMouseMove={setReactiveGlowTarget} className="text-center mb-14 rounded-3xl border border-white/15 bg-white/90 px-6 py-10 shadow-xl backdrop-blur-md glow-card glow-card--reactive glow-card--light">
              <p className="text-primary font-semibold tracking-widest uppercase text-sm mb-3">
                Get In Touch
              </p>
              <h2 className="text-4xl md:text-5xl font-extrabold text-secondary mb-4">
                Contact Us
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                Ready to move your cargo? Drop us a message and we'll get back to you.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto items-start">
              <div className="space-y-6">
                {[
                  {
                    icon: MapPin,
                    label: "Our Office",
                    value: "Blantyre, Malawi",
                    sub: "Head Office",
                  },
                  {
                    icon: Phone,
                    label: "Call Us",
                    value: "+265 997 991 991",
                    sub: "+265 888 991 991  |  Mon-Fri 8am-5pm",
                  },
                  {
                    icon: Mail,
                    label: "Email Us",
                    value: "info@interfreightsolutions.com",
                    sub: "We reply within 24hrs",
                  },
                ].map(({ icon: Icon, label, value, sub }) => (
                  <div key={label} onMouseMove={setReactiveGlowTarget} className="bg-white border border-border rounded-2xl p-6 shadow-sm flex items-start gap-4 glow-card glow-card--reactive glow-card--light">
                    <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <Icon className="text-primary" size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                        {label}
                      </p>
                      <p className="font-bold text-secondary">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div onMouseMove={setReactiveGlowTarget} className="bg-white border border-border rounded-2xl p-8 shadow-sm glow-card glow-card--reactive glow-card--light">
                {sent ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="text-green-600 mb-4" size={48} />
                    <h3 className="text-xl font-bold text-secondary mb-2">Message Sent!</h3>
                    <p className="text-muted-foreground text-sm mb-6">
                      Thank you for reaching out. We'll get back to you within 24 hours.
                    </p>
                    <button
                      onClick={() => setSent(false)}
                      className="text-primary font-semibold text-sm hover:underline"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="space-y-5">
                    <h3 className="text-xl font-bold text-secondary mb-6">Contact Us / Feedback</h3>

                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Your Name <span className="text-primary">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Grace Banda"
                        className="w-full px-4 py-3 rounded-xl border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm bg-background"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Email Address <span className="text-primary">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="grace@example.com"
                        className="w-full px-4 py-3 rounded-xl border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm bg-background"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                        placeholder="e.g. InterFreight Solutions"
                        className="w-full px-4 py-3 rounded-xl border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm bg-background"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Message <span className="text-primary">*</span>
                      </label>
                      <textarea
                        required
                        rows={5}
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        placeholder="Tell us about your cargo, route, or any questions..."
                        className="w-full px-4 py-3 rounded-xl border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm bg-background resize-none"
                      />
                    </div>

                    {sendError && (
                      <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-4 py-3">
                        <AlertCircle size={16} className="shrink-0" />
                        {sendError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={sending}
                      className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all text-sm disabled:opacity-60 shadow-lg"
                    >
                      <Send size={16} />
                      {sending ? "Sending..." : "Send Message"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  );
}

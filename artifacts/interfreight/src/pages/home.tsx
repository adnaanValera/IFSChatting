import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck, Ship, Plane, Warehouse, ShieldCheck, Clock, Globe, Award,
  ChevronRight, LogIn, LayoutDashboard, LogOut, ArrowRight,
  Phone, Mail, MapPin, Send, CheckCircle2, AlertCircle,
  Search, Building2, SearchX, Loader2, X,
  TrainFront,
} from "lucide-react";
import { ShipmentCard } from "@/components/ui/shipment-card";
import consolidationImg from "@assets/WhatsApp_Image_2026-06-30_at_13.47.05_1783091673424.jpeg";
import warehouseImg from "@assets/WhatsApp_Image_2026-06-30_at_13.47.25_1783091673421.jpeg";
import { Link } from "wouter";
import { useGetMe, useStaffLogout, useListShipments } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { StatusBadge } from "@/components/ui/status-badge";
import logoUrl from "@assets/Inter_freight_logo_nobg.png";

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
    desc: "Secure bonded warehousing in Blantyre plus full MRA customs clearance — declarations, duties, and compliance handled end-to-end.",
  },
];

const stats = [
  { value: "500+", label: "Shipments Handled" },
  { value: "10+", label: "Years Experience" },
  { value: "15+", label: "Regional Partners" },
  { value: "99%", label: "On-Time Delivery" },
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
    desc: "We prioritise speed at every step — from port arrival to final-mile delivery.",
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

function AnimatedStat({ value, label, index }: { value: string; label: string; index: number }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const numericValue = Number.parseInt(value.replace(/\D/g, ""), 10) || 0;
  const suffix = value.replace(/[0-9]/g, "");

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    const totalFrames = 34;
    const timer = window.setInterval(() => {
      frame += 1;
      const progress = 1 - Math.pow(1 - frame / totalFrames, 3);
      setCount(Math.round(numericValue * progress));
      if (frame >= totalFrames) window.clearInterval(timer);
    }, 28);

    return () => window.clearInterval(timer);
  }, [numericValue, started]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      onViewportEnter={() => setStarted(true)}
      transition={{ delay: index * 0.1, duration: 0.35 }}
    >
      <p className="text-4xl md:text-5xl font-extrabold text-primary mb-2">
        {count}{suffix}
      </p>
      <p className="text-white/60 text-sm font-medium uppercase tracking-wider">{label}</p>
    </motion.div>
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

        <div className="bg-white rounded-2xl shadow-lg border border-border p-5 mb-8">
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
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p>Searching...</p>
          </div>
        ) : shipments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-border p-14 flex flex-col items-center text-center shadow-sm"
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
                Showing {shipments.length} of {data?.total} — refine your search to narrow results
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
  const { data: user } = useGetMe();
  const logoutMutation = useStaffLogout();

  // Contact form state
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
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

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto pt-16">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl border border-white/15 bg-secondary/70 px-6 py-10 shadow-2xl backdrop-blur-md sm:px-10 md:px-14"
          >
            <p className="text-primary font-semibold tracking-[0.2em] uppercase text-sm mb-5">
              InterFreight Solutions — Malawi
            </p>
            <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-[1.08] mb-6">
              Moving Africa{" "}
              <span className="text-primary">Forward</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
              Premium logistics, freight forwarding, and customs clearance.
              Seamless connectivity across Southern and East Africa.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.a
                href="/#services"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-8 py-4 rounded-lg shadow-xl text-lg transition-all group"
              >
                Our Services
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </motion.a>
              <motion.a
                href="/#contact"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold px-8 py-4 rounded-lg transition-all backdrop-blur-sm text-lg"
              >
                Contact Us
              </motion.a>
              {role === "customer" && (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 bg-white hover:bg-white/90 text-secondary font-bold px-8 py-4 rounded-lg shadow-xl text-lg transition-all"
                >
                  <MapPin size={20} />
                  My Tracking
                </Link>
              )}
              {(role === "staff" || role === "admin") && (
                <Link
                  href="/staff/dashboard"
                  className="inline-flex items-center justify-center gap-2 bg-white hover:bg-white/90 text-secondary font-bold px-8 py-4 rounded-lg shadow-xl text-lg transition-all"
                >
                  <LayoutDashboard size={20} />
                  Staff / Admin Dashboard
                </Link>
              )}
            </div>

            {/* ── Tracking login prompt — visible to guests & logged-in clients ── */}
            {(!role || role === "customer") && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-10 max-w-lg mx-auto"
              >
                <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
                  style={{ background: "linear-gradient(135deg, rgba(17,19,21,0.92) 0%, rgba(30,8,8,0.88) 100%)", backdropFilter: "blur(12px)" }}
                >
                  {/* Red top accent line */}
                  <div className="h-0.5 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

                  <div className="flex items-center gap-4 px-6 py-5">
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                      <Search size={20} className="text-primary" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-white font-bold text-base leading-tight">Track Your Shipment</p>
                      <p className="text-white/50 text-sm mt-0.5">
                        {role === "customer"
                          ? "Go to your dashboard to view all containers"
                          : "Log in to your account to view your containers"}
                      </p>
                    </div>

                    {/* CTA button */}
                    {role === "customer" ? (
                      <Link
                        href="/dashboard"
                        className="shrink-0 bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-lg"
                      >
                        <LogIn size={14} /> My Dashboard
                      </Link>
                    ) : (
                      <Link
                        href="/auth"
                        className="shrink-0 bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-lg"
                      >
                        <LogIn size={14} /> Log In →
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 opacity-50">
          <div className="w-px h-10 bg-white animate-pulse" />
          <span className="text-white text-xs tracking-widest uppercase">Scroll</span>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────── */}
      <section id="services" className="py-24 scroll-mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 rounded-3xl border border-white/15 bg-white/90 px-6 py-10 shadow-xl backdrop-blur-md">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {services.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                whileHover={{ y: -6 }}
                className="bg-white border border-border rounded-2xl p-7 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
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

      {/* ── Stats (dark band) ─────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center rounded-3xl border border-white/15 bg-secondary/80 px-6 py-10 shadow-xl backdrop-blur-md">
            {stats.map(({ value, label }, i) => (
              <AnimatedStat key={label} value={value} label={label} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Choose Us ────────────────────────────────── */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="rounded-3xl border border-white/15 bg-white/90 p-8 shadow-xl backdrop-blur-md">
              <p className="text-primary font-semibold tracking-widest uppercase text-sm mb-3">
                Why InterFreight
              </p>
              <h2 className="text-4xl md:text-5xl font-extrabold text-secondary mb-6 leading-tight">
                The partner your cargo deserves
              </h2>
              <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                With over a decade of experience moving goods across the region, we combine local
                knowledge with international standards — so your supply chain never skips a beat.
              </p>
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
                  className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all"
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

      {/* ── Weekly Consolidation ─────────────────────────── */}
      <section className="py-10 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative min-h-[500px] flex flex-col lg:flex-row items-stretch overflow-hidden rounded-3xl border border-white/15 shadow-2xl backdrop-blur-md">
          {/* Photo side */}
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

          {/* Content side */}
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

              {/* Route banner */}
              <div className="flex items-center gap-4 bg-white/10 border border-white/20 rounded-xl px-5 py-4 mb-8 w-fit">
                <span className="text-3xl" role="img" aria-label="South Africa">🇿🇦</span>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Weekly</span>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-px bg-primary" />
                    <ChevronRight className="text-primary" size={16} />
                    <div className="w-8 h-px bg-primary" />
                  </div>
                </div>
                <span className="text-3xl" role="img" aria-label="Malawi">🇲🇼</span>
              </div>

              <p className="text-white/70 text-lg leading-relaxed mb-8">
                <span className="text-white font-semibold">South Africa → Malawi.</span>{" "}
                We run weekly consolidation services so your cargo never waits long. Share a container, pay only for the space you need — ideal for importers of all sizes.
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
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-7 py-4 rounded-xl transition-all text-sm"
              >
                Get a Quote <ArrowRight size={16} />
              </motion.a>
            </div>
          </motion.div>
        </div>

        {/* Second row — warehouse image full width strip */}
        <div className="relative h-64 overflow-hidden rounded-3xl border border-white/15 shadow-2xl mt-8">
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

      {/* ── Staff Tracking (staff + admin only) ──────────── */}
      {(role === "staff" || role === "admin") && <StaffTracker />}

      {/* ── Client Portal ────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-secondary/90 border border-white/15 rounded-2xl px-8 py-10 flex flex-col md:flex-row items-center gap-8 shadow-xl backdrop-blur-md">
              <div className="flex-1 text-center md:text-left">
                <p className="text-primary font-semibold tracking-widest uppercase text-xs mb-2">
                  Client Portal
                </p>
                <h3 className="text-2xl font-extrabold text-white mb-2">
                  Are you a registered client?
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Log in or create an account to access your company's full shipment reports,
                  statuses, and documents — all in one place.
                </p>
              </div>
              <div className="shrink-0 flex flex-col gap-3 w-full md:w-auto">
                {user ? (
                  <>
                    <Link
                      href={dashboardHref}
                      className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-7 py-3.5 rounded-lg transition-all text-sm whitespace-nowrap"
                    >
                      <LayoutDashboard size={16} />
                      Go to My Dashboard
                    </Link>
                    <button
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending}
                      className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3 rounded-lg transition-all text-sm"
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth"
                      className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-7 py-3.5 rounded-lg transition-all text-sm whitespace-nowrap"
                    >
                      <LogIn size={16} />
                      Log In / Sign Up
                    </Link>
                    <p className="text-white/40 text-xs text-center">
                      Registered companies only
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────── */}
      <section id="contact" className="py-24 scroll-mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 rounded-3xl border border-white/15 bg-white/90 px-6 py-10 shadow-xl backdrop-blur-md">
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
            {/* Contact info */}
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
                  sub: "+265 888 991 991  ·  Mon–Fri 8am–5pm",
                },
                {
                  icon: Mail,
                  label: "Email Us",
                  value: "info@interfreightsolutions.com",
                  sub: "We reply within 24hrs",
                },
              ].map(({ icon: Icon, label, value, sub }) => (
                <div key={label} className="bg-white border border-border rounded-2xl p-6 shadow-sm flex items-start gap-4">
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

            {/* Contact form */}
            <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
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
                    className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all text-sm disabled:opacity-60"
                  >
                    <Send size={16} />
                    {sending ? "Sending…" : "Send Message"}
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

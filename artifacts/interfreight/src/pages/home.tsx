import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Truck, Ship, Plane, Warehouse, ShieldCheck, Clock, Globe, Award,
  ChevronRight, LogIn, LayoutDashboard, LogOut, ArrowRight,
  Phone, Mail, MapPin, Send, CheckCircle2, AlertCircle,
  Search, Building2, SearchX, X, TrainFront, Boxes, ClipboardCheck,
} from "lucide-react";
import { ShipmentCard } from "@/components/ui/shipment-card";
import { Spinner } from "@/components/ui/spinner";
import consolidationImg from "@assets/WhatsApp_Image_2026-06-30_at_13.47.05_1783091673424.jpeg";
import warehouseImg from "@assets/WhatsApp_Image_2026-06-30_at_13.47.25_1783091673421.jpeg";
import { Link } from "wouter";
import { useGetMe, useStaffLogout, useListShipments } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const services = [
  {
    icon: Truck,
    title: "Road Freight",
    desc: "Reliable road freight across Malawi and the region with dedicated movements, shared loads, and tight delivery coordination.",
  },
  {
    icon: Ship,
    title: "Ocean Freight",
    desc: "FCL and LCL shipping through Beira, Dar es Salaam, Durban, and other major corridors with strong visibility and handling.",
  },
  {
    icon: Plane,
    title: "Air Freight",
    desc: "Time-critical and high-value cargo moved through scheduled and charter solutions with speed, control, and secure handling.",
  },
  {
    icon: TrainFront,
    title: "Rail Freight",
    desc: "Efficient rail options for bulk cargo and corridor-led freight where cost control matters without losing reliability.",
  },
  {
    icon: Warehouse,
    title: "Warehousing & Customs",
    desc: "Secure warehousing plus end-to-end customs support, declarations, duties, and compliance across Malawi entry points.",
  },
  {
    icon: ClipboardCheck,
    title: "Import & Export Advisory",
    desc: "Hands-on support for documentation, shipment planning, and the practical decisions that keep cargo moving smoothly.",
  },
  {
    icon: Boxes,
    title: "Packaging & Palletization",
    desc: "Professional cargo preparation, palletization, and handling support for safer movement of valuable shipments.",
  },
];

const metrics = [
  { value: 2020, suffix: "", label: "Established" },
  { value: 7, suffix: "+", label: "Malawi border points supported" },
  { value: 3, suffix: "", label: "Primary freight modes" },
  { value: 24, suffix: "h", label: "Typical client response window" },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Licensed & Compliant",
    desc: "MRA-registered clearing support with disciplined documentation and process control.",
  },
  {
    icon: Clock,
    title: "Fast Turnaround",
    desc: "A bias toward speed where it counts, without losing visibility or detail.",
  },
  {
    icon: Globe,
    title: "Regional Coverage",
    desc: "Corridors into Malawi from Southern and East African trade routes.",
  },
  {
    icon: Award,
    title: "Account Ownership",
    desc: "Clients deal with a team that knows their cargo, priorities, and deadlines.",
  },
];

const corridors = [
  {
    mode: "AIR",
    color: "#A31E2C",
    origin: "Johannesburg",
    destination: "Lilongwe",
    notes: "High-priority cargo",
    path: "M180 160 C290 70, 430 70, 570 145",
    dotDelay: 0,
  },
  {
    mode: "SEA",
    color: "#A7ADB5",
    origin: "Durban",
    destination: "Blantyre",
    notes: "FCL / LCL visibility",
    path: "M205 300 C305 345, 390 340, 515 245",
    dotDelay: 0.7,
  },
  {
    mode: "ROAD",
    color: "#F8F8F6",
    origin: "Beira",
    destination: "Mchinji",
    notes: "Cross-border movements",
    path: "M470 250 C540 220, 605 180, 660 155",
    dotDelay: 1.2,
  },
];

function RouteDivider() {
  return (
    <div className="relative h-12 overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-white/8" />
      <motion.div
        aria-hidden="true"
        className="absolute left-[-20%] top-1/2 h-px w-[40%] -translate-y-1/2 bg-gradient-to-r from-transparent via-primary to-transparent"
        animate={{ x: ["0%", "310%"] }}
        transition={{ duration: 4.6, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function useCountUp(target: number, start = true) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let frame = 0;
    const started = performance.now();
    const duration = 1100;

    const tick = (now: number) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, target]);

  return value;
}

function CounterCard({ value, suffix, label, index }: { value: number; suffix: string; label: string; index: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const display = useCountUp(value, visible);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      className="premium-card p-6"
    >
      <p className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
        {display}
        {suffix}
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.28em] text-metal">{label}</p>
    </motion.div>
  );
}

function WorldMapNetwork() {
  return (
    <div className="premium-card relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(163,30,44,0.18),_transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
      <div className="relative z-10 flex flex-col gap-6">
        <div className="max-w-2xl">
          <p className="eyebrow">Network Visibility</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-extrabold text-white">A calmer way to move valuable cargo</h2>
          <p className="mt-4 text-base md:text-lg text-white/62 leading-relaxed">
            Air, sea, and road flows visualised in one premium view. Built to feel deliberate, dependable, and easy to trust.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] items-start">
          <div className="relative rounded-[28px] border border-white/10 bg-black/20 p-4 sm:p-6 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
            <svg viewBox="0 0 820 420" className="w-full h-auto">
              <defs>
                <linearGradient id="map-fade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(248,248,246,0.12)" />
                  <stop offset="100%" stopColor="rgba(248,248,246,0.04)" />
                </linearGradient>
                <filter id="redGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <g fill="none" stroke="url(#map-fade)" strokeWidth="1">
                <path d="M72 138 C118 86, 193 72, 252 98 C304 120, 332 118, 386 92 C448 62, 525 65, 588 102 C646 136, 708 154, 750 147" />
                <path d="M110 249 C165 223, 243 218, 311 240 C363 258, 412 255, 462 228 C538 186, 635 176, 710 204" />
                <path d="M194 327 C255 304, 325 300, 382 315 C445 332, 516 335, 582 308 C635 287, 682 278, 726 285" />
                <path d="M186 118 C178 170, 182 237, 201 310" />
                <path d="M422 86 C418 150, 428 232, 449 307" />
                <path d="M626 112 C620 172, 628 230, 644 286" />
              </g>

              {corridors.map((route) => (
                <g key={route.mode}>
                  <path d={route.path} fill="none" stroke={route.color} strokeOpacity="0.24" strokeWidth="2" strokeDasharray="7 11" />
                  <motion.path
                    d={route.path}
                    fill="none"
                    stroke={route.color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    filter={route.mode === "AIR" ? "url(#redGlow)" : undefined}
                    strokeDasharray="18 220"
                    animate={{ strokeDashoffset: [0, -238] }}
                    transition={{ duration: 3.4, repeat: Infinity, ease: "linear", delay: route.dotDelay }}
                  />
                </g>
              ))}

              {[
                { x: 180, y: 160, name: "Johannesburg" },
                { x: 515, y: 245, name: "Blantyre" },
                { x: 470, y: 250, name: "Beira" },
                { x: 660, y: 155, name: "Mchinji" },
                { x: 570, y: 145, name: "Lilongwe" },
                { x: 205, y: 300, name: "Durban" },
              ].map((point) => (
                <g key={point.name}>
                  <circle cx={point.x} cy={point.y} r="4.5" fill="#F8F8F6" />
                  <circle cx={point.x} cy={point.y} r="10" fill="none" stroke="rgba(248,248,246,0.15)" />
                  <text x={point.x + 12} y={point.y - 10} fill="#A7ADB5" fontSize="12" fontWeight="700">
                    {point.name}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="space-y-4">
            {corridors.map((route, index) => (
              <motion.div
                key={route.mode}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.3 }}
                className="premium-card p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="eyebrow" style={{ color: route.color }}>{route.mode}</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <p className="mt-3 text-lg font-bold text-white">{route.origin} to {route.destination}</p>
                <p className="mt-2 text-sm text-white/58">{route.notes}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
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
    }, 350);
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <div className="premium-card p-6 sm:p-8">
          <div className="max-w-2xl">
            <p className="eyebrow">Internal Access</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold text-white">Company shipment lookup</h2>
            <p className="mt-3 text-white/60">
              Search any company name and review matching consignments instantly.
            </p>
          </div>

          <div className="mt-8 premium-panel p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-metal pointer-events-none" size={18} />
              <input
                ref={inputRef}
                type="text"
                placeholder='e.g. "Atomic Hardware" or "Shire Ltd"'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-transparent py-4 pl-11 pr-10 text-sm text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/45 focus:shadow-[0_0_0_1px_rgba(163,30,44,0.36)]"
              />
              {input && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white transition-colors"
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {!hasSearched ? (
            <div className="py-16 text-center text-white/54">
              <Building2 className="mx-auto mb-4 h-14 w-14 opacity-20" />
              <p className="text-lg font-medium text-white/72">Enter a company name above</p>
              <p className="mt-1 text-sm">Matching consignments will appear below.</p>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/54">
              <Spinner className="mb-4 w-12 h-12" />
              <p>Searching...</p>
            </div>
          ) : shipments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="premium-panel mt-8 p-12 text-center"
            >
              <SearchX className="mx-auto mb-4 h-14 w-14 text-white/28" />
              <h3 className="text-xl font-bold text-white">No containers found</h3>
              <p className="mt-2 text-sm text-white/52">
                No shipments match <span className="font-semibold text-white">"{search}"</span>.
              </p>
            </motion.div>
          ) : (
            <div className="mt-8 space-y-5">
              <p className="text-sm text-white/56">
                <span className="font-semibold text-white">{data?.total ?? shipments.length}</span> container{(data?.total ?? shipments.length) !== 1 ? "s" : ""} found
              </p>
              {shipments.map((shipment, index) => (
                <ShipmentCard key={shipment.id} shipment={shipment} index={index} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
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
  const loggedInCta = useMemo(() => {
    if (role === "customer") {
      return {
        href: "/dashboard",
        icon: MapPin,
        label: "Open My Tracking",
      };
    }
    if (role === "staff" || role === "admin") {
      return {
        href: "/staff/dashboard",
        icon: LayoutDashboard,
        label: "Open Staff Dashboard",
      };
    }
    return null;
  }, [role]);
  const LoggedInCtaIcon = loggedInCta?.icon;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#121417] text-[#F8F8F6]">
      <div className="fixed inset-0 z-0">
        <img src="/assets/hero-port.png" alt="" aria-hidden="true" className="h-full w-full object-cover scale-[1.02]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,20,23,0.96)_0%,rgba(18,20,23,0.88)_38%,rgba(18,20,23,0.95)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(167,173,181,0.10),transparent_30%),radial-gradient(circle_at_18%_18%,rgba(163,30,44,0.14),transparent_24%)]" />
      </div>

      <div className="relative z-10">
        <Navbar />

        <section className="relative flex min-h-screen items-center overflow-hidden pt-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
              <motion.div
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
                className="space-y-8"
              >
                <div className="premium-card p-7 sm:p-10">
                  <p className="eyebrow">InterFreight Solutions | Malawi</p>
                  <h1 className="mt-4 max-w-4xl text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.03]">
                    Shipping made simple
                  </h1>
                  <p className="mt-5 max-w-2xl text-lg sm:text-xl text-white/66 leading-relaxed">
                    Premium logistics, customs clearance, and freight coordination designed to feel calm, precise, and trustworthy for valuable cargo.
                  </p>
                  <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                    <motion.a
                      href="/#services"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      className="premium-button inline-flex items-center justify-center gap-2 rounded-xl px-7 py-4 font-bold text-white"
                    >
                      Explore Services
                      <ChevronRight size={18} />
                    </motion.a>
                    {loggedInCta && LoggedInCtaIcon ? (
                      <Link
                        href={loggedInCta.href}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white/88 transition-all hover:bg-white/[0.08]"
                      >
                        <LoggedInCtaIcon size={18} />
                        {loggedInCta.label}
                      </Link>
                    ) : (
                      <Link
                        href="/auth"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white/88 transition-all hover:bg-white/[0.08]"
                      >
                        <LogIn size={18} />
                        Client Login
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    "Air, sea, and road coordination",
                    "Disciplined customs handling",
                    "Visibility clients can trust",
                  ].map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.06, duration: 0.3 }}
                      className="premium-panel px-5 py-4 text-sm text-white/72"
                    >
                      {item}
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.55, delay: 0.08 }}
                className="premium-card overflow-hidden p-4 sm:p-5"
              >
                <div className="relative overflow-hidden rounded-[26px] border border-white/10">
                  <img src={warehouseImg} alt="InterFreight warehouse" className="h-[440px] w-full object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,20,23,0.18),rgba(18,20,23,0.82))]" />
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                    <div className="premium-panel max-w-md p-5">
                      <p className="eyebrow">Private Terminal Standard</p>
                      <p className="mt-3 text-2xl font-extrabold text-white">High-value cargo deserves composed handling</p>
                      <p className="mt-3 text-sm leading-relaxed text-white/62">
                        Built for clients who want reliability, fast response, and a logistics partner that looks and behaves like it takes details seriously.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <RouteDivider />

        <section className="py-8 sm:py-14">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((item, index) => (
                <CounterCard key={item.label} {...item} index={index} />
              ))}
            </div>
          </div>
        </section>

        <RouteDivider />

        <section id="services" className="py-20 scroll-mt-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow justify-center">Core Services</p>
              <h2 className="mt-4 text-4xl md:text-5xl font-extrabold text-white">A premium logistics stack for serious cargo</h2>
              <p className="mt-4 text-lg text-white/60">
                Every service is presented with the same standard: disciplined execution, fast updates, and a clean client experience.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {services.map(({ icon: Icon, title, desc }, index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.06, duration: 0.32 }}
                  whileHover={{ y: -5 }}
                  className="premium-card group p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary shadow-[0_0_24px_rgba(163,30,44,0.12)] transition-all group-hover:shadow-[0_0_28px_rgba(163,30,44,0.22)]">
                    <Icon size={22} />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/58">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <RouteDivider />

        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <WorldMapNetwork />
          </div>
        </section>

        <RouteDivider />

        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-stretch">
              <div className="premium-card p-7 sm:p-10">
                <p className="eyebrow">Why InterFreight</p>
                <h2 className="mt-4 text-4xl md:text-5xl font-extrabold text-white leading-tight">
                  Trust is built in the small operational details
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-white/62">
                  Established in 2020 in Blantyre, our team supports cargo through key Malawi border points including Mwanza, Songwe, Mchinji, Dedza, Muloza, Chiponde, and Marka.
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="premium-panel p-5">
                    <p className="eyebrow">Vision</p>
                    <p className="mt-3 text-sm font-semibold leading-relaxed text-white/82">
                      Earn client confidence through honesty, integrity, and dependable service.
                    </p>
                  </div>
                  <div className="premium-panel p-5">
                    <p className="eyebrow">Mission</p>
                    <p className="mt-3 text-sm font-semibold leading-relaxed text-white/82">
                      Deliver complete logistics solutions that are efficient, reliable, and affordable.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {features.map(({ icon: Icon, title, desc }, index) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                    whileHover={{ y: -4 }}
                    className="premium-card p-6"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                        <Icon size={19} />
                      </div>
                      <h3 className="text-base font-bold text-white">{title}</h3>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-white/58">{desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <RouteDivider />

        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="premium-card overflow-hidden">
                <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
                  <div className="relative min-h-[320px]">
                    <img src={consolidationImg} alt="Weekly Consolidation" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/55" />
                  </div>
                  <div className="p-7 sm:p-10">
                    <p className="eyebrow">Featured Service</p>
                    <h2 className="mt-4 text-3xl md:text-4xl font-extrabold text-white">Weekly consolidation</h2>
                    <p className="mt-4 text-white/62 leading-relaxed">
                      South Africa to Malawi movements designed for importers who need dependable cadence without paying for unused full-container space.
                    </p>
                    <div className="mt-6 premium-panel flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.26em] text-metal">Route</p>
                        <p className="mt-2 text-lg font-bold text-white">South Africa to Malawi</p>
                      </div>
                      <motion.div
                        className="h-px flex-1 bg-gradient-to-r from-primary to-transparent"
                        animate={{ opacity: [0.45, 1, 0.45] }}
                        transition={{ duration: 1.9, repeat: Infinity }}
                      />
                    </div>
                    <ul className="mt-6 space-y-3">
                      {[
                        "Palletised and loose cargo accepted",
                        "Door-to-door delivery available",
                        "Customs clearance included",
                        "Strong visibility throughout movement",
                      ].map((point) => (
                        <li key={point} className="flex items-center gap-3 text-sm text-white/74">
                          <CheckCircle2 size={16} className="text-primary shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <a href="/#contact" className="premium-button mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-bold text-white">
                      Request a quote
                      <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
              </div>

              <div className="premium-card flex flex-col justify-between p-7 sm:p-10">
                <div>
                  <p className="eyebrow">Client Portal</p>
                  <h2 className="mt-4 text-3xl md:text-4xl font-extrabold text-white">A cleaner digital experience for your clients</h2>
                  <p className="mt-4 text-white/62 leading-relaxed">
                    Track consignments, review status cards, and download company reports in a controlled, professional portal.
                  </p>
                </div>
                <div className="mt-8 space-y-3">
                  {user ? (
                    <>
                      <Link href={dashboardHref} className="premium-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold text-white">
                        <LayoutDashboard size={17} />
                        Go to My Dashboard
                      </Link>
                      <button
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-6 py-4 font-semibold text-white/84 transition-all hover:bg-white/[0.08]"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/auth" className="premium-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold text-white">
                        <LogIn size={17} />
                        Log In / Sign Up
                      </Link>
                      <p className="text-center text-xs text-white/38">Registered companies only</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {(role === "staff" || role === "admin") && (
          <>
            <RouteDivider />
            <StaffTracker />
          </>
        )}

        <RouteDivider />

        <section id="contact" className="py-20 scroll-mt-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="premium-card p-7 sm:p-10">
                <p className="eyebrow">Get In Touch</p>
                <h2 className="mt-4 text-4xl md:text-5xl font-extrabold text-white">Move your cargo with more confidence</h2>
                <p className="mt-4 text-lg text-white/62 leading-relaxed">
                  Reach out for routing, clearance, freight, or advisory support. We keep the response process direct and professional.
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    { icon: MapPin, label: "Office", value: "Blantyre, Malawi", sub: "Head Office" },
                    { icon: Phone, label: "Phone", value: "+265 997 991 991", sub: "+265 888 991 991 | Mon-Fri 8am-5pm" },
                    { icon: Mail, label: "Email", value: "info@interfreightsolutions.com", sub: "We reply within 24 hours" },
                  ].map(({ icon: Icon, label, value, sub }) => (
                    <div key={label} className="premium-panel flex items-start gap-4 p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-metal">{label}</p>
                        <p className="mt-1 font-bold text-white">{value}</p>
                        <p className="mt-1 text-xs text-white/44">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="premium-card p-7 sm:p-10">
                {sent ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CheckCircle2 className="mb-4 text-primary" size={48} />
                    <h3 className="text-2xl font-bold text-white">Message sent</h3>
                    <p className="mt-3 max-w-md text-sm text-white/56">
                      Thank you for reaching out. We will get back to you as quickly as possible.
                    </p>
                    <button onClick={() => setSent(false)} className="mt-6 text-sm font-semibold text-primary hover:text-primary/80">
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">Your Name</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Grace Banda"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/40 focus:shadow-[0_0_0_1px_rgba(163,30,44,0.35)]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">Email Address</label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="grace@example.com"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/40 focus:shadow-[0_0_0_1px_rgba(163,30,44,0.35)]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">Company Name</label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                        placeholder="e.g. InterFreight Solutions"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/40 focus:shadow-[0_0_0_1px_rgba(163,30,44,0.35)]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">Message</label>
                      <textarea
                        required
                        rows={6}
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        placeholder="Tell us about your cargo, route, or any questions..."
                        className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/40 focus:shadow-[0_0_0_1px_rgba(163,30,44,0.35)]"
                      />
                    </div>
                    {sendError && (
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
                        <AlertCircle size={16} className="shrink-0" />
                        {sendError}
                      </div>
                    )}
                    <button type="submit" disabled={sending} className="premium-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold text-white disabled:opacity-60">
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

import { useState, useEffect, useRef } from "react";
import { Search, SearchX, Loader2, Building2, X } from "lucide-react";
import { useListShipments } from "@workspace/api-client-react";
import { ShipmentCard } from "@/components/ui/shipment-card";
import { motion, AnimatePresence } from "framer-motion";

export default function Containers() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
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
    status: status || undefined,
    limit: 50,
  });

  const statuses = ["In Transit", "Delivered", "Awaiting Clearance", "At Port", "Delayed"];
  const shipments = data?.items ?? [];

  const handleClear = () => {
    setInput("");
    setSearch("");
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // Group shipments by company name (then by consignee within each group)
  const grouped = shipments.reduce<Record<string, typeof shipments>>((acc, s) => {
    const key = s.companyName || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen pt-24 pb-20" style={{ background: "#0d0f11" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-white mb-3">
            Track Your Shipments
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Type your company name or your name to see all your containers instantly.
          </p>
        </div>

        {/* Search Panel */}
        <div className="rounded-2xl border border-zinc-800 p-5 mb-8" style={{ background: "#191c1f" }}>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={20} />
              <input
                ref={inputRef}
                type="text"
                placeholder='e.g. "Atomic Hardware" or "John Phiri"'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                data-testid="input-company-search"
                className="w-full pl-11 pr-10 py-3.5 rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 text-base focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                autoFocus
              />
              {input && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Status filter */}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="py-3.5 px-4 rounded-xl border border-zinc-700 bg-zinc-900 text-white text-sm min-w-[180px] outline-none focus:border-red-500"
            >
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Search hint chips */}
          {!hasSearched && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-zinc-500 mr-1 self-center">Try:</span>
              {["Shire ltd", "Kris offset", "Eshani", "Bakeland LTD", "Interglobe"].map((name) => (
                <button
                  key={name}
                  onClick={() => { setInput(name); setHasSearched(true); }}
                  className="text-xs bg-zinc-800 hover:bg-red-600/20 hover:text-red-400 text-zinc-400 px-3 py-1.5 rounded-full transition-colors border border-zinc-700"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* States */}
        {!hasSearched && !status ? (
          <div className="text-center py-20 text-zinc-500">
            <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-zinc-400">Enter a company or consignee name above</p>
            <p className="text-sm mt-1">All matching containers will appear as cards below</p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
            <Loader2 className="w-10 h-10 animate-spin text-red-500 mb-4" />
            <p>Searching...</p>
          </div>
        ) : shipments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-zinc-800 p-14 flex flex-col items-center text-center"
            style={{ background: "#191c1f" }}
          >
            <SearchX className="w-14 h-14 text-zinc-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No containers found</h3>
            <p className="text-zinc-400 max-w-sm">
              No shipments match <span className="font-semibold text-white">"{search || status}"</span>.
              Try a different spelling or contact us for help.
            </p>
          </motion.div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-zinc-500">
                <span className="font-semibold text-white">{data?.total ?? shipments.length}</span>{" "}
                container{(data?.total ?? shipments.length) !== 1 ? "s" : ""} found
                {search && <> for <span className="font-semibold text-white">"{search}"</span></>}
                {" · "}
                <span className="text-zinc-500">{groupKeys.length} client{groupKeys.length !== 1 ? "s" : ""}</span>
              </p>
            </div>

            <AnimatePresence>
              <div className="space-y-10">
                {groupKeys.map((company, gi) => {
                  const items = grouped[company];

                  // Sub-group by consignee within this company
                  const byConsignee = items.reduce<Record<string, typeof items>>((acc, s) => {
                    const ck = s.consignee || company;
                    if (!acc[ck]) acc[ck] = [];
                    acc[ck].push(s);
                    return acc;
                  }, {});
                  const consigneeKeys = Object.keys(byConsignee).sort();
                  const hasMultipleConsignees = consigneeKeys.length > 1;

                  return (
                    <motion.div
                      key={company}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: gi * 0.06, duration: 0.3 }}
                    >
                      {/* Company header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-600/40 flex items-center justify-center shrink-0">
                          <Building2 size={15} className="text-red-500" />
                        </div>
                        <div>
                          <p className="text-white font-bold text-lg leading-tight">{company}</p>
                          <p className="text-zinc-500 text-xs">
                            {items.length} container{items.length !== 1 ? "s" : ""}
                            {hasMultipleConsignees && ` · ${consigneeKeys.length} consignees`}
                          </p>
                        </div>
                        <div className="flex-1 h-px bg-zinc-800 ml-2" />
                      </div>

                      {hasMultipleConsignees ? (
                        // Show sub-sections by consignee
                        <div className="space-y-7 pl-2">
                          {consigneeKeys.map((consignee, ci) => (
                            <div key={consignee}>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs font-semibold text-red-500 uppercase tracking-widest">
                                  Consignee:
                                </span>
                                <span className="text-zinc-300 text-sm font-medium">{consignee}</span>
                                <div className="flex-1 h-px bg-zinc-800/60 ml-1" />
                              </div>
                              <div className="space-y-4">
                                {byConsignee[consignee].map((shipment, idx) => (
                                  <ShipmentCard
                                    key={shipment.id}
                                    shipment={shipment}
                                    index={ci * 10 + idx}
                                    defaultOpen={true}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Single consignee — cards directly
                        <div className="space-y-4">
                          {items.map((shipment, idx) => (
                            <ShipmentCard
                              key={shipment.id}
                              shipment={shipment}
                              index={gi * 10 + idx}
                              defaultOpen={true}
                            />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>

            {(data?.total ?? 0) > shipments.length && (
              <p className="text-center text-sm text-zinc-500 mt-8">
                Showing {shipments.length} of {data?.total} — refine your search to narrow results
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

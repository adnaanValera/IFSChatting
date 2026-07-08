import { useState } from "react";
import { useGetMe, useListShipments } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useStaffLogout } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  Loader2, LogOut, Package, Ship, Building2, MapPin,
  CheckCircle, Home, Download,
} from "lucide-react";
import logoUrl from "@assets/Inter_freight_logo_1782979832903.jpeg";
import { Link } from "wouter";
import { ShipmentCard } from "@/components/ui/shipment-card";

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: shipmentsPage, isLoading: shipmentsLoading } = useListShipments({ limit: 200 });
  const logoutMutation = useStaffLogout();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
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
      a.download = `Status Report - ${companyName}.pdf`;
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

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const typedUser = user as any;
  const shipments = shipmentsPage?.items ?? [];

  const inTransit = shipments.filter((s: any) => s.status === "In Transit").length;
  const cleared = shipments.filter((s: any) => /cleared|delivered/i.test(s.status)).length;
  const atPort = shipments.filter((s: any) => /port|clearance/i.test(s.status)).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="bg-secondary text-secondary-foreground shadow-lg sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="InterFreight" className="h-10 w-auto bg-white rounded p-1" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest">My Tracking</p>
              <h1 className="text-lg font-bold text-white leading-tight">
                <span className="text-primary">{typedUser?.fullName || typedUser?.name}</span>{" "}
                <span className="font-normal text-gray-300 text-sm">· {typedUser?.companyName}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
              <Home size={15} /> Home
            </Link>
            <button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 max-w-5xl">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { icon: Package, label: "Total Consignments", value: shipments.length, color: "blue" },
            { icon: Ship, label: "In Transit", value: inTransit, color: "amber" },
            { icon: MapPin, label: "At Port / Clearance", value: atPort, color: "indigo" },
            { icon: CheckCircle, label: "Delivered / Cleared", value: cleared, color: "green" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-5 shadow-sm flex items-center gap-3">
              <div className={`p-2 bg-${color}-50 rounded-lg shrink-0`}>
                <Icon className={`text-${color}-600`} size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                <p className="text-2xl font-bold text-secondary">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Heading */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h2 className="text-2xl font-extrabold text-secondary">Your Consignments</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              {shipments.length} record{shipments.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf || shipmentsLoading || shipments.length === 0}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-60"
            >
              {isDownloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Download PDF
            </button>
          </div>
        </div>

        {/* Shipment cards */}
        {shipmentsLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border shadow-sm py-20 text-center">
            <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-secondary mb-2">No consignments yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your shipment records will appear here once they've been uploaded by our team.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shipments.map((s: any, index: number) => (
              <ShipmentCard key={s.id} shipment={s} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

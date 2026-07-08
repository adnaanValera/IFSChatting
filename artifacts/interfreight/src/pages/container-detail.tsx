import { useRoute } from "wouter";
import { useGetShipment } from "@workspace/api-client-react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { ShipmentCard } from "@/components/ui/shipment-card";

export default function ContainerDetail() {
  const [, params] = useRoute("/containers/:id");
  const id = params?.id ? parseInt(params.id) : 0;

  const { data: shipment, isLoading, error } = useGetShipment(id);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-24" style={{ background: "#0d0f11" }}>
        <Loader2 className="w-12 h-12 animate-spin text-red-500 mb-4" />
        <p className="text-zinc-400">Loading shipment details...</p>
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-24" style={{ background: "#0d0f11" }}>
        <div className="rounded-xl border border-zinc-800 p-8 text-center max-w-md" style={{ background: "#191c1f" }}>
          <h2 className="text-2xl font-bold text-red-500 mb-2">Shipment Not Found</h2>
          <p className="text-zinc-400 mb-6">We couldn't find this shipment. The ID may be invalid.</p>
          <Link href="/containers" className="bg-red-600 text-white px-6 py-2 rounded-md font-semibold hover:bg-red-700 transition-colors">
            Back to Search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: "#0d0f11" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
        <Link href="/containers" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white mb-8 transition-colors text-sm">
          <ArrowLeft size={16} /> Back to Search
        </Link>

        <ShipmentCard shipment={shipment} defaultOpen={true} />
      </div>
    </div>
  );
}

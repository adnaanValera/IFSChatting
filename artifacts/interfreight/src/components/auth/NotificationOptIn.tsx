import { Bell } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/hooks/use-toast";

type Props = {
  storageKey: string;
  scope: { type: "auth" };
};

export function NotificationOptIn({ storageKey, scope }: Props) {
  const { toast } = useToast();
  const { canEnable, enable, isLoading, isSubscribed, permission, unsupportedReason } = usePushNotifications(scope);

  void storageKey;

  if (isSubscribed || permission === "denied" || !canEnable) return null;

  async function handleEnable() {
    try {
      const success = await enable();
      if (success) {
        toast({ title: "Notifications enabled", description: "You will now receive InterFreight updates on this device." });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Notifications could not be enabled",
        description: error?.message || unsupportedReason || "Please try again after refreshing the page.",
      });
    }
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[95] mx-auto max-w-md rounded-2xl border border-secondary/10 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bell size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-secondary">Turn on shipment alerts</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Get approval and status updates directly on this device.
          </p>
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={isLoading}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary/92 disabled:opacity-60"
          >
            {isLoading ? <Spinner className="h-4 w-4" /> : <Bell size={15} />}
            Enable notifications
          </button>
        </div>
      </div>
    </div>
  );
}

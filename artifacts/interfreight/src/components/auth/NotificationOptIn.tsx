import { useEffect, useMemo, useState } from "react";
import { Bell, Check, ExternalLink, ShieldAlert } from "lucide-react";
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
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const helperDismissKey = `${storageKey}_android_popup_help_done`;
  const [showAndroidHelper, setShowAndroidHelper] = useState(false);
  const [showDetailedSteps, setShowDetailedSteps] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAndroid) return;
    if (!isSubscribed) return;
    if (localStorage.getItem(helperDismissKey) === "1") return;
    setShowAndroidHelper(true);
  }, [helperDismissKey, isAndroid, isSubscribed]);

  const shouldShowPrompt = useMemo(
    () => !isSubscribed && permission !== "denied" && canEnable,
    [canEnable, isSubscribed, permission],
  );

  if (!shouldShowPrompt && !showAndroidHelper) return null;

  function dismissAndroidHelper() {
    if (typeof window !== "undefined") {
      localStorage.setItem(helperDismissKey, "1");
    }
    setShowAndroidHelper(false);
    setShowDetailedSteps(false);
  }

  async function handleEnable() {
    try {
      const success = await enable();
      if (success) {
        toast({ title: "Notifications enabled", description: "You will now receive InterFreight updates on this device." });
        if (isAndroid && typeof window !== "undefined" && localStorage.getItem(helperDismissKey) !== "1") {
          setShowAndroidHelper(true);
        }
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
    <div className="fixed inset-x-4 bottom-4 z-[95] mx-auto max-w-md space-y-3">
      {shouldShowPrompt && (
        <div className="rounded-2xl border border-secondary/10 bg-white p-4 shadow-2xl">
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
      )}

      {showAndroidHelper && (
        <div className="rounded-2xl border border-primary/15 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldAlert size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-secondary">One more quick Android step</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                To make alerts pop up properly, allow pop-up notifications for your browser and remove battery restriction if your phone delays alerts.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowDetailedSteps((current) => !current)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-secondary/15 px-3 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/5"
                >
                  <ExternalLink size={14} />
                  {showDetailedSteps ? "Hide steps" : "Open settings steps"}
                </button>
                <button
                  type="button"
                  onClick={dismissAndroidHelper}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-secondary/92"
                >
                  <Check size={14} />
                  I've done this
                </button>
              </div>
              {showDetailedSteps && (
                <div className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                  <p className="font-semibold text-secondary">On Android:</p>
                  <ol className="mt-2 space-y-1.5">
                    <li>1. Open Chrome app info, then tap Notifications.</li>
                    <li>2. Allow pop-up or floating notifications.</li>
                    <li>3. Allow lock screen notifications.</li>
                    <li>4. If alerts are delayed, set Battery to Unrestricted for Chrome.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

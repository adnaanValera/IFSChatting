import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Share2, Smartphone, X } from "lucide-react";
import { Link } from "wouter";
import { Spinner } from "@/components/ui/spinner";
import { isStandaloneDisplay } from "@/lib/pwa";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { savedAccounts } from "@/lib/saved-accounts";
import { ThemeLogo } from "@/components/layout/ThemeLogo";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AppInstallPage() {
  const { toast } = useToast();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const { canEnable, enable, isLoading: isEnablingNotifications, isSubscribed, permission, unsupportedReason } = usePushNotifications({ type: "auth" });
  const [isPrompting, setIsPrompting] = useState(false);
  const [showIosInstallHelp, setShowIosInstallHelp] = useState(false);
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const openedInApp = isStandaloneDisplay();
  const isWaitingForPrompt = !isIOS && !installed && !openedInApp && !canInstall;
  const currentToken = typeof window !== "undefined" ? localStorage.getItem("intf_token") : null;
  const hasToken = !!currentToken;
  const currentAccount = currentToken ? savedAccounts().find((account) => account.token === currentToken) : null;
  const authedHref = currentAccount?.role === "staff" || currentAccount?.role === "admin" ? "/staff/dashboard" : "/dashboard";

  useEffect(() => {
    if (hasToken) {
      window.location.replace(authedHref);
      return;
    }
    if (openedInApp || installed) {
      window.location.replace("/auth");
      return;
    }
    if (!isSubscribed) return;
    if (!canInstall || isIOS) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setIsPrompting(true);
      void promptInstall().finally(() => {
        if (!cancelled) setIsPrompting(false);
      });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authedHref, canInstall, hasToken, installed, isIOS, isSubscribed, openedInApp, promptInstall]);

  const installHelpText = useMemo(() => {
    if (isIOS) {
      return "Press Install App and we will guide you through the final iPhone step. Once the app opens from your home screen, we will take you straight to login.";
    }
    if (!canInstall && !installed) {
      return "If your phone does not show the install prompt immediately, use your browser menu and choose Install App or Add to Home Screen.";
    }
    return "Install the InterFreight app first. Once it opens as the app, we will take you straight to login.";
  }, [canInstall, installed, isIOS]);

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:py-14">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-lg items-center justify-center">
        <div className="w-full rounded-[28px] border border-border bg-white p-7 text-center shadow-2xl sm:p-9">
          <ThemeLogo alt="InterFreight Solutions" className="mx-auto mb-5 h-20 w-auto sm:h-24" />

          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {isPrompting || isWaitingForPrompt ? <Spinner className="h-8 w-8" /> : <Smartphone size={28} />}
          </div>

          <h1 className="text-2xl font-extrabold text-secondary sm:text-3xl">Wait a few seconds for it to be installed</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {installHelpText}
          </p>

          <div className="mt-6 space-y-3">
            {!isSubscribed && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Bell size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-secondary">First enable notifications</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Please allow notifications first so shipment updates can reach this device properly. Once that is done, app install will unlock.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void enable()
                          .then((success) => {
                            if (success) {
                              toast({
                                title: "Notifications enabled",
                                description: "You can now install the InterFreight app.",
                              });
                            }
                          })
                          .catch((error: any) => {
                            toast({
                              variant: "destructive",
                              title: "Notifications could not be enabled",
                              description: error?.message || unsupportedReason || "Please try again.",
                            });
                          });
                      }}
                      disabled={isEnablingNotifications || !canEnable}
                      className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary/92 disabled:opacity-60"
                    >
                      {isEnablingNotifications ? <Spinner className="h-4 w-4" /> : <Bell size={15} />}
                      Allow notifications
                    </button>
                    {permission === "denied" && (
                      <p className="mt-2 text-xs text-destructive">
                        Notifications were blocked on this device. Please allow them in your browser settings first.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!installed && (
              <button
                type="button"
                onClick={() => {
                  if (isIOS) {
                    setShowIosInstallHelp(true);
                    return;
                  }
                  if (!canInstall) return;
                  setIsPrompting(true);
                  void promptInstall().finally(() => setIsPrompting(false));
                }}
                disabled={isPrompting || !isSubscribed || (!isIOS && !canInstall)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-70"
              >
                {isPrompting ? <Spinner className="h-4 w-4" /> : <Download size={16} />}
                {!isSubscribed ? "Enable notifications first" : isWaitingForPrompt ? "Please wait..." : "Install App"}
              </button>
            )}

            {isWaitingForPrompt && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
                <div className="flex items-center gap-2 text-primary">
                  <Spinner className="h-5 w-5" />
                  <p className="text-sm font-bold">Preparing the install prompt</p>
                </div>
                <p className="mt-2">
                  Please wait a moment. If the button still does not wake up, use your browser menu and choose
                  {" "}
                  <span className="font-semibold text-secondary">Install App</span>
                  {" "}
                  or
                  {" "}
                  <span className="font-semibold text-secondary">Add to Home Screen</span>.
                </p>
              </div>
            )}

            {isIOS && !installed && showIosInstallHelp && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 text-left">
                <div className="flex items-center justify-between gap-2 text-primary">
                  <div className="flex items-center gap-2">
                    <Share2 size={16} />
                    <p className="text-sm font-bold">Install on iPhone</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIosInstallHelp(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label="Close iPhone install help"
                  >
                    <X size={14} />
                  </button>
                </div>
                <ol className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <li>1. Open this page in Safari.</li>
                  <li>2. Tap the Share button.</li>
                  <li>3. Choose <span className="font-semibold text-secondary">Add to Home Screen</span>.</li>
                  <li>4. Open the InterFreight app from your home screen.</li>
                </ol>
              </div>
            )}

            {!isIOS && !canInstall && !openedInApp && !installed && (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
                If your phone does not show the install prompt immediately, use your browser menu and choose
                {" "}
                <span className="font-semibold text-secondary">Add to Home Screen</span>
                {" "}
                or
                {" "}
                <span className="font-semibold text-secondary">Install App</span>,
                then open the app from your home screen.
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <Link href="/" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <ExternalLink size={13} />
              Back to homepage
            </Link>
            <span className="text-border">|</span>
            <span>Mobile notifications work best after install</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Share2, Smartphone } from "lucide-react";
import { Link } from "wouter";
import logoUrl from "@assets/Inter_freight_logo_nobg.png";
import { Spinner } from "@/components/ui/spinner";
import { isStandaloneDisplay } from "@/lib/pwa";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export default function AppInstallPage() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [isPrompting, setIsPrompting] = useState(false);
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const openedInApp = isStandaloneDisplay();

  useEffect(() => {
    if (openedInApp || installed) {
      window.location.replace("/auth");
      return;
    }
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
  }, [canInstall, installed, isIOS, openedInApp, promptInstall]);

  const installHelpText = useMemo(() => {
    if (isIOS) {
      return "On iPhone or iPad, tap Share in Safari, then choose Add to Home Screen. Once the app opens from your home screen, we will take you straight to login.";
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
          <img src={logoUrl} alt="InterFreight Solutions" className="mx-auto mb-5 h-20 w-auto sm:h-24" />

          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {isPrompting ? <Spinner className="h-8 w-8" /> : <Smartphone size={28} />}
          </div>

          <h1 className="text-2xl font-extrabold text-secondary sm:text-3xl">Wait a few seconds for it to be installed</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {installHelpText}
          </p>

          <div className="mt-6 space-y-3">
            {!installed && (
              <button
                type="button"
                onClick={() => {
                  if (isIOS || !canInstall) return;
                  setIsPrompting(true);
                  void promptInstall().finally(() => setIsPrompting(false));
                }}
                disabled={isPrompting || isIOS || !canInstall}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-70"
              >
                {isPrompting ? <Spinner className="h-4 w-4" /> : <Download size={16} />}
                Install App
              </button>
            )}

            {isIOS && !installed && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 text-left">
                <div className="flex items-center gap-2 text-primary">
                  <Share2 size={16} />
                  <p className="text-sm font-bold">How to install on iPhone</p>
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

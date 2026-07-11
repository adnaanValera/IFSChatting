import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, LogIn, Smartphone } from "lucide-react";
import { Link } from "wouter";
import logoUrl from "@assets/Inter_freight_logo_nobg.png";
import { Spinner } from "@/components/ui/spinner";
import { isStandaloneDisplay } from "@/lib/pwa";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export default function AppInstallPage() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    if (!canInstall || installed) return;
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
  }, [canInstall, installed, promptInstall]);

  const openedInApp = useMemo(() => isStandaloneDisplay(), []);

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
            Install the InterFreight app first, then open it and log in there. Notifications work best from the installed app on mobile.
          </p>

          <div className="mt-6 space-y-3">
            {!installed && canInstall && (
              <button
                type="button"
                onClick={() => {
                  setIsPrompting(true);
                  void promptInstall().finally(() => setIsPrompting(false));
                }}
                disabled={isPrompting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-70"
              >
                {isPrompting ? <Spinner className="h-4 w-4" /> : <Download size={16} />}
                Install App
              </button>
            )}

            <Link
              href="/auth"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-secondary/10 bg-secondary px-5 py-3.5 text-sm font-bold text-white transition-all hover:bg-secondary/92"
            >
              <LogIn size={16} />
              Open App
            </Link>

            {!canInstall && !openedInApp && !installed && (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
                If your phone does not show the install prompt immediately, use your browser menu and choose
                {" "}
                <span className="font-semibold text-secondary">Add to Home Screen</span>
                {" "}
                or
                {" "}
                <span className="font-semibold text-secondary">Install App</span>,
                then open it and log in there.
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

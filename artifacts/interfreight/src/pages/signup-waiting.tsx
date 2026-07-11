import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Home } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/hooks/use-toast";
import { ThemeLogo } from "@/components/layout/ThemeLogo";

export default function SignupWaitingPage() {
  const { toast } = useToast();
  const [sessionDays, setSessionDays] = useState("30");
  const email = localStorage.getItem("intf_pending_signup_email") || "";
  const approvalToken = localStorage.getItem("intf_pending_signup_token") || "";
  const { canEnable, enable, isLoading, isSubscribed, unsupportedReason } = usePushNotifications(
    approvalToken ? { type: "pending", approvalToken } : undefined,
  );

  useEffect(() => {
    localStorage.setItem("intf_pending_session_days", sessionDays);
  }, [sessionDays]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md bg-white rounded-2xl border border-border shadow-xl p-6 text-center">
        <div className="mx-auto mb-5 flex items-center justify-center">
          <ThemeLogo alt="InterFreight Logo" className="h-16 w-auto" />
        </div>
        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <Spinner className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-secondary mb-2">Waiting for Approval</h1>
        <p className="text-sm text-muted-foreground mb-3">
          Waiting for approval from InterFreight Solutions. We will notify you clearly when your request is approved or rejected, even if you browse the homepage.
        </p>
        {email && <p className="text-xs text-muted-foreground mb-6">Request submitted for {email}</p>}
        <div className="grid gap-3 mb-5">
          {canEnable && !isSubscribed && (
            <button
              type="button"
              onClick={() => void enable().catch((error: any) => {
                toast({
                  variant: "destructive",
                  title: "Notifications could not be enabled",
                  description: error?.message || unsupportedReason || "Please open the installed app and try again.",
                });
              })}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-secondary/10 bg-secondary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-secondary/92 disabled:opacity-60"
            >
              {isLoading ? <Spinner className="h-4 w-4" /> : <Bell size={15} />}
              Notify me when approved
            </button>
          )}
          {!canEnable && unsupportedReason && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
              {unsupportedReason}
            </div>
          )}
        </div>
        <select
          value={sessionDays}
          onChange={(e) => setSessionDays(e.target.value)}
          className="w-full border border-input rounded-lg px-3 py-3 text-sm bg-white mb-4"
        >
          <option value="1">Stay signed in for today</option>
          <option value="7">Stay signed in for 7 days</option>
          <option value="30">Stay signed in for 30 days</option>
          <option value="90">Stay signed in for 90 days</option>
          <option value="180">Stay signed in for 180 days</option>
        </select>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-3 rounded-lg transition-colors"
        >
          <Home size={15} />
          Learn about us while you wait
        </Link>
      </div>
    </div>
  );
}

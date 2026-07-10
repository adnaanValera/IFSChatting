import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clock, Home, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import logoUrl from "@assets/Inter_freight_logo_1782979832903.jpeg";

export default function SignupWaitingPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("Waiting for approval from InterFreight Solutions.");
  const [checking, setChecking] = useState(false);
  const [sessionDays, setSessionDays] = useState("30");
  const email = localStorage.getItem("intf_pending_signup_email") || "";

  useEffect(() => {
    const approvalToken = localStorage.getItem("intf_pending_signup_token");
    if (!approvalToken) return;

    let stopped = false;
    const check = async () => {
      setChecking(true);
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/auth/pending-signup/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalToken, sessionDays: Number(sessionDays) }),
        });
        const json = await res.json().catch(() => ({}));
        if (stopped) return;

        if (res.ok && json.status === "approved" && json.token) {
          localStorage.setItem("intf_token", json.token);
          localStorage.setItem("intf_session_duration_confirmed", "1");
          localStorage.removeItem("intf_pending_signup_token");
          localStorage.removeItem("intf_pending_signup_email");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setLocation(json.user?.role === "staff" || json.user?.role === "admin" ? "/staff/dashboard" : "/dashboard");
          return;
        }

        if (res.status === 403 || json.status === "rejected") {
          setMessage(json.error || "Your signup request was rejected. Please contact InterFreight Solutions.");
          localStorage.removeItem("intf_pending_signup_token");
          return;
        }

        setMessage("Waiting for approval from InterFreight Solutions.");
      } catch {
        if (!stopped) setMessage("Still waiting for approval. We will keep checking automatically.");
      } finally {
        if (!stopped) setChecking(false);
      }
    };

    check();
    const id = window.setInterval(check, 7000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [queryClient, sessionDays, setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md bg-white rounded-2xl border border-border shadow-xl p-6 text-center">
        <img src={logoUrl} alt="InterFreight Logo" className="h-16 w-auto bg-white rounded p-1 shadow-sm mx-auto mb-5" />
        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          {checking ? <Loader2 className="animate-spin" size={24} /> : <Clock size={24} />}
        </div>
        <h1 className="text-2xl font-extrabold text-secondary mb-2">Waiting for Approval</h1>
        <p className="text-sm text-muted-foreground mb-3">{message}</p>
        {email && <p className="text-xs text-muted-foreground mb-6">Request submitted for {email}</p>}
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

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Home, Loader2, XCircle } from "lucide-react";

type Notice =
  | { type: "approved"; title: string; message: string; destination: string }
  | { type: "rejected"; title: string; message: string };

export function PendingSignupWatcher() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      const approvalToken = localStorage.getItem("intf_pending_signup_token");
      if (!approvalToken || localStorage.getItem("intf_token")) return;

      setChecking(true);
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const sessionDays = Number(localStorage.getItem("intf_pending_session_days") || "30");
        const res = await fetch(`${base}/api/auth/pending-signup/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalToken, sessionDays }),
        });
        const json = await res.json().catch(() => ({}));
        if (stopped) return;

        if (res.ok && json.status === "approved" && json.token) {
          localStorage.setItem("intf_token", json.token);
          localStorage.setItem("intf_session_duration_confirmed", "1");
          localStorage.removeItem("intf_pending_signup_token");
          localStorage.removeItem("intf_pending_signup_email");
          localStorage.removeItem("intf_pending_session_days");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

          const destination = json.user?.role === "staff" || json.user?.role === "admin" ? "/staff/dashboard" : "/dashboard";
          setNotice({
            type: "approved",
            title: "Account Approved",
            message: "Your InterFreight account is ready. Taking you to your dashboard now.",
            destination,
          });
          window.setTimeout(() => setLocation(destination), 2200);
          return;
        }

        if (res.status === 403 || json.status === "rejected") {
          localStorage.removeItem("intf_pending_signup_token");
          localStorage.removeItem("intf_pending_signup_email");
          localStorage.removeItem("intf_pending_session_days");
          setNotice({
            type: "rejected",
            title: "Signup Rejected",
            message: json.error || "Your signup request was rejected. Please contact InterFreight Solutions.",
          });
        }
      } finally {
        if (!stopped) setChecking(false);
      }
    };

    check();
    const id = window.setInterval(check, 5000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [queryClient, setLocation]);

  if (!notice) return null;

  const approved = notice.type === "approved";
  return (
    <div className="fixed inset-0 z-[100] bg-secondary/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div
        className={`w-full max-w-md rounded-2xl border-2 bg-white shadow-2xl p-6 text-center ${
          approved ? "border-emerald-500" : "border-destructive"
        }`}
      >
        <div
          className={`mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center ${
            approved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          {approved ? <CheckCircle2 size={34} /> : <XCircle size={34} />}
        </div>
        <h2 className={`text-2xl font-extrabold mb-2 ${approved ? "text-emerald-700" : "text-destructive"}`}>
          {notice.title}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">{notice.message}</p>
        {notice.type === "approved" ? (
          <button
            onClick={() => setLocation(notice.destination)}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-5 py-3 rounded-lg"
          >
            {checking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Open Dashboard
          </button>
        ) : (
          <button
            onClick={() => {
              setNotice(null);
              setLocation("/");
            }}
            className="w-full inline-flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-bold px-5 py-3 rounded-lg"
          >
            <Home size={16} />
            Back to Home
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Home, X, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

type Notice =
  | { type: "approved"; title: string; message: string; destination: string }
  | { type: "rejected"; title: string; message: string };

function saveLoggedInAccount(token: string, user: any) {
  try {
    const parsed = JSON.parse(localStorage.getItem("intf_saved_accounts") || "[]");
    const accounts = Array.isArray(parsed) ? parsed.filter((account) => account?.token !== token && account?.email !== user?.email) : [];
    accounts.unshift({
      token,
      fullName: user?.fullName || user?.name,
      companyName: user?.companyName,
      email: user?.email,
      role: user?.role,
    });
    localStorage.setItem("intf_saved_accounts", JSON.stringify(accounts.slice(0, 8)));
  } catch {
    // Ignore local account-switch cache errors.
  }
}

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
          saveLoggedInAccount(json.token, json.user);
          localStorage.removeItem("intf_pending_signup_token");
          localStorage.removeItem("intf_pending_signup_email");
          localStorage.removeItem("intf_pending_session_days");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

          const destination = json.user?.role === "staff" || json.user?.role === "admin" ? "/staff/dashboard" : "/dashboard";
          setNotice({
            type: "approved",
            title: "Account Approved",
            message: "Your InterFreight account is ready. You can open your dashboard now.",
            destination,
          });
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
        className={`relative w-full max-w-md rounded-2xl border-2 bg-white p-6 text-center shadow-2xl ${
          approved ? "border-emerald-500" : "border-destructive"
        }`}
      >
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-secondary"
          aria-label="Close notice"
        >
          <X size={16} />
        </button>
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
            {checking ? <Spinner className="w-4 h-4" /> : <CheckCircle2 size={16} />}
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

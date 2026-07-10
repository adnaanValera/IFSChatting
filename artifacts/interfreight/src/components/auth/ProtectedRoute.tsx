import { ReactNode, useState } from "react";
import { Redirect } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Clock, Loader2 } from "lucide-react";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-primary w-8 h-8" />
    </div>
  );
}

function SessionDurationGate({ children, user }: { children: ReactNode; user: any }) {
  const key = "intf_session_duration_confirmed";
  const [confirmed, setConfirmed] = useState(() => localStorage.getItem(key) === "1");
  const [sessionDays, setSessionDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (user?.role === "admin" || confirmed) return <>{children}</>;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/session-duration`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionDays: Number(sessionDays) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 400) {
        localStorage.setItem(key, "1");
        setConfirmed(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not save session setting");
      localStorage.setItem(key, "1");
      setConfirmed(true);
    } catch (err: any) {
      setError(err.message || "Could not save session setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-border shadow-xl p-6">
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
          <Clock size={22} />
        </div>
        <h1 className="text-2xl font-extrabold text-secondary mb-2">Keep this device signed in</h1>
        <p className="text-sm text-muted-foreground mb-5">Choose how long this device should stay logged in.</p>
        <select
          value={sessionDays}
          onChange={(e) => setSessionDays(e.target.value)}
          className="w-full border border-input rounded-lg px-3 py-3 text-sm bg-white mb-4"
        >
          <option value="1">Today only</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
        </select>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        <button
          onClick={save}
          disabled={saving}
          className="w-full flex justify-center items-center gap-2 py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continue"}
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  return <SessionDurationGate user={user}>{children}</SessionDurationGate>;
}

export function StaffRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  const role = (user as any).role;
  if (role !== "staff" && role !== "admin") return <Redirect to="/dashboard" />;
  return <SessionDurationGate user={user}>{children}</SessionDurationGate>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  if ((user as any).role !== "admin") return <Redirect to="/staff/dashboard" />;
  return <SessionDurationGate user={user}>{children}</SessionDurationGate>;
}

export function CustomerRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  const role = (user as any).role;
  if (role === "staff" || role === "admin") return <Redirect to="/staff/dashboard" />;
  return <SessionDurationGate user={user}>{children}</SessionDurationGate>;
}

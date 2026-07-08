import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-primary w-8 h-8" />
    </div>
  );
}

/** Requires any authenticated user — redirects to /auth if not logged in */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  return <>{children}</>;
}

/** Requires staff OR admin role — redirects to /dashboard if logged in as customer */
export function StaffRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  const role = (user as any).role;
  if (role !== "staff" && role !== "admin") return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

/** Requires admin role only — redirects staff employees to /staff/dashboard */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  if ((user as any).role !== "admin") return <Redirect to="/staff/dashboard" />;
  return <>{children}</>;
}

/** Requires customer role — redirects to /staff/dashboard if logged in as staff/admin */
export function CustomerRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  if (isLoading) return <Loading />;
  if (error || !user) return <Redirect to="/auth" />;
  const role = (user as any).role;
  if (role === "staff" || role === "admin") return <Redirect to="/staff/dashboard" />;
  return <>{children}</>;
}

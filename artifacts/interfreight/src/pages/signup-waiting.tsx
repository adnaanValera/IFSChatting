import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Home } from "lucide-react";
import logoUrl from "@assets/Inter_freight_logo_1782979832903.jpeg";
import miniLogoUrl from "@assets/IFS_mini_logo.png";
import { Spinner } from "@/components/ui/spinner";

export default function SignupWaitingPage() {
  const [sessionDays, setSessionDays] = useState("30");
  const email = localStorage.getItem("intf_pending_signup_email") || "";

  useEffect(() => {
    localStorage.setItem("intf_pending_session_days", sessionDays);
  }, [sessionDays]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md bg-white rounded-2xl border border-border shadow-xl p-6 text-center">
        <div className="mx-auto mb-5 flex items-center justify-center gap-3">
          <img src={miniLogoUrl} alt="IFS mini logo" className="h-14 w-14 object-contain" />
          <img src={logoUrl} alt="InterFreight Logo" className="h-16 w-auto bg-white rounded p-1 shadow-sm" />
        </div>
        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <Spinner className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-secondary mb-2">Waiting for Approval</h1>
        <p className="text-sm text-muted-foreground mb-3">
          Waiting for approval from InterFreight Solutions. We will notify you clearly when your request is approved or rejected, even if you browse the homepage.
        </p>
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

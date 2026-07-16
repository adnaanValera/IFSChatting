import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, LogOut, TriangleAlert } from "lucide-react";
import { useGetMe, useStaffLogout } from "@workspace/api-client-react";
import { NotificationOptIn } from "@/components/auth/NotificationOptIn";
import { AccountSwitcher } from "@/components/auth/AccountSwitcher";
import { ProblemReporter } from "@/components/customer/ProblemReporter";
import { Spinner } from "@/components/ui/spinner";
import { saveAccount, savedAccounts, type SavedAccount } from "@/lib/saved-accounts";

const CUSTOMER_BADGE_URL = "/ifs-app-premium.png";

export default function CustomerProblemsPage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const logoutMutation = useStaffLogout();
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => savedAccounts());

  useEffect(() => {
    if (!user) return;
    saveAccount(localStorage.getItem("intf_token"), user);
    setAccounts(savedAccounts());
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="w-14 h-14" />
      </div>
    );
  }

  const typedUser = user as any;

  return (
    <div className="min-h-screen bg-background">
      <NotificationOptIn storageKey="intf_push_prompt_customer" scope={{ type: "auth" }} />

      <div className="bg-secondary text-secondary-foreground shadow-lg sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={CUSTOMER_BADGE_URL} alt={typedUser?.fullName || typedUser?.name || "Profile"} className="h-10 w-10 rounded-xl object-cover border border-white/15 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 uppercase tracking-widest">Support</p>
              <h1 className="text-sm sm:text-lg font-bold text-white leading-tight truncate">
                <span className="text-primary">{typedUser?.fullName || typedUser?.name}</span>{" "}
                <span className="font-normal text-gray-300 text-sm">· {typedUser?.companyName}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Link href="/" className="hidden sm:flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
              <Home size={15} /> Home
            </Link>
            {accounts.length > 0 && <AccountSwitcher currentToken={localStorage.getItem("intf_token")} />}
            <button
              onClick={() => logoutMutation.mutate(undefined, {
                onSettled: () => {
                  localStorage.removeItem("intf_token");
                  localStorage.removeItem("intf_session_duration_confirmed");
                  setLocation("/");
                },
              })}
              disabled={logoutMutation.isPending}
              className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-3 py-5 sm:px-6 sm:py-10">
        <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm glow-card sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Customer Support</p>
              <h2 className="mt-1 text-2xl font-extrabold text-secondary dark:text-white">Bug/Problem</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell us what is wrong and we will sort it out quickly.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <TriangleAlert size={16} />
              Back to My Tracking
            </Link>
          </div>
        </div>

        <ProblemReporter />
      </div>
    </div>
  );
}

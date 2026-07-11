import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StaffRoute, CustomerRoute, AdminRoute } from "@/components/auth/ProtectedRoute";
import { PendingSignupWatcher } from "@/components/auth/PendingSignupWatcher";
import { setupApiClient } from "@/lib/api-setup";

// Pages
import Home from "@/pages/home";
import AppInstallPage from "@/pages/app-install";
import AuthPage from "@/pages/auth";
import SignupWaitingPage from "@/pages/signup-waiting";
import Containers from "@/pages/containers";
import ContainerDetail from "@/pages/container-detail";
import CustomerDashboard from "@/pages/customer/dashboard";
import StaffDashboard from "@/pages/staff/dashboard";
import StaffUsers from "@/pages/staff/users";
import NotFound from "@/pages/not-found";
import { PremiumBrandAnimation } from "@/components/branding/PremiumBrandAnimation";

setupApiClient();

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/app-install" component={AppInstallPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth/waiting" component={SignupWaitingPage} />
      <Route path="/containers" component={Containers} />
      <Route path="/containers/:id" component={ContainerDetail} />

      {/* Customer portal */}
      <Route path="/dashboard">
        {() => (
          <CustomerRoute>
            <CustomerDashboard />
          </CustomerRoute>
        )}
      </Route>

      {/* Staff portal — staff + admin */}
      <Route path="/staff/dashboard">
        {() => (
          <StaffRoute>
            <StaffDashboard />
          </StaffRoute>
        )}
      </Route>

      {/* Admin only — user management */}
      <Route path="/staff/users">
        {() => (
          <AdminRoute>
            <StaffUsers />
          </AdminRoute>
        )}
      </Route>

      {/* Catch-all */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", media.matches);
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {showSplash && <PremiumBrandAnimation mode="splash" onComplete={() => setShowSplash(false)} />}
          <PendingSignupWatcher />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

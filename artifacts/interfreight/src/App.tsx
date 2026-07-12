import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StaffRoute, CustomerRoute, AdminRoute } from "@/components/auth/ProtectedRoute";
import { PendingSignupWatcher } from "@/components/auth/PendingSignupWatcher";
import { setupApiClient } from "@/lib/api-setup";
import fullLogoUrl from "@assets/Inter_freight_logo_nobg.png";

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

setupApiClient();

const queryClient = new QueryClient();

function BrandIntro() {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => setClosing(true), 3000);
    const hideTimer = window.setTimeout(() => setVisible(false), 3380);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`brand-intro-overlay ${closing ? "brand-intro-overlay--closing" : ""}`}>
      <div className="brand-intro-stage" aria-hidden="true">
        <img src={fullLogoUrl} alt="InterFreight Solutions" className="brand-intro-logo" />
        <span className="brand-intro-wipe" />
      </div>
    </div>
  );
}

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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrandIntro />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <PendingSignupWatcher />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

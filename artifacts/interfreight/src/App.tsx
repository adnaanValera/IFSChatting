import { useEffect, useRef, useState } from "react";
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
import CustomerProblemsPage from "@/pages/customer/problems";
import StaffDashboard from "@/pages/staff/dashboard";
import StaffUsers from "@/pages/staff/users";
import NotFound from "@/pages/not-found";

setupApiClient();

const queryClient = new QueryClient();

function BrandIntro() {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(true);
  const [morphing, setMorphing] = useState(false);
  const [targetTransform, setTargetTransform] = useState<{ x: number; y: number; scale: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const isHome = window.location.pathname === `${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/` || window.location.pathname === "/";

  useEffect(() => {
    if (!isHome) {
      document.documentElement.dataset.brandIntro = "done";
      setVisible(false);
      return;
    }

    document.documentElement.dataset.brandIntro = "active";

    const locateTarget = () => {
      const target = document.getElementById("hero-intro-logo");
      const stage = stageRef.current;
      if (!target || !stage) return false;
      const targetRect = target.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      if (!targetRect.width || !targetRect.height || !stageRect.width || !stageRect.height) return false;
      const stageCenterX = stageRect.left + stageRect.width / 2;
      const stageCenterY = stageRect.top + stageRect.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      setTargetTransform({
        x: targetCenterX - stageCenterX,
        y: targetCenterY - stageCenterY,
        scale: targetRect.width / stageRect.width,
      });
      return true;
    };

    const locateTimer = window.setInterval(() => {
      if (locateTarget()) {
        window.clearInterval(locateTimer);
      }
    }, 120);

    const morphTimer = window.setTimeout(() => {
      locateTarget();
      document.documentElement.dataset.brandIntro = "morphing";
      setMorphing(true);
    }, 2100);
    const closeTimer = window.setTimeout(() => {
      document.documentElement.dataset.brandIntro = "closing";
      setClosing(true);
    }, 3400);
    const hideTimer = window.setTimeout(() => {
      document.documentElement.dataset.brandIntro = "done";
      setVisible(false);
    }, 3820);
    return () => {
      window.clearInterval(locateTimer);
      window.clearTimeout(morphTimer);
      window.clearTimeout(closeTimer);
      window.clearTimeout(hideTimer);
      if (document.documentElement.dataset.brandIntro !== "done") {
        delete document.documentElement.dataset.brandIntro;
      }
    };
  }, [isHome]);

  if (!visible) return null;

  return (
    <div className={`brand-intro-overlay ${closing ? "brand-intro-overlay--closing" : ""} ${morphing ? "brand-intro-overlay--morphing" : ""}`}>
      <div
        ref={stageRef}
        className={`brand-intro-stage ${morphing && targetTransform ? "brand-intro-stage--morphing" : ""}`}
        aria-hidden="true"
        style={morphing && targetTransform ? {
          ["--intro-shift-x" as string]: `${targetTransform.x}px`,
          ["--intro-shift-y" as string]: `${targetTransform.y}px`,
          ["--intro-scale" as string]: `${targetTransform.scale}`,
        } : undefined}
      >
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
      <Route path="/dashboard/problems">
        {() => (
          <CustomerRoute>
            <CustomerProblemsPage />
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

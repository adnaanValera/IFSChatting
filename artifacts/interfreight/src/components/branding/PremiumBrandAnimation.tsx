import { useEffect, useState, type CSSProperties } from "react";
import fullLogoUrl from "@assets/Inter_freight_logo_nobg.png";
import appIconUrl from "@assets/IFS_mini_logo.png";
import { cn } from "@/lib/utils";

type PremiumBrandAnimationProps = {
  mode: "splash" | "hero";
  className?: string;
  onComplete?: () => void;
};

const SPLASH_DURATION_MS = 5600;

export function PremiumBrandAnimation({ mode, className, onComplete }: PremiumBrandAnimationProps) {
  const [isClosing, setIsClosing] = useState(false);
  const assetVars = {
    ["--ifs-app-icon" as string]: `url(${appIconUrl})`,
  } as CSSProperties;

  useEffect(() => {
    if (mode !== "splash" || !onComplete) return;
    const closeTimer = window.setTimeout(() => setIsClosing(true), SPLASH_DURATION_MS - 650);
    const doneTimer = window.setTimeout(() => onComplete(), SPLASH_DURATION_MS);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [mode, onComplete]);

  if (mode === "hero") {
    return (
      <div className={cn("ifs-hero-brand relative mx-auto flex w-full max-w-[420px] items-center justify-center", className)} style={assetVars}>
        <div className="ifs-hero-brand__frame">
          <img src={fullLogoUrl} alt="InterFreight Solutions" className="ifs-hero-brand__full-logo" />
          <div className="ifs-hero-brand__orbit">
            <span className="ifs-hero-brand__arc ifs-hero-brand__arc--red" />
            <span className="ifs-hero-brand__arc ifs-hero-brand__arc--silver" />
          </div>
          <span className="ifs-hero-brand__shine" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("ifs-splash fixed inset-0 z-[120] flex items-center justify-center bg-white", isClosing && "ifs-splash--closing", className)} style={assetVars}>
      <div className="ifs-splash__stage">
        <div className="ifs-splash__full-phase">
          <img src={fullLogoUrl} alt="InterFreight Solutions" className="ifs-splash__full-logo" />
        </div>

        <div className="ifs-splash__icon-phase">
          <div className="ifs-splash__icon-shell">
            <img src={appIconUrl} alt="IFS app icon" className="ifs-splash__icon-image" />
            <div className="ifs-splash__map-layer" />
            <div className="ifs-splash__ship-layer" />
            <div className="ifs-splash__truck-layer" />
            <div className="ifs-splash__letter-lock">
              <span className="ifs-splash__ifs-text">IFS</span>
              <span className="ifs-splash__ifs-sweep" />
            </div>
            <div className="ifs-splash__orbit">
              <span className="ifs-splash__arc ifs-splash__arc--red" />
              <span className="ifs-splash__arc ifs-splash__arc--silver" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

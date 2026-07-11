import { useEffect, useMemo, useState } from "react";
import { BeforeInstallPromptEvent, isStandaloneDisplay } from "@/lib/pwa";

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    function syncInstalledState() {
      setInstalled(isStandaloneDisplay());
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("focus", syncInstalledState);
    window.addEventListener("pageshow", syncInstalledState);
    document.addEventListener("visibilitychange", syncInstalledState);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("focus", syncInstalledState);
      window.removeEventListener("pageshow", syncInstalledState);
      document.removeEventListener("visibilitychange", syncInstalledState);
    };
  }, []);

  const canInstall = useMemo(() => !installed && !!promptEvent, [installed, promptEvent]);

  async function promptInstall() {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setPromptEvent(null);
      return true;
    }
    return false;
  }

  return { canInstall, installed, promptInstall };
}

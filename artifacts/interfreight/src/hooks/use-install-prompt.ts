import { useEffect, useMemo, useState } from "react";
import { BeforeInstallPromptEvent, isStandaloneDisplay } from "@/lib/pwa";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedState = typeof window !== "undefined" ? isStandaloneDisplay() : false;
const listeners = new Set<() => void>();
let globalListenersBound = false;

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function bindGlobalInstallListeners() {
  if (globalListenersBound || typeof window === "undefined") return;
  globalListenersBound = true;

  const syncInstalledState = () => {
    installedState = isStandaloneDisplay();
    notifyListeners();
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener("appinstalled", () => {
    installedState = true;
    deferredPrompt = null;
    notifyListeners();
  });

  window.addEventListener("focus", syncInstalledState);
  window.addEventListener("pageshow", syncInstalledState);
  document.addEventListener("visibilitychange", syncInstalledState);
}

bindGlobalInstallListeners();

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(() => deferredPrompt);
  const [installed, setInstalled] = useState(() => installedState);

  useEffect(() => {
    const syncState = () => {
      setPromptEvent(deferredPrompt);
      setInstalled(installedState);
    };

    listeners.add(syncState);
    syncState();
    return () => {
      listeners.delete(syncState);
    };
  }, []);

  const canInstall = useMemo(() => !installed && !!promptEvent, [installed, promptEvent]);

  async function promptInstall() {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      installedState = true;
      deferredPrompt = null;
      notifyListeners();
      return true;
    }
    deferredPrompt = null;
    notifyListeners();
    return false;
  }

  return { canInstall, installed, promptInstall };
}

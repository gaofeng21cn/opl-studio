import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { OplStudioShellService, OplStudioShellSnapshot } from "@gaofeng21cn/opl-host-contracts";

export const OPL_STUDIO_SHELL_SERVICE = "oplStudioShell";

function detectLocale(): "zh" | "en" {
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang?.trim().toLowerCase();
    if (htmlLang) return htmlLang.startsWith("zh") ? "zh" : "en";
  }
  if (typeof navigator !== "undefined") {
    const navLang = navigator.language?.trim().toLowerCase();
    if (navLang) return navLang.startsWith("zh") ? "zh" : "en";
  }
  return "zh";
}

/** Reactive locale hook shared across separately bundled DSH UI plugins. */
export function useOplLocale(preferred?: "zh" | "en"): "zh" | "en" {
  const [locale, setLocale] = useState<"zh" | "en">(() => preferred ?? detectLocale());
  useEffect(() => {
    if (preferred) {
      setLocale(preferred);
      return;
    }
    setLocale(detectLocale());
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => setLocale(detectLocale()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [preferred]);
  return preferred ?? locale;
}

/** Subscribe to a Cordis-injected OplStudioShellService snapshot cleanly across CJS plugin bundles. */
export function useOplStudioShellSnapshot(shell: OplStudioShellService): OplStudioShellSnapshot {
  return useSyncExternalStore(shell.subscribe, shell.getSnapshot, shell.getSnapshot);
}

export type OplSettingsNavigationApi = {
  openSettingsDestination?: (
    destination: string,
    focus?: { packageId?: string; resourceId?: string; section?: "libraries" | "remote" }
  ) => void;
  openSoftwareCenter?: (section?: "applications" | "updates" | "resources" | "sources", packageId?: string) => void;
};

export const OplSettingsNavigationContext = createContext<OplSettingsNavigationApi>({});

export function useOplSettingsNavigation(): OplSettingsNavigationApi {
  return useContext(OplSettingsNavigationContext);
}

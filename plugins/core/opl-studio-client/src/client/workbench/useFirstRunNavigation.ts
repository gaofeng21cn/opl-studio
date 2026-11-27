import { useCallback, useEffect, useRef, useState } from "react";

function webEntry() {
  if (typeof window === "undefined" || !/^https?:$/.test(window.location.protocol)) return null;
  return new URL("./", document.baseURI);
}

function replaceEntry(route: "guid" | "first-run") {
  const base = webEntry();
  if (!base) return;
  const url = new URL(window.location.href);
  url.pathname = new URL(route, base).pathname;
  url.searchParams.delete("postLoginSetupCheck");
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/** Only an explicit route or a fresh login may interrupt the current workbench. */
export function useFirstRunNavigation() {
  const [entry] = useState(() => {
    const base = webEntry();
    if (!base) return { home: false, explicit: false, loginDeadline: null };
    const here = new URL(window.location.href);
    const home = here.pathname === base.pathname || here.pathname === new URL("guid", base).pathname;
    const legacy = here.pathname === new URL("startup-gate", base).pathname;
    return {
      home: home || legacy,
      explicit: here.pathname === new URL("first-run", base).pathname,
      loginDeadline: home && here.searchParams.get("postLoginSetupCheck") === "1" ? Date.now() + 20_000 : null
    };
  });
  const [firstRunVisible, setVisible] = useState(entry.explicit);
  const loginDeadline = useRef(entry.loginDeadline);
  const cancelLoginCheck = useCallback(() => { loginDeadline.current = null; }, []);
  const openFirstRun = useCallback(() => {
    cancelLoginCheck();
    replaceEntry("first-run");
    setVisible(true);
  }, [cancelLoginCheck]);
  const completeFirstRun = useCallback(() => {
    cancelLoginCheck();
    replaceEntry("guid");
    setVisible(false);
  }, [cancelLoginCheck]);
  const acceptStartupReadiness = useCallback((ready: boolean | undefined) => {
    const deadline = loginDeadline.current;
    cancelLoginCheck();
    if (ready === false && deadline !== null && Date.now() < deadline) openFirstRun();
  }, [cancelLoginCheck, openFirstRun]);

  useEffect(() => {
    if (entry.home) replaceEntry("guid");
    if (entry.loginDeadline === null) return;
    // A user can already type or navigate while the owner is answering.
    document.addEventListener("pointerdown", cancelLoginCheck, true);
    document.addEventListener("keydown", cancelLoginCheck, true);
    return () => {
      document.removeEventListener("pointerdown", cancelLoginCheck, true);
      document.removeEventListener("keydown", cancelLoginCheck, true);
    };
  }, [entry, cancelLoginCheck]);
  return { firstRunVisible, openFirstRun, completeFirstRun, acceptStartupReadiness };
}

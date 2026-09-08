export type SettingsSearchTarget = {
  label: string;
  pageLabel: string;
  subpageLabel?: string;
  rowLabel?: string;
};

/** Add Studio navigation and keyboard semantics around the unchanged plugin. */
export function installSettingsSearchInteraction(root: HTMLElement, readTargets: () => SettingsSearchTarget[], readLocale: () => "zh" | "en"): () => void {
  let navigationObserver: MutationObserver | undefined;
  let navigationTimeout: ReturnType<typeof setTimeout> | undefined;
  let activeOption = -1;
  let previousQuery = "";
  const input = () => root.querySelector<HTMLInputElement>(".sss-input");
  const options = () => [...root.querySelectorAll<HTMLElement>(".sss-item")];
  const annotate = () => {
    const field = input();
    if (!field) return;
    if (field.value !== previousQuery) { activeOption = -1; previousQuery = field.value; }
    const rows = options();
    field.setAttribute("role", "combobox");
    field.setAttribute("aria-label", readLocale() === "zh" ? "搜索设置" : "Search settings");
    field.setAttribute("aria-expanded", String(rows.length > 0));
    field.setAttribute("aria-autocomplete", "list");
    const popup = root.querySelector<HTMLElement>(".sss-pop");
    if (popup) { popup.id = "opl-settings-search-results"; popup.setAttribute("role", "listbox"); }
    field.setAttribute("aria-controls", "opl-settings-search-results");
    rows.forEach((row, index) => {
      row.id = `opl-settings-search-result-${index}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === activeOption));
      row.style.outline = index === activeOption ? "2px solid currentColor" : "";
      row.style.outlineOffset = "-2px";
    });
    if (rows[activeOption]) field.setAttribute("aria-activedescendant", rows[activeOption].id);
    else field.removeAttribute("aria-activedescendant");
    const clear = root.querySelector(".sss-clear");
    clear?.setAttribute("aria-label", readLocale() === "zh" ? "清空设置搜索" : "Clear settings search");
  };
  const clearNavigation = () => { navigationObserver?.disconnect(); navigationObserver = undefined; clearTimeout(navigationTimeout); };
  const navigate = (target: SettingsSearchTarget) => {
    clearNavigation();
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const buttons = () => [...dialog.querySelectorAll<HTMLButtonElement>("button")];
    const page = buttons().find((button) => button.textContent?.trim() === target.pageLabel && !button.closest(".settings-subnav"));
    if (!page) return;
    input()?.blur();
    page.click();
    const finish = () => {
      if (target.subpageLabel) {
        const subpage = buttons().find((button) => button.closest(".settings-subnav") && button.textContent?.trim() === target.subpageLabel);
        if (!subpage) return;
        if (subpage.getAttribute("aria-current") !== "page") { subpage.click(); return; }
      }
      if (target.rowLabel) {
        const title = [...dialog.querySelectorAll<HTMLElement>(".settings-page span, .settings-page label, .settings-page div")]
          .find((node) => node.childElementCount === 0 && node.textContent?.trim() === target.rowLabel);
        if (!title) return;
        const row = title.closest<HTMLElement>(".settings-row") ?? title.parentElement?.parentElement;
        if (!row) return;
        row.scrollIntoView({ block: "nearest" });
        row.animate([{ outline: "2px solid currentColor" }, { outline: "2px solid transparent" }], { duration: 1600 });
        (row.querySelector<HTMLElement>("button:not([disabled]), input, select") ?? page).focus();
      } else {
        const heading = dialog.querySelector<HTMLElement>(".settings-page h1");
        if (!heading) return;
        heading.tabIndex = -1;
        heading.focus();
      }
      clearNavigation();
    };
    navigationObserver = new MutationObserver(finish);
    navigationObserver.observe(dialog, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    navigationTimeout = setTimeout(clearNavigation, 1500);
    queueMicrotask(finish);
  };
  const activate = (event: Event) => {
    const row = (event.target as Element | null)?.closest(".sss-item");
    if (!row) return;
    const label = row.querySelector(".sss-item-label")?.textContent?.trim();
    const target = readTargets().find((candidate) => candidate.label === label);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(target);
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.target !== input()) return;
    const rows = options();
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && rows.length) {
      event.preventDefault();
      event.stopPropagation();
      activeOption = activeOption < 0 ? (event.key === "ArrowDown" ? 0 : rows.length - 1)
        : (activeOption + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      annotate();
      rows[activeOption].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && rows.length) {
      event.preventDefault();
      event.stopPropagation();
      rows[Math.max(activeOption, 0)].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
  };
  const observer = new MutationObserver(annotate);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("mousedown", activate, true);
  root.addEventListener("keydown", keyboard, true);
  annotate();
  return () => { observer.disconnect(); clearNavigation(); root.removeEventListener("mousedown", activate, true); root.removeEventListener("keydown", keyboard, true); };
}

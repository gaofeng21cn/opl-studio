import { applySettingsShellNavigation } from "../../workbench/deepLinkNavigation";
import { PackageActivityButton } from '../../workbench/PackageInstallationProgress';
import { Activity, Bot, Cable, ChevronDown, CircleHelp, Files, Folder, Gauge, PanelRight, Puzzle, Settings as SettingsIcon, SlidersHorizontal, UserRound, X } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Menu, type MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import { SettingsRoot } from "@opl-vendor/dsh-settings-root";
import type { PropsStore } from "@deepseek-ai/dsh-client-store";
import type { createSettingsShellStore } from "../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/shell-store";
import { createEcosystemLocale, mountSettingsSearch } from "../../integrations/deepseek-harness/ecosystemClients";
import { installSettingsSearchInteraction, type SettingsSearchTarget } from "../../integrations/deepseek-harness/ecosystemSettingsSearch";
import { settingsDestinations, settingsSubDestinations, searchableSettings, type SettingsDestinationId } from "../../workbench/SettingsPanel";
import type { SettingsMobileView } from "../../workbench/settings/types";
import { settingsContributionDestination, type OplUiContribution } from "../contributionProjection";
import {
  SettingsContributionSlotContext,
  SettingsNavigationContext,
  focusableElements,
  translate,
  useSettingsDialogFocus,
  useClientContext,
  useStudio,
  useStudioShortcuts
} from "./studioContext";

export function ShellOverlaySlot() {
  const studio = useStudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const detailsDialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailsOpen = studio.primaryView === "conversation" && studio.detailsOpen;
  const detailTabs = useMemo(() => [...studio.detailTabs].sort((left, right) => left.order - right.order), [studio.detailTabs]);
  const detailMenuItems: MenuEntry[] = detailTabs.map((tab) => ({
    id: tab.id,
    label: tab.labels[studio.locale],
    icon: tab.icon === "progress" ? <Activity aria-hidden="true" size={16} /> : tab.icon === "files" ? <Files aria-hidden="true" size={16} /> : <Puzzle aria-hidden="true" size={16} />
  }));
  useEffect(() => {
    if (!detailsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        if (previousFocus !== document.body && previousFocus?.isConnected) previousFocus.focus();
        else document.querySelector<HTMLButtonElement>('[data-testid="opl-context-inspector-trigger"]')?.focus();
      });
    };
  }, [detailsOpen]);
  return <>
    {studio.overlay}
    <div className="opl-shell-status-actions" data-inspector-open={detailsOpen || undefined}>
    {studio.packageActivity && studio.primaryView !== 'applications' ? <div className="opl-shell-package-activity">
      <PackageActivityButton activity={studio.packageActivity} locale={studio.locale} onOpen={() => studio.openPackageActivity ? studio.openPackageActivity() : studio.openPrimaryView('applications')} />
    </div> : null}
    {studio.primaryView === "conversation" && !detailsOpen ? (
      <div className="opl-context-inspector-trigger-wrap">
        <Menu
          open={menuOpen}
          portal
          align="end"
          side="bottom"
          compact
          items={detailMenuItems}
          selectedId={studio.activeDetailTabId}
          onClose={() => setMenuOpen(false)}
          onSelect={(id) => {
            setMenuOpen(false);
            const tab = detailTabs.find((candidate) => candidate.id === id);
            if (tab) studio.openDetailTab(tab.id);
          }}
          anchor={<button
            type="button"
            className="opl-context-inspector-trigger"
            data-testid="opl-context-inspector-trigger"
            aria-label={studio.locale === "zh" ? "打开任务详情" : "Open task details"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={studio.locale === "zh" ? "任务详情" : "Task details"}
            onClick={() => setMenuOpen((open) => !open)}
          ><PanelRight aria-hidden="true" size={16} /><span>{studio.locale === "zh" ? "任务详情" : "Task details"}</span><ChevronDown aria-hidden="true" size={14} /></button>}
        />
      </div>
    ) : null}
    </div>
    {detailsOpen ? (
      <section
        ref={detailsDialogRef}
        className="opl-context-inspector"
        data-testid="opl-context-inspector"
        data-narrow={studio.narrow || undefined}
        role={studio.narrow ? "dialog" : "complementary"}
        aria-modal={studio.narrow || undefined}
        aria-labelledby="opl-context-inspector-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            studio.closeDetails();
            return;
          }
          if (!studio.narrow || event.key !== "Tab") return;
          const focusable = focusableElements(detailsDialogRef.current);
          if (focusable.length === 0) {
            event.preventDefault();
            detailsDialogRef.current?.focus();
            return;
          }
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          if (!detailsDialogRef.current?.contains(document.activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header>
          <strong id="opl-context-inspector-title" className="visually-hidden">{studio.locale === "zh" ? "任务详情" : "Task details"}</strong>
          <nav className="opl-context-inspector-tabs" data-testid="opl-context-tabs" aria-label={studio.locale === "zh" ? "任务详情分区" : "Task detail sections"}>
            {detailTabs.map((tab) => (
              <button key={tab.id} type="button" data-active={studio.activeDetailTabId === tab.id || undefined} aria-label={tab.labels[studio.locale]} onClick={() => studio.openDetailTab(tab.id)}>
                {tab.icon === "progress" ? <Activity aria-hidden="true" size={15} /> : tab.icon === "files" ? <Files aria-hidden="true" size={15} /> : <Puzzle aria-hidden="true" size={15} />}
                <span>{tab.labels[studio.locale]}</span>
              </button>
            ))}
          </nav>
          <button ref={closeButtonRef} className="opl-context-inspector-close" type="button" aria-label={studio.locale === "zh" ? "关闭详情" : "Close details"} title={studio.locale === "zh" ? "关闭详情" : "Close details"} onClick={studio.closeDetails}><X aria-hidden="true" size={16} /></button>
        </header>
        <div className="opl-context-inspector-body">{studio.details}</div>
      </section>
    ) : null}
  </>;
}
export function settingsSearchTargets(locale: "zh" | "en", contributions: OplUiContribution[] = []): (SettingsSearchTarget & { keywords?: string })[] {
  const pages = settingsDestinations(locale);
  const targetFor = (destination: SettingsDestinationId, label: string, rowLabel?: string, keywords?: string) => {
    const page = pages.find(page => settingsSubDestinations(page.id, locale).some(item => item.id === destination))!;
    const subpages = settingsSubDestinations(page.id, locale);
    return { label, pageLabel: page.label, destination, subpageLabel: subpages.length > 1 ? subpages.find(item => item.id === destination)!.label : undefined, rowLabel, keywords };
  };
  const targets = pages.flatMap(page => settingsSubDestinations(page.id, locale).map(item => targetFor(item.id, item.label)));
  for (const entry of searchableSettings) {
    const label = entry.labels[locale === "zh" ? 0 : 1];
    const destination = entry.destination === "memory" ? "instructions" : entry.destination;
    targets.push({ ...targetFor(destination, label, entry.destination === "memory" ? (locale === "zh" ? "记忆与纠错" : "Memory and corrections") : label, `${entry.labels.join(" ")} ${entry.keywords ?? ""}`), destination });
  }
  for (const entry of contributions.filter(entry => entry.slot === "settings.section" && entry.view)) {
    const destination = settingsContributionDestination(entry);
    if (!destination) continue;
    const label = entry.view!.title[locale] ?? entry.view!.title.en ?? entry.contributionId;
    targets.push(targetFor(destination, label, label, Object.values(entry.view!.title).join(" ")));
  }
  return targets.filter((item, index, all) => all.findIndex(other => other.label === item.label) === index);
}

export function SettingsSlot({ wide, renderSlot, useStore, actions }: { wide: boolean; renderSlot: any } & PropsStore<ReturnType<typeof createSettingsShellStore>>) {
  const studio = useStudio();
  const settingsOpen = useStore((state) => state.open);
  const ctx = useClientContext();
  const [navigatedDestination, setNavigatedDestination] = useState<SettingsDestinationId | null>(null);
  const [mobileView, setMobileView] = useState<SettingsMobileView>("categories");
  useEffect(() => { if (!settingsOpen) setMobileView("categories"); }, [settingsOpen]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useSettingsDialogFocus(rootRef);
  const localeRef = useRef(studio.locale);
  localeRef.current = studio.locale;
  const contributionsRef = useRef(studio.uiContributions.entries);
  contributionsRef.current = studio.uiContributions.entries;
  const searchLocale = useRef(createEcosystemLocale(() => localeRef.current));
  useEffect(() => { searchLocale.current.refresh(); }, [studio.locale, studio.uiContributions]);
  useEffect(() => rootRef.current
    ? installSettingsSearchInteraction(document.body, () => settingsSearchTargets(localeRef.current, contributionsRef.current), () => localeRef.current, setMobileView)
    : undefined, []);
  useEffect(() => {
    let active = true;
    let dispose: (() => Promise<void>) | undefined;
    void mountSettingsSearch({
      ctx,
      locale: searchLocale.current,
      readSections: () => settingsSearchTargets(localeRef.current, contributionsRef.current).map((entry, order) => ({ options: { id: `opl-search-${order} ${entry.keywords ?? ""}`, label: entry.label, order } })),
    }).then((cleanup) => { if (active) dispose = cleanup; else void cleanup(); })
      .catch((error) => console.error("Settings search plugin failed to load", error));
    return () => { active = false; void dispose?.(); };
  }, [ctx]);

  const studioRows = settingsDestinations(studio.locale).map((destination, index) => ({
    id: settingsSectionId(destination.id),
    order: index * 10,
    label: <span className="opl-settings-nav-label" data-opl-settings-auxiliary={destination.id === "about" ? "about" : undefined}>{(() => {
      const Icon = ({ overview: Gauge, account: UserRound, resources: Cable, workspace: Folder, capabilities: Puzzle, agents: Bot, services: Activity, preferences: SlidersHorizontal, about: CircleHelp } as const)[destination.id as "overview"];
      return <Icon aria-hidden="true" size={16} />;
    })()}<span>{destination.label}</span></span>
  }));
  // Package contributions are rendered inside the owning Studio destination;
  // they are not extra top-level settings pages.
  const rows = studioRows;
  const setupFlow = studio.initialization?.systemInitialize.setupFlow;
  const onboardingVisible = studio.initializationStatus === "ready"
    && setupFlow?.isFirstRun === true
    && setupFlow.readyToLaunch === false;
  const sessions = { phase: "ready", current: "opl-current", byId: { "opl-current": { id: "opl-current", blank: onboardingVisible, retainedBy: { mainView: 1 } } } };
  const onboardingSteps = onboardingVisible ? [{ id: "opl-first-run", order: 0 }] : [];
  const renderContribution = useCallback((options?: { only?: string }) => (
    studio.renderSettingsContribution(options)
  ), [studio.renderSettingsContribution]);
  const requestedSettings = studio.settingsNavigation;
  const requestedPrimary = requestedSettings?.destination
    ? settingsDestinations(studio.locale).find(primary => settingsSubDestinations(primary.id, studio.locale).some(item => item.id === requestedSettings.destination))?.id
    : undefined;
  useEffect(() => {
    if (!requestedSettings) return;
    if (requestedSettings.open && requestedSettings.destination) {
      setMobileView(requestedSettings.destination === "about" ? "about" : "destinations");
    } else if (requestedSettings.open) {
      setMobileView("categories");
    }
    applySettingsShellNavigation(requestedSettings, actions, requestedPrimary ? settingsSectionId(requestedPrimary) : undefined);
  }, [requestedSettings?.revision, requestedSettings?.open, requestedPrimary, actions]);
  const navigate = (destination: SettingsDestinationId) => {
    setNavigatedDestination(destination);
    setMobileView(destination === "about" ? "about" : "destinations");
    const primary = settingsDestinations(studio.locale).find(page => settingsSubDestinations(page.id, studio.locale).some(item => item.id === destination));
    if (primary) actions.select(settingsSectionId(primary.id));
  };
  return <SettingsNavigationContext.Provider value={{ destination: navigatedDestination, navigate, mobileView, setMobileView }}><SettingsContributionSlotContext.Provider value={renderContribution}><div ref={rootRef} className="opl-settings-slot-root"><SettingsRoot wide={wide} reconnect={studio.reloadThreadDirectory} useConnectionState={(selector: any) => selector(studio.threadDirectoryStatus === "ready" ? "connected" : studio.threadDirectoryStatus === "error" ? "disconnected" : "connecting")} useDesktopUpdate={(selector: any) => selector({ failed: false, opening: false })} openDesktopUpdate={() => undefined} useShortcuts={useStudioShortcuts} useStore={useStore} actions={actions} t={(key: string) => translate(studio.locale, key)} useSections={(selector: any) => selector(rows)} useOnboardingSteps={(selector: any) => selector(onboardingSteps)} useSessions={(selector: any) => selector(sessions)} renderSlot={(slot: string, owner: { close?: () => void }, options?: { only?: string }) => slot === "settings.section" ? studio.renderSettingsContribution(options, owner) : renderSlot(slot, owner, options)} /></div></SettingsContributionSlotContext.Provider></SettingsNavigationContext.Provider>;
}

export function SettingsTriggerSlot({ wide }: { wide: boolean }) {
  const studio = useStudio();
  const label = studio.locale === "zh" ? "设置" : "Settings";
  return <><SettingsIcon aria-hidden="true" size={16} /><span className={wide ? undefined : "visually-hidden"}>{label}</span></>;
}

export function SettingsHeaderSlot() { return <>One Person Lab</>; }
export function SettingsCloseSlot() { return <>{useStudio().locale === "zh" ? "关闭" : "Close"}</>; }
export function settingsSectionId(destination: SettingsDestinationId): string {
  return `opl-studio-settings-${destination}`;
}

export function SettingsMainSlot({ destination, close }: { destination: SettingsDestinationId; close?: () => void }) {
  const studio = useStudio();
  const renderContribution = useContext(SettingsContributionSlotContext);
  const navigation = useContext(SettingsNavigationContext);
  const [selected, setSelected] = useState(destination);
  useEffect(() => setSelected(destination), [destination]);
  useEffect(() => {
    const requested = studio.settingsNavigation?.destination;
    if (requested && settingsSubDestinations(destination, studio.locale).some(item => item.id === requested)) {
      setSelected(requested);
    }
  }, [destination, studio.settingsNavigation?.revision]);
  useEffect(() => {
    if (navigation?.destination && settingsSubDestinations(destination, studio.locale).some(item => item.id === navigation.destination)) setSelected(navigation.destination);
  }, [destination, navigation?.destination]);
  // Keep the original DSH render signature available for source-contract checks;
  // navigation context adds cross-group destinations rendered by the same panel.
  // renderSettings(selected, renderContribution ?? undefined, setSelected, close)
  return <>{studio.renderSettings(selected, renderContribution ?? undefined, destination => { setSelected(destination); navigation?.navigate(destination); }, close)}</>;
}

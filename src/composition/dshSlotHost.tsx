import { useCallback, useEffect, useRef } from "react";
import { IconAlarmClockOutlineRegular, IconAppsAddOutlineRegular, IconGaugeOutlineRegular } from "../vendor/deepseek-harness/packages/client/ui-primitives/src/icons/index.tsx";
import type { Context } from "@deepseek-ai/cordis";
import { installIconSprite } from "../integrations/deepseek-harness/iconSprite.mjs";
import { SlotRegistry } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { PanelIcon } from "../integrations/deepseek-harness/sidebarComponents.mjs";
import { createSettingsShellStore } from "../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/shell-store.ts";
import { CodexThreadScope } from "./codexThreadScope";
import type { OplStudioSurface } from "./oplStudioSurface";
import { createSlotRenderer } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx";
import App from "../workbench/App";
import { ProjectedContribution } from "./contributionComponents";
import type { OplClientContributionsService } from "./clientCordis";
import {
  OPL_UI_CONTRIBUTION_SLOTS,
  type OplUiContribution,
  type OplUiContributionsProjection
} from "./contributionProjection";
import { installWorkspaceClientPlugin } from "./workspaceClientPlugin";
import { settingsDestinations } from "../workbench/SettingsPanel";
import {
  SettingsSlot,
  SettingsMainSlot,
  SettingsTriggerSlot,
  SettingsHeaderSlot,
  SettingsCloseSlot,
  ShellOverlaySlot,
  settingsSectionId,
} from "./dshSlotHost-parts/shellSettingsSlots";
import { installStudioMenus } from "./dshSlotHost-parts/studioMenus";
import { FirstRunOnboardingSlot } from "./dshSlotHost-parts/firstRunOnboarding";
import {
  ConversationBodySlot,
  ConversationHeaderSlot,
  ConversationSlot,
  ApplicationMainSlot,
  RuntimeMainSlot,
  SchedulesMainSlot,
  OplBrandMarkSlot,
  SidebarSlot,
  SidebarPanelActionsSlot,
  SidebarLeadingSlot,
  SidebarWorkspacesSlot,
  StudioFrame
} from "./dshSlotHost-parts/navigationSlots";
import {
  ComposerModelSlot,
  ComposerOverlaySlot,
  DetailsSlot,
  EmptyAttachmentSlot,
  HeroActionsSlot,
  InputBarSlot,
  OplBrandNameSlot,
  QueueDockSlot
} from "./dshSlotHost-parts/composerSlots";
import {
  SlotCoreContext,
  ClientContext,
  useStudio
} from "./dshSlotHost-parts/studioContext";

type ActiveRegistration = { fingerprint: string; dispose(): void };

function CodexScopedFrame({ surface, renderSlot, scope }: { surface: OplStudioSurface; renderSlot: any; scope: CodexThreadScope }) {
  useEffect(() => { scope.select(surface.currentThreadId); }, [scope, surface.currentThreadId]);
  useEffect(() => () => scope.select(undefined), [scope]);
  return <StudioFrame surface={surface} renderSlot={renderSlot} />;
}

function OplStudioRoot({
  renderSlot,
  contributions,
  slotHost
}: {
  renderSlot: any;
  contributions: OplClientContributionsService;
  slotHost: OplStudioDshSlotHost;
}) {
  const latestHostState = useRef<unknown>(null);

  useEffect(() => {
    const unsubscribe = contributions.subscribe((projection) => slotHost.replaceHostDerivedProjection(projection));
    contributions.updateHostState(latestHostState.current);
    return () => {
      unsubscribe();
      slotHost.clearProjection();
    };
  }, [contributions, slotHost]);

  const updateHostState = useCallback((state: unknown) => {
    latestHostState.current = state;
    contributions.updateHostState(state);
  }, [contributions, slotHost]);
  const clearHostState = useCallback(() => {
    latestHostState.current = null;
    contributions.updateHostState(null);
    slotHost.clearProjection();
  }, [contributions, slotHost]);

  return <ClientContext.Provider value={slotHost.ctx}><SlotCoreContext.Provider value={slotHost.core}><App detailTabs={contributions.detailsTabs} renderShell={(surface) => <CodexScopedFrame surface={surface} renderSlot={renderSlot} scope={slotHost.threadScope} />} renderContributionSlot={(slot, owner, options) => renderSlot(slot, owner, options)} onHostStateChange={updateHostState} onHostStateDispose={clearHostState} /></SlotCoreContext.Provider></ClientContext.Provider>;
}

export class OplStudioDshSlotHost {
  readonly core: SlotRegistry;
  readonly threadScope: CodexThreadScope;
  private readonly registrations = new Map<string, ActiveRegistration>();

  constructor(readonly ctx: Context, private readonly contributions: OplClientContributionsService) {
    new SlotRegistry(ctx);
    // Use the Cordis service proxy so registrations and stores belong to this
    // client plugin's fiber, including contributions added after initial mount.
    this.core = ctx.get("slots", false) as SlotRegistry;
    this.threadScope = new CodexThreadScope(ctx);
    this.core.installScope("session", this.threadScope);
    this.core.install(createSlotRenderer());
    ctx.effect(() => this.core.onEntryError((key, entry, error) => console.error("OPL Studio UI slot failed", { slot: key, registrant: entry.registrant, error })));
    this.registerStaticSlots();
    installIconSprite(ctx, undefined);
    try { installStudioMenus(ctx); }
    catch (error) { console.error("OPL Studio context menu installation failed", error); throw error; }
    ctx.effect(() => () => this.clearProjection());
  }

  private registerStaticSlots() {
    const register = (spec: Record<string, unknown>, component: unknown) => this.core.register(spec as any, component as any);
    const registerFactory = (spec: Record<string, unknown>, component: unknown) => this.core.registerFactory(spec as any, component as any);
    register({ name: "root", registrant: "opl-studio", inject: () => ({ slotHost: this, contributions: this.contributions }), children: { sidebar: { kind: "single", scope: "root" }, main: { kind: "keyed", scope: "root" }, rightbar: { kind: "single", scope: "root" }, "shell.bottom": { kind: "single", scope: "root" }, "shell.overlay": { kind: "list", scope: "root" }, "shell.leading": { kind: "single", scope: "root" }, "composer.palette": { kind: "list", scope: "root" }, "runtime.detail": { kind: "list", scope: "root" }, "settings.section": { kind: "list", scope: "root" } } }, OplStudioRoot);
    register({ name: "sidebar", registrant: "dsh-ui-sidebar", children: { "sidebar.brand.mark": { kind: "single", scope: "root" }, "sidebar.brand.name": { kind: "single", scope: "root" }, "sidebar.workspaces": { kind: "single", scope: "root", inject: { hooks: { sectionScroller: (_standard: unknown, hookContext: any) => hookContext.useSectionScroller } } }, "sidebar.settings": { kind: "single", scope: "root" }, "sidebar.footer.action": { kind: "list", scope: "root" }, "sidebar.panellist.actions": { kind: "list", scope: "root" }, "sidebar.toggle.badge": { kind: "single", scope: "root" } } }, SidebarSlot);
    registerFactory({ name: "sidebar.panel.icon", scope: "root", children: { "sidebar.panellist": { kind: "list", scope: "root" } } }, PanelIcon);
    register({ name: "sidebar.panellist.actions", id: "opl-sidebar-panel-actions", registrant: "opl-studio" }, SidebarPanelActionsSlot);
    register({ name: "sidebar.panellist", id: "applications", order: 10, registrant: "opl-studio" }, ({ size }: { size: number }) => <IconAppsAddOutlineRegular size={size} />);
    register({ name: "sidebar.panellist", id: "runtime", order: 20, registrant: "opl-studio" }, ({ size }: { size: number }) => <IconGaugeOutlineRegular size={size} />);
    register({ name: "sidebar.panellist", id: "schedules", order: 30, registrant: "opl-studio" }, ({ size }: { size: number }) => <IconAlarmClockOutlineRegular size={size} />);
    register({ name: "shell.leading", registrant: "dsh-ui-sidebar" }, SidebarLeadingSlot);
    register({ name: "sidebar.brand.mark", registrant: "opl-studio" }, OplBrandMarkSlot);
    register({ name: "sidebar.brand.name", registrant: "opl-studio" }, OplBrandNameSlot);
    register({ name: "sidebar.workspaces", registrant: "opl-studio" }, SidebarWorkspacesSlot);
    register({ name: "sidebar.settings", registrant: "dsh-ui-settings", store: createSettingsShellStore, children: { "settings.launcher": { kind: "single", scope: "root" }, "settings.trigger": { kind: "single", scope: "root" }, "settings.header": { kind: "single", scope: "root" }, "settings.action": { kind: "list", scope: "root" }, "settings.close": { kind: "single", scope: "root" }, "settings.section.icon": { kind: "list", scope: "root", inline: true }, "settings.onboarding": { kind: "list", scope: "root" } } }, SettingsSlot);
    register({ name: "settings.trigger", registrant: "opl-studio" }, SettingsTriggerSlot);
    register({ name: "settings.header", registrant: "opl-studio" }, SettingsHeaderSlot);
    register({ name: "settings.close", registrant: "opl-studio" }, SettingsCloseSlot);
    register({ name: "settings.onboarding", id: "opl-first-run", order: 0, registrant: "opl-studio" }, FirstRunOnboardingSlot);
    for (const [order, destination] of settingsDestinations("en").entries()) {
      register(
        { name: "settings.section", id: settingsSectionId(destination.id), order: order * 10, label: destination.label, registrant: "opl-studio" },
        (props: { close?: () => void }) => <SettingsMainSlot destination={destination.id} close={props.close} />
      );
    }
    register({ name: "main", key: "conversation", registrant: "dsh-ui-conversation", children: {
      "conversation.header": { kind: "single", scope: "root" },
      "conversation.session": { kind: "single", scope: "root" },
      "conversation.composer.bar": { kind: "single", scope: "root" },
      "conversation.input.dock": { kind: "list", scope: "root" },
      "conversation.hero.frame": { kind: "hoc", scope: "root" },
      "conversation.hero.brand.mark": { kind: "single", scope: "root" },
      "conversation.hero.workspace": { kind: "single", scope: "root" },
      "conversation.hero.agentPreset": { kind: "single", scope: "root" },
      "conversation.hero.options": { kind: "list", scope: "root" },
    } }, ConversationSlot);
    register({ name: "main", key: "applications", registrant: "opl-studio" }, ApplicationMainSlot);
    register({ name: "main", key: "runtime", registrant: "opl-studio" }, RuntimeMainSlot);
    register({ name: "main", key: "schedules", registrant: "opl-studio" }, SchedulesMainSlot);
    register({ name: "conversation.hero.brand.mark", registrant: "opl-studio" }, OplBrandMarkSlot);
    register({ name: "conversation.header", registrant: "opl-studio" }, ConversationHeaderSlot);
    register({ name: "conversation.session", registrant: "opl-studio" }, ConversationBodySlot);
    register({ name: "conversation.composer.bar", registrant: "dsh-ui-conversation", children: { "conversation.input.attachments": { kind: "single", scope: "root" }, "conversation.input.permission": { kind: "single", scope: "root" }, "conversation.input.plan": { kind: "single", scope: "root" }, "conversation.input.model": { kind: "single", scope: "root" }, "conversation.input.activity": { kind: "single", scope: "root" }, "conversation.input.overlay": { kind: "single", scope: "root" }, "conversation.input.left": { kind: "list", scope: "root" }, "conversation.input.right": { kind: "list", scope: "root" }, "conversation.composer.dock": { kind: "list", scope: "root" } } }, InputBarSlot);
    register({ name: "conversation.input.attachments", registrant: "opl-studio" }, EmptyAttachmentSlot);
    register({ name: "conversation.input.overlay", registrant: "opl-studio" }, ComposerOverlaySlot);
    register({ name: "conversation.input.model", registrant: "opl-studio" }, ComposerModelSlot);
    register({ name: "conversation.input.dock", id: "queue", order: 20, registrant: "dsh-ui-conversation" }, QueueDockSlot);
    register({ name: "conversation.hero.agentPreset", registrant: "opl-studio" }, HeroActionsSlot);
    register({ name: "rightbar", registrant: "opl-studio" }, DetailsSlot);
    register({ name: "shell.overlay", id: "opl-studio-overlay", order: 0, registrant: "opl-studio" }, ShellOverlaySlot);
  }

  renderRoot() {
    return this.core.renderSlot("root", {});
  }

  installWorkspaceClient() {
    return installWorkspaceClientPlugin(this.core, useStudio);
  }

  // Package occupants come only from the Framework Host projection. Static DSH
  // registrations define renderer structure, not a second Package graph.
  replaceHostDerivedProjection(projection: OplUiContributionsProjection) {
    const next = new Map(projection.entries.map((entry) => [entry.contributionKey, entry]));
    for (const [key, active] of this.registrations) {
      const entry = next.get(key); const fingerprint = entry ? JSON.stringify(entry) : null;
      if (!entry || fingerprint !== active.fingerprint) { active.dispose(); this.registrations.delete(key); }
    }
    for (const entry of projection.entries) if (!this.registrations.has(entry.contributionKey)) this.registerContribution(entry);
  }

  clearProjection() { for (const active of this.registrations.values()) active.dispose(); this.registrations.clear(); }

  private registerContribution(entry: OplUiContribution) {
    const fingerprint = JSON.stringify(entry);
    const Component = () => { const studio = useStudio(); return <ProjectedContribution entry={entry} owner={studio.contributionOwner} />; };
    const dispose = this.core.register({ name: entry.slot, id: entry.contributionKey, order: entry.sortOrder, label: entry.contributionId, registrant: entry.packageId } as any, Component as any);
    this.registrations.set(entry.contributionKey, { fingerprint, dispose });
  }
}

export { OPL_UI_CONTRIBUTION_SLOTS };
export { settingsSearchTargets } from "./dshSlotHost-parts/shellSettingsSlots";

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../plugins/core/opl-studio-client/src/client/integrations/deepseek-harness/theme";
import { codexWorkbenchStyles } from "../../plugins/core/opl-studio-client/src/client/workbench/codexWorkbenchStyles";
import { ResourcesSettingsPage } from "../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/ResourcesSettingsPage";
import { ApplicationManagementPage } from "../../plugins/core/opl-studio-client/src/client/workbench/ApplicationManagementPage";
import { deriveWorkbenchModelFromState } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel";
import { readKnowledgeSourcesProjection } from "../../plugins/core/opl-studio-client/src/client/workbench/knowledgeSources";
import { settingsDefaults } from "../../plugins/core/opl-studio-client/src/client/workbench/settingsModel";
import { buildSettingsActionViewModel } from "../../plugins/core/opl-studio-client/src/client/workbench/settingsActions";
import type { ResourceSettingsFocus } from "../../plugins/core/opl-studio-client/src/client/workbench/settings/types";

// Shipped components over deterministic owner readbacks. No private registry is written.
function Fixture() {
  const [page, setPage] = useState("settings");
  const [theme, setTheme] = useState("light");
  const [focus, setFocus] = useState<ResourceSettingsFocus>();
  const [revision, setRevision] = useState(1);
  const [name, setName] = useState("财务与投资资料");
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState("ready");
  document.documentElement.dataset.theme = theme;
  document.body.toggleAttribute("data-ds-dark-theme", theme === "dark");
  const settings = { ...settingsDefaults, locale: "zh" as const };
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [{ package_id: "capital", display_name: "Capital Compass", catalog_origin: "opl", catalog_scope: "software", installed: true, app_enabled: true, presence: { callable: true }, miniapp_entry: { resource_uri: "ui://fixture/app" } }] } }, settings_control_center: { app_settings_read_model: { connections: { authorization: {
    surface_kind: "opl_connection_authorization_projection.v1",
    connections: [{ connection_id: "work-mail", display_name: "工作邮箱", provider_type: "email", status: "connected", account_label: "name@example.test", capabilities: [] }],
    grants: [{ grant_id: "example-grant", request_id: "example-request", status: "granted", consumer_package_id: "capital", consumer_display_name: "Capital Compass", connection_id: "work-mail", connection_display_name: "工作邮箱", capability_ids: ["mail.read"] }], requests: [], invocations: []
  } } } } } });
  const actions = [
    { action_id: "knowledge_source_check", payload_fields: ["resource_id"] },
    { action_id: "knowledge_source_connect", payload_fields: ["context_id", "vault_path", "registry_path", "source_id", "label", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"], confirmation_required: true },
    { action_id: "knowledge_source_configure", payload_fields: ["resource_id", "label", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"], confirmation_required: true },
    { action_id: "knowledge_source_disconnect", payload_fields: ["resource_id", "expected_revision"], confirmation_required: true },
  ];
  model.knowledgeSources = readKnowledgeSourcesProjection({ surface_kind: "opl_knowledge_sources_projection.v1", status: "available",
    contexts: [{ context_id: "personal", label: "个人财务与投资", selected: true, revision: `context-${revision}`, scope_options: [{ id: "personal.finance", label: "个人财务与投资" }], default_scope_ids: ["personal.finance"] }],
    available_consumers: [{ domain_id: "capital", label: "Capital Compass", package_id: "capital" }, { domain_id: "capital-research", label: "Capital Compass", package_id: "capital" }, { domain_id: "writing", label: "Book Forge", package_id: "writing" }], available_actions: actions,
    items: [{ resource_id: "knowledge:finance", source_id: "internal.finance.notes", label: name, context_id: "personal", connected: true, status: source,
      scope_ids: ["personal.finance"], consumer_domain_ids: ["capital"], write_domain_ids: ["capital"], consumer_package_ids: ["capital"], access_editable: true, scope_expansion_allowed: false, available_scope_ids: ["personal.finance"], revision_identity: `revision-${revision}`,
      authorization: { status: "authorized" }, revision: { status: "current" }, freshness: { status: "fresh", observed_at: "2026-11-17T00:00:00Z" }, readiness: { status: source }, action_ids: actions.map(action => action.action_id),
      knowledge_health: { current_count: 6, review_due_count: 2, inactive_count: 0, unavailable_count: 0, checked_count: 8, truncated: false, issues: [{ knowledge_id: "internal.finance.review", status: "review_due", reason: "knowledge_review_overdue" }] } },
      { resource_id: "knowledge:legacy", source_id: "internal.project.notes", label: "internal.project.notes", context_id: "personal", connected: true, status: "ready", consumer_domain_ids: ["capital"], scope_ids: ["personal.finance"], write_domain_ids: [], action_ids: [] }]
  });
  model.applicationManagement = { sharedResources: [] };
  const openSettings = (_destination: string, nextFocus?: ResourceSettingsFocus) => { setFocus(nextFocus); setPage("settings"); };
  return <><style>{codexWorkbenchStyles}{"body{margin:0;overflow:auto}#root{height:auto;min-height:100vh}.resource-fixture{max-width:940px;margin:0 auto;padding:24px;background:var(--dsw-alias-bg-base);min-height:100vh}.resource-fixture nav{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}"}</style>
    <main className="resource-fixture"><p className="settings-inline-note">交互验收示例 · 不修改真实资料或授权</p>
      <nav><button className="settings-action-button" onClick={() => setPage("software")}>软件中心</button><button className="settings-action-button" onClick={() => { setFocus(undefined); setPage("settings"); }}>设置</button><button className="settings-action-button" onClick={() => setPage("legacy")}>旧共享资源深链</button><button className="settings-action-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>切换主题</button><button className="settings-action-button" onClick={() => setSource(source === "ready" ? "attention" : "ready")}>切换资料状态</button></nav>
      <h1>{page === "settings" ? "资料与连接" : "软件中心"}</h1>
      {saved ? <p role="status">已从来源重新读取设置</p> : null}
      {page === "settings" ? <ResourcesSettingsPage key={JSON.stringify(focus)} {...({ model, settings, zh: true, projection: model.settingsProjection, actionBusyKey: null, dockerDiagnostic: null, resourceFocus: focus, onRefresh() {}, onAction(request: any) { if (request.payload.label) { setName(request.payload.label); setRevision(value => value + 1); setSaved(true); } }, onOpenSoftwareCenter() { setPage("software"); }, navigate() {}, renderSettingsContributions() { return null; } } as any)} /> : <ApplicationManagementPage key={page} model={model} settings={settings} managedUpdate={null} actionViewModel={buildSettingsActionViewModel(model, null)} nativeAppUpdate={null} actionBusyKey={null} onAction={() => {}} onRefresh={() => {}} initialTab={page === "legacy" ? "resources" : "applications"} onOpenSettings={openSettings} />}
    </main></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

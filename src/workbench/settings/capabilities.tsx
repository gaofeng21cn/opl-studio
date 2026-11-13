import { AlertCircle, Boxes, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import type { CodexInstalledCapability, CodexCapabilityCatalog } from "../../bridge/oplBridge";
import type { AgentPackageLifecycleRef } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";

import { SettingsContextDestinationId } from "./types";
import { SettingsGroup, SettingRow, StatusValue, OfficialDshCapability } from "./primitives";
import { localizedPackageDescription, agentPackagePresentationStatus, packageDependencyPresentationStatus, isCapabilityCatalogPackage } from "./packages";

export const officialDshCapabilities: OfficialDshCapability[] = [
  { id: "dsh-plugin-manager", pluginIds: ["@deepseek-ai/dsh-plugin-manager", "plugin-manager"], label: { zh: "插件管理", en: "Plugin management" }, description: { zh: "吸收 DSH 的插件发现、详情和设置入口，安装与启用动作交给 OPL Package owner。", en: "Reuse DSH discovery, details, and settings entry points while OPL Package owners execute install and enable actions." }, owner: { zh: "Framework / Package owner", en: "Framework / Package owner" }, integrated: true },
  { id: "dsh-auto-review", pluginIds: ["@deepseek-ai/dsh-experimental-auto-review", "auto-review"], label: { zh: "Auto Review", en: "Auto Review" }, description: { zh: "吸收审阅开关和拒绝后的继续/停止交互，审批事实仍由 Codex owner 回读。", en: "Reuse review controls and continue/stop decisions after denial; Codex remains the approval owner." }, owner: { zh: "Codex / App Server", en: "Codex / App Server" }, integrated: true },
  { id: "dsh-shortcuts", pluginIds: ["@deepseek-ai/dsh-client-ui-shortcuts", "shortcuts"], label: { zh: "快捷键", en: "Keyboard shortcuts" }, description: { zh: "吸收 DSH 的搜索、编辑、冲突提示和恢复默认；绑定属于 App 本地偏好。", en: "Reuse DSH search, editing, conflict warnings, and reset flow; bindings are App-local preferences." }, owner: { zh: "App / Shell local", en: "App / Shell local" }, integrated: true },
  { id: "dsh-time-context", pluginIds: ["@deepseek-ai/dsh-time-context", "time-context"], label: { zh: "时间上下文", en: "Time context" }, description: { zh: "提供可选的时间上下文，每次发送更新日期、时间和时区，不读取日历。", en: "Optionally include the current date, time and timezone with each message; no calendar access." }, owner: { zh: "Codex / Context owner", en: "Codex / Context owner" }, integrated: true },
  { id: "dsh-schedule", pluginIds: ["@deepseek-ai/dsh-schedule", "@deepseek-ai/dsh-client-ui-schedule", "schedule"], label: { zh: "计划任务", en: "Scheduled tasks" }, description: { zh: "DSH 的任务表单、重复规则和运行历史已由 OPL Workbench Services 接入。", en: "DSH task forms, recurrence rules, and run history are integrated through OPL Workbench Services." }, owner: { zh: "Framework / Temporal", en: "Framework / Temporal" }, integrated: true },
  { id: "dsh-inspector", pluginIds: ["@deepseek-ai/dsh-experimental-inspector", "inspector"], label: { zh: "任务 Inspector", en: "Task inspector" }, description: { zh: "DSH Inspector 的详情分栏由 OPL typed projection 驱动，默认保持按需打开。", en: "The DSH Inspector pattern is driven by OPL typed projections and remains on-demand by default." }, owner: { zh: "OPL App projection", en: "OPL App projection" }, integrated: true },
  { id: "dsh-voice-input", pluginIds: ["@deepseek-ai/dsh-experimental-client-ui-voice-input", "voice-input"], label: { zh: "语音输入", en: "Voice input" }, description: { zh: "吸收 DSH 的入口、未就绪引导和权限状态；识别服务由支持的浏览器提供，不支持时提示系统听写。", en: "Browser speech recognition inserts text into the draft; unsupported runtimes explain how to use system dictation." }, owner: { zh: "Capability / connection owner", en: "Capability / connection owner" }, integrated: true }
];

export function officialDshCapabilityStatus(capability: OfficialDshCapability, plugins: CodexInstalledCapability[], locale: WorkbenchSettings["locale"]): { status: string; detail: string } {
  if (capability.integrated) return { status: "integrated", detail: locale === "zh" ? `界面已接入；实际可用性请查看对应页面 · ${capability.owner.zh}` : `UI integrated; check its page for runtime availability · ${capability.owner.en}` };
  const plugin = plugins.find((item) => capability.pluginIds.includes(item.id) || capability.pluginIds.includes(item.name));
  if (plugin?.enabled && plugin.callable) return { status: "available", detail: locale === "zh" ? `已启用 · ${capability.owner.zh}` : `Enabled · ${capability.owner.en}` };
  if (plugin?.enabled) return { status: "attention_needed", detail: locale === "zh" ? `已安装，等待功能接入 · ${capability.owner.zh}` : `Installed; integration pending · ${capability.owner.en}` };
  return { status: "planned", detail: locale === "zh" ? `待接入 · ${capability.owner.zh}` : `Ready for adoption · ${capability.owner.en}` };
}

export function CapabilityDirectory({
  catalog,
  packageLifecycle,
  status,
  error,
  locale,
  showTechnicalDetails,
  onRefresh,
  onNavigate,
  onOpenSchedules
}: {
  catalog: CodexCapabilityCatalog;
  onNavigate?: (destination: SettingsContextDestinationId) => void;
  onOpenSchedules?: () => void;
  packageLifecycle: AgentPackageLifecycleRef[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  locale: WorkbenchSettings["locale"];
  showTechnicalDetails: boolean;
  onRefresh: () => void;
  readMemory?: () => Promise<import("../../bridge/oplBridge").OplFullDrilldownReadback>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const capabilityPackages = packageLifecycle.filter(isCapabilityCatalogPackage).map((item) => ({
    id: item.packageId,
    name: item.label,
    description: localizedPackageDescription(item, locale),
    status: item.installed === true ? "installed" : agentPackagePresentationStatus(item),
    detail: locale === "zh" ? "模块安装状态。能否使用连接功能，还取决于账户、权限和相应服务。" : "Module installation status. Connected features also require accounts, permissions and services.",
    technical: item.sourceRef
  }));
  const dependencyPackages = packageLifecycle.flatMap((owner) => owner.dependencies.map((dependency) => ({
    id: dependency.packageId,
    name: dependency.packageId,
    description: locale === "zh"
      ? `${owner.label} 的必需能力包`
      : `Required capability package for ${owner.label}`,
    status: dependency.present === true ? "installed" : packageDependencyPresentationStatus(dependency),
    detail: locale === "zh" ? "动态依赖" : "Dynamic dependency",
    technical: `${owner.sourceRef}#dependency_readiness.checks`
  })));
  const officialItems = officialDshCapabilities.map((capability) => {
    const presentation = officialDshCapabilityStatus(capability, catalog.plugins, locale);
    return {
      id: capability.id,
      name: capability.label[locale],
      description: capability.description[locale],
      status: presentation.status,
      detail: presentation.detail,
      technical: capability.pluginIds.join(" · ")
    };
  });
  const capabilityPackageItems = [...capabilityPackages, ...dependencyPackages].filter((item, index, items) => (
    items.findIndex((candidate) => candidate.id === item.id) === index
  ));
  const groups = [
    {
      id: "capability-packages",
      label: locale === "zh" ? "能力模块" : "Capability packages",
      items: capabilityPackageItems
    },
    {
      id: "skills",
      label: locale === "zh" ? "技能" : "Skills",
      items: catalog.skills.map((item) => ({
        id: item.name,
        name: item.name,
        description: item.description,
        status: item.enabled ? "enabled" : "disabled",
        detail: item.scope,
        technical: item.path
      }))
    },
    {
      id: "plugins",
      label: locale === "zh" ? "插件" : "Plugins",
      items: catalog.plugins.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        status: item.enabled && item.callable ? "available" : item.enabled ? "checking" : "disabled",
        detail: locale === "zh" ? "扩展已启用不代表外部账户已连接；连接状态请查看软件中心的“共享资源”。" : "An enabled extension does not imply a connected account. See Shared resources in Software Center.",
        technical: item.id
      }))
    },
    {
      id: "apps",
      label: locale === "zh" ? "连接应用" : "Connected apps",
      items: catalog.apps.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        status: item.enabled && item.callable ? "available" : item.enabled ? "checking" : "disabled",
        detail: locale === "zh" ? "扩展已启用不代表外部账户已连接；连接状态请查看软件中心的“共享资源”。" : "An enabled extension does not imply a connected account. See Shared resources in Software Center.",
        technical: item.id
      }))
    }
  ].map((group) => ({
    ...group,
    visible: group.items.filter((item) => (category === "all" || category === group.id)
      && (!normalizedQuery || `${item.name} ${item.description} ${item.detail}`.toLowerCase().includes(normalizedQuery)))
  }));
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const visibleTotal = groups.reduce((sum, group) => sum + group.visible.length, 0);
  const refreshLabel = locale === "zh" ? "刷新能力目录" : "Refresh capability directory";

  return (
    <section className="settings-capability-directory" data-testid="opl-settings-capability-directory">
      <SettingsGroup title={locale === "zh" ? "按用途配置" : "Configure by purpose"}>
        {([{ destination: "resources", zh: "连接账户与外部应用", en: "Connect accounts and apps" }, { destination: "agents", zh: "安装专业智能体", en: "Install specialist agents" }, { destination: "instructions", zh: "调整助手行为", en: "Customize assistant behavior" }, { destination: "memory", zh: "查看与纠正记忆", en: "Review and correct memory" }] as const).map(item => <SettingRow key={item.destination} label={item[locale]}><button type="button" className="settings-inline-command" onClick={() => onNavigate?.(item.destination)}>{locale === "zh" ? "打开" : "Open"}</button></SettingRow>)}
        {onOpenSchedules ? <SettingRow label={locale === "zh" ? "安排自动任务" : "Schedule work"}><button className="settings-inline-command" onClick={onOpenSchedules}>{locale === "zh" ? "打开计划任务" : "Open scheduled tasks"}</button></SettingRow> : null}
      </SettingsGroup>
      <div className="settings-capability-toolbar">
        <label className="settings-search-field">
          <Search aria-hidden="true" size={14} />
          <input aria-label={locale === "zh" ? "搜索能力模块、技能、插件和应用" : "Search capability packages, skills, plugins, and apps"} value={query} onChange={(event) => { setQuery(event.currentTarget.value); if (event.currentTarget.value) setCategory("all"); }} placeholder={locale === "zh" ? "搜索能力模块、技能、插件和应用" : "Search capability packages, skills, plugins, and apps"} />
        </label>

      </div>
      <div className="settings-capability-filters" role="group" aria-label={locale === "zh" ? "能力类型" : "Capability type"}>
        <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>{locale === "zh" ? "全部" : "All"}</button>
        {groups.map((group) => <button key={group.id} type="button" aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.label}<span>{group.items.length}</span></button>)}
      </div>
      <div className="settings-capability-summary">
        <span>{locale === "zh" ? `${visibleTotal} 条目录记录` : `${visibleTotal} catalog records`}</span>
        <span>{catalog.source === "codex_app_server" ? (locale === "zh" ? "不同类型可能属于同一产品，数量不代表独立功能数" : "Records may belong to the same product; counts are not independent features") : (locale === "zh" ? "能力目录尚未连接" : "Capability catalog is not connected")}</span>
      </div>
      {status === "error" ? <div className="settings-inline-notice" role="alert"><AlertCircle aria-hidden="true" size={15} /><span>{error || (locale === "zh" ? "能力目录读取失败" : "Capability catalog could not be read")}</span></div> : null}
      {status !== "loading" && status !== "error" && visibleTotal === 0 ? (
        <div className="settings-empty-state"><Boxes aria-hidden="true" size={18} /><span>{normalizedQuery
          ? (locale === "zh" ? "没有匹配的能力，请尝试其他关键词或类型。" : "No matching capabilities. Try another search or type.")
          : (locale === "zh" ? "当前分类暂无能力。" : "No capabilities in this category yet.")}</span>
          {normalizedQuery || category !== "all" ? <button type="button" className="settings-action-button" onClick={() => { setQuery(""); setCategory("all"); }}>{locale === "zh" ? "清除筛选" : "Clear filters"}</button> : null}
        </div>
      ) : null}
      {groups.map((group) => group.visible.length ? (
        <section className="settings-capability-group" key={group.id}>
          <h2>{group.label}<span>{group.visible.length}</span></h2>
          <div className="settings-capability-list">
            {group.visible.map((item) => (
              <details className="settings-capability-row" key={`${group.id}:${item.id}`}>
                <summary>
                  <span className="settings-capability-copy"><strong>{item.name}</strong>{item.description && item.description !== item.name ? <small>{item.description}</small> : null}</span>
                  <span className="settings-capability-state"><StatusValue status={item.status} locale={locale} /><ChevronDown aria-hidden="true" size={14} /></span>
                </summary>
                <div className="settings-capability-details">
                  <span>{item.description || (locale === "zh" ? "使用任务输入框中的能力选择器调用；此目录不改变启用状态。" : "Use the composer capability picker to invoke it. This catalog does not change enablement.")}</span>
                  <small>{item.detail}</small>
                  {group.id === "apps" ? <button className="settings-inline-command" type="button" onClick={() => onNavigate?.("resources")}>{locale === "zh" ? "管理连接" : "Manage connections"}</button> : null}
                  {showTechnicalDetails ? <code>{item.technical}</code> : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null)}
      <details className="settings-upstream-details">
        <summary>{locale === "zh" ? "DSH 能力接入详情" : "DSH capability integration details"}</summary>
        <p>{locale === "zh" ? "以下是基础能力的接入进度，不计入可用能力目录。" : "Integration progress for upstream features; these are not counted as available capabilities."}</p>
        {officialItems.map((item) => (
          <details key={item.id} className="settings-capability-row">
            <summary><strong>{item.name}</strong><StatusValue status={item.status} locale={locale} /></summary>
            <div className="settings-capability-details"><p>{item.description}</p><small>{item.detail}</small></div>
          </details>
        ))}
      </details>
    </section>
  );
}

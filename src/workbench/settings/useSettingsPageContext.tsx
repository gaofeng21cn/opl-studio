import { startupCheckPresentation } from "../startupCheckPresentation";

import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { autoModelLabel, codexModelPolicy, modelLabel, reasoningLabel } from "../modelPolicy";
import type { SettingKey, WorkbenchSettings } from "../settingsModel";

import { buildSettingsActionViewModel, type GatewayActionViewModel } from "../settingsActions";

import { SettingsDestinationId, SettingsPanelProps } from "../settings/types";
import { navigationCopy, navigationGroups, settingsPagePresentationFor } from "../settings/navigation";
import { statusTone, gatewayConnectionPresentation, gatewayModelAccessState } from "../settings/presentation";

import { agentPackagePresentationStatus, agentPackageHasHomeShortcutRoute, agentAvailabilityDetail, isAgentCatalogPackage } from "../settings/packages";

export function useSettingsPageContext({
  mobileNavigation,
  model,
  managedUpdate,
  actionViewModel: projectedActionViewModel,
  settings,
  modelOptions,
  resolvedModel,
  resolvedReasoning,
  resolvedReasoningOptions,
  stateStatus,
  stateError,
  carrierDiagnostics,
  initializationStatus,
  initialization,
  nativeAppUpdate,
  maintenanceStatus,
  maintenanceError,
  dockerDiagnostic,
  capabilityCatalog,
  capabilityStatus,
  capabilityError,
  onRefreshCapabilities,
  activeDestination,
  onNavigate,
  onRefresh,
  readMemory,
  workbenchServices,
  onClose,
  onOpenSchedules,
  onRefreshInitialization,
  setupCapabilities,
  onChooseWorkspaceRoot,
  onInstallCodex,
  onConfigureCodexApiKey,
  onChangeLogDirectory,
  onOpenLogDirectory,
  currentWorkspace,
  onOpenWorkspace,
  onSettingChange,
  onReasoningChange,
  additionalConversationInstructions,
  onAdditionalConversationInstructionsChange,
  onAction,
  onHostAction,
  onGatewayLogin,
  onApproveConnectionAccess,
  manifestInstallAction,
  actionBusyKey,
  actionFeedback,
  actionReceipt,
  pendingConfirmation,
  onConfirmAction,
  onCancelAction,
  renderPackageContributions
}: SettingsPanelProps) {

  const groups = useMemo(() => navigationGroups(settings.locale), [settings.locale]);
  const locale = settings.locale === "zh" ? "zh-CN" : "en-US";
  const copy = navigationCopy[settings.locale].destinations;
  const [subDestination, setSubDestination] = useState<SettingsDestinationId | null>(null);
  const selectedDestination = !onNavigate && subDestination
    ? subDestination
    : activeDestination;
  const activeGroup = groups.find((group) => group.destinations.some((destination) => destination.id === selectedDestination));
  const pagePresentation = settingsPagePresentationFor(selectedDestination, settings.locale);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [localNotice, setLocalNotice] = useState("");
  const [permissionConfirmation, setPermissionConfirmation] = useState(false);
  const [permissionAcknowledged, setPermissionAcknowledged] = useState(false);
  const refreshPage = () => {
    setRefreshRevision(value => value + 1);
    onRefresh();
    if (["capabilities", "resources"].includes(selectedDestination)) onRefreshCapabilities();
    if (selectedDestination === "overview") onRefreshInitialization();
  };
  const serviceRevision = `${actionReceipt?.receiptId ?? ""}:${refreshRevision}`;
  const navigate = (destination: SettingsDestinationId | "memory") => {
    if (destination === "memory") {
      if (onNavigate) onNavigate("instructions");
      else setSubDestination("instructions");
      mobileNavigation?.setView("destinations");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const memory = document.querySelector<HTMLDetailsElement>("#settings-memory-context");
        if (!memory) return;
        memory.open = true;
        memory.scrollIntoView({ block: "start", behavior: "smooth" });
        memory.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      }));
      return;
    }
    if (onNavigate) onNavigate(destination);
    else setSubDestination(destination);
  };
  const runLocal = async (action: () => Promise<unknown>) => { try { await action(); setLocalNotice(""); } catch { setLocalNotice(settings.locale === "zh" ? "操作未完成，请重试。" : "Action failed. Please retry."); } };
  const projection = model.settingsProjection;
  const runtime = model.runtimeOverview;
  const gateway = model.gatewayAccount;
  const [gatewayEmail, setGatewayEmail] = useState("");
  const [gatewayPassword, setGatewayPassword] = useState("");
  const [accessSetupMode, setAccessSetupMode] = useState<"account" | "api_key">("account");
  const [editingAccess, setEditingAccess] = useState(false);
  const [codexApiKey, setCodexApiKey] = useState("");
  const confirmationDialogRef = useRef<HTMLElement | null>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement | null>(null);
  const feedbackDestinationRef = useRef<SettingsDestinationId | null>(null);
  const confirmationOpen = pendingConfirmation !== null;
  const derivedActionViewModel = useMemo(() => buildSettingsActionViewModel(model, managedUpdate), [managedUpdate, model]);
  const actionViewModel = projectedActionViewModel ?? derivedActionViewModel;
  const unavailableFixedModel = settings.modelAccess !== "__auto" && !resolvedModel;
  const stateLoading = stateStatus === "loading";
  const stateFailed = stateStatus === "error";
  const statePlaceholder = stateLoading
    ? (settings.locale === "zh" ? "正在读取" : "Loading")
    : "--";
  const gatewayUnavailableLabel = stateLoading
    ? (settings.locale === "zh" ? "正在读取" : "Reading")
    : stateFailed
      ? (settings.locale === "zh" ? "暂时不可用" : "Temporarily unavailable")
      : (settings.locale === "zh" ? "尚未配置" : "Not configured");
  const gatewayUnavailableDetail = stateLoading
    ? (settings.locale === "zh" ? "正在读取 OPL App 状态" : "Reading OPL App state")
    : stateFailed
      ? (settings.locale === "zh" ? "刷新状态后重试" : "Refresh state to retry")
      : (settings.locale === "zh" ? "可在“账户与访问”中配置" : "Configure it in Account & Access");
  const readbackStatus = stateLoading ? "loading" : stateFailed ? "attention_needed" : "ready";
  const startupCheck = startupCheckPresentation(initialization, initializationStatus, settings.locale === "zh");
  const initializationPresentationStatus = startupCheck.status;
  const initializationDetail = startupCheck.detail;
  const gatewayAction = (kind: GatewayActionViewModel["kind"]) => actionViewModel.gatewayActions.find((action) => action.kind === kind);
  const modelAccessState = gatewayModelAccessState(projection);
  const gatewayConnectionState = gatewayConnectionPresentation(projection, gateway, stateStatus);
  const gatewayAccountReady = gatewayConnectionState === "account"
    && gateway !== undefined
    && !["setup_required", "reauth_required"].includes(gateway.status);
  // Auto is resolved by the App-owned policy. A provider projection may still
  // expose its own local default (for example deepseek-flash), which must not
  // be presented as the user's effective OPL model.
  const displayedModelId = settings.modelAccess === "__auto"
    ? resolvedModel?.id ?? projection?.codex.model
    : projection?.codex.model ?? resolvedModel?.id;
  const displayedReasoning = settings.modelAccess === "__auto"
    ? resolvedReasoning
    : projection?.codex.reasoningEffort ?? resolvedReasoning;

  useEffect(() => {
    if (["capabilities", "resources"].includes(selectedDestination) && capabilityStatus === "idle") onRefreshCapabilities();
  }, [capabilityStatus, onRefreshCapabilities, selectedDestination]);

  useEffect(() => {
    if (actionBusyKey !== null) feedbackDestinationRef.current = selectedDestination;
  }, [actionBusyKey, selectedDestination]);

  useEffect(() => {
    if (!confirmationOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationCancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [confirmationOpen]);

  const issues: Array<{ id: string; title: string; detail: string; destination: SettingsDestinationId }> = [];
  const zh = settings.locale === "zh";
  issues.push(...startupCheck.issues);
  if (stateFailed) issues.push({ id: "state", title: zh ? "状态刷新失败" : "Status refresh failed", detail: zh ? "显示上次成功读取的结果，请重试。" : "Showing the last successful read. Please retry.", destination: "diagnostics" });
  if (projection?.codex.accessStatus && statusTone(projection.codex.accessStatus) === "attention") issues.push({ id: "access", title: zh ? "模型访问需要处理" : "Model access needs attention", detail: zh ? "检查账户连接与模型来源。" : "Check your account and model source.", destination: "account" });
  if (runtime && [runtime.temporal.serviceReady, runtime.temporal.workerReady, runtime.temporal.schedulerReady].some(value => value === false)) issues.push({ id: "tasks", title: zh ? "后台任务尚未就绪" : "Background tasks are not ready", detail: zh ? "部分后台执行与定时能力受影响，普通对话可继续。" : "Some background and scheduling capabilities are affected; chat remains available.", destination: "services" });
  for (const carrier of runtime?.carriers.items ?? []) {
    if (statusTone(carrier.status) === "attention") issues.push({ id: `runtime:${carrier.packageId}`, title: carrier.label, detail: zh ? "运行环境检查需要处理，可能影响此能力的任务执行。" : "Runtime checks need attention and may affect this capability.", destination: "services" });
  }
  for (const item of model.packageLifecycle.filter(isAgentCatalogPackage)) {
    if (agentPackagePresentationStatus(item) === "unavailable" || (agentPackagePresentationStatus(item) === "ready" && item.packageRole === "standard_agent" && !agentPackageHasHomeShortcutRoute(item))) {
      issues.push({ id: item.packageId, title: item.label, detail: agentAvailabilityDetail(item, settings.locale), destination: "agents" });
    }
  }
  if (projection?.workspace.writable === false || projection?.workspace.exists === false) issues.push({ id: "workspace", title: zh ? "工作目录无法写入" : "Working directory is not writable", detail: zh ? "选择可访问的目录以保存新项目。" : "Choose an accessible folder for new projects.", destination: "workspace" });
  const issueList = <div className="settings-issue-list">{issues.length ? issues.map(issue => <div className="settings-issue" key={issue.id}><AlertCircle size={16} aria-hidden="true" /><div><strong>{issue.title}</strong><p>{issue.detail}</p></div><button className="settings-inline-command" type="button" onClick={() => navigate(issue.destination)}>{copy[issue.destination]}</button></div>) : <p className="settings-inline-note">{stateStatus === "ready" ? (startupCheck.status === "unknown" || startupCheck.status === "error" ? (zh ? "启动检查结果尚未确认，请在下方重新检查。" : "Startup checks are not confirmed; retry below.") : (zh ? "当前读取范围内没有发现需要处理的问题。" : "No issues found in the current readback.")) : (zh ? "正在确认状态…" : "Checking status…")}</p>}</div>;

  function settingValueLabel(key: SettingKey, value: WorkbenchSettings[SettingKey]): string {
    if (key === "modelAccess") return value === "__auto" ? (settings.locale === "zh" ? "自动" : "Auto") : modelLabel(value as string, settings.locale);
    if (key === "reasoningLevel") return reasoningLabel(value as string, settings.locale, true);
    if (key === "defaultWorkspace") return settings.locale === "zh" ? "当前工作区" : "Current workspace";
    if (key === "runtimeProfile") return value === "fast" ? (settings.locale === "zh" ? "快速" : "Fast") : (settings.locale === "zh" ? "完整" : "Full");
    if (key === "professionalStarterDefaults") return settings.locale === "zh" ? "科研、基金与演示" : "Research, grant, and presentation";
    if (key === "theme") {
      if (value === "system") return settings.locale === "zh" ? "跟随系统" : "System";
      return value === "dark" ? (settings.locale === "zh" ? "深色" : "Dark") : (settings.locale === "zh" ? "浅色" : "Light");
    }
    if (key === "artifactPreviewMode") return settings.locale === "zh" ? "丰富预览（仅引用）" : "Rich preview (refs only)";
    if (typeof value === "boolean") return value ? (settings.locale === "zh" ? "开" : "On") : (settings.locale === "zh" ? "关" : "Off");
    return String(value);
  }

  function renderSettingControl(key: SettingKey) {
    const value = settings[key];
    if (typeof value === "boolean") {
      return (
        <button className="setting-switch" role="switch" aria-checked={value} aria-label={key === "notificationEnabled" ? (settings.locale === "zh" ? "任务完成通知" : "Task completion notifications") : key === "confirmBeforeExecute" ? (settings.locale === "zh" ? "执行前确认" : "Confirm before execute") : (settings.locale === "zh" ? "技术详情" : "Technical details")} type="button" onClick={() => onSettingChange(key, !value)}>
          <span className="setting-switch-track" aria-hidden="true"><span /></span>
          <span>{settingValueLabel(key, value)}</span>
        </button>
      );
    }
    if (key === "locale") {
      return (
        <div className="segmented-control" role="group" data-testid="opl-locale-toggle" aria-label={settings.locale === "zh" ? "语言" : "Language"}>
          <button type="button" data-active={value === "zh"} aria-pressed={value === "zh"} onClick={() => onSettingChange("locale", "zh")}>中文</button>
          <button type="button" data-active={value === "en"} aria-pressed={value === "en"} onClick={() => onSettingChange("locale", "en")}>English</button>
        </div>
      );
    }
    if (key === "reasoningLevel") {
      return (
        <select className="setting-select" data-testid="opl-settings-reasoning" aria-label={settings.locale === "zh" ? "推理强度" : "Reasoning effort"} value={resolvedReasoning} disabled={!resolvedModel} onChange={(event) => onReasoningChange(event.currentTarget.value)}>
          {codexModelPolicy.reasoningOptions.map((effort) => (
            <option key={effort} value={effort} disabled={!resolvedReasoningOptions.includes(effort)}>{reasoningLabel(effort, settings.locale, true)}</option>
          ))}
        </select>
      );
    }
    if (key === "modelAccess") {
      return (
        <select className="setting-select" data-testid="opl-model-access-entry" aria-label={settings.locale === "zh" ? "会话模型" : "Conversation model"} value={value} onChange={(event) => onSettingChange("modelAccess", event.currentTarget.value)}>
          <option value="__auto">{autoModelLabel(settings.locale)}</option>
          {value !== "__auto" && !modelOptions.some((option) => option.id === value) ? (
            <option value={value} disabled>{modelLabel(String(value), settings.locale)} ({settings.locale === "zh" ? "不可用" : "Unavailable"})</option>
          ) : null}
          {modelOptions.map((option) => (
            <option key={option.id} value={option.id} disabled={!option.available}>
              {modelLabel(option.id, settings.locale)}{option.available ? "" : ` (${settings.locale === "zh" ? "不可用" : "Unavailable"})`}
            </option>
          ))}
        </select>
      );
    }
    if (key === "runtimeProfile") {
      return <button className="setting-toggle" type="button" onClick={() => onSettingChange("runtimeProfile", value === "fast" ? "full" : "fast")}>{settingValueLabel(key, value)}</button>;
    }
    return <span>{settingValueLabel(key, value)}</span>;
  }

return { onOpenSchedules, model, managedUpdate, projectedActionViewModel, settings, modelOptions, resolvedModel, resolvedReasoning, resolvedReasoningOptions, stateStatus, stateError, carrierDiagnostics, initializationStatus, initialization, nativeAppUpdate, maintenanceStatus, maintenanceError, dockerDiagnostic, capabilityCatalog, capabilityStatus, capabilityError, onRefreshCapabilities, activeDestination, onNavigate, onRefresh, readMemory, workbenchServices, onClose, onRefreshInitialization, setupCapabilities, onChooseWorkspaceRoot, onInstallCodex, onConfigureCodexApiKey, onChangeLogDirectory, onOpenLogDirectory, currentWorkspace, onOpenWorkspace, onSettingChange, onReasoningChange, additionalConversationInstructions, onAdditionalConversationInstructionsChange, onAction, onHostAction, onGatewayLogin, onApproveConnectionAccess, manifestInstallAction, actionBusyKey, actionFeedback, actionReceipt, pendingConfirmation, onConfirmAction, onCancelAction, renderPackageContributions, groups, locale, copy, subDestination, setSubDestination, activeGroup, selectedDestination, pagePresentation, refreshRevision, setRefreshRevision, localNotice, setLocalNotice, permissionConfirmation, setPermissionConfirmation, permissionAcknowledged, setPermissionAcknowledged, refreshPage, serviceRevision, navigate, runLocal, projection, runtime, gateway, gatewayEmail, setGatewayEmail, gatewayPassword, setGatewayPassword, accessSetupMode, setAccessSetupMode, editingAccess, setEditingAccess, codexApiKey, setCodexApiKey, confirmationDialogRef, confirmationCancelRef, feedbackDestinationRef, confirmationOpen, derivedActionViewModel, actionViewModel, unavailableFixedModel, stateLoading, stateFailed, statePlaceholder, gatewayUnavailableLabel, gatewayUnavailableDetail, readbackStatus, startupCheck, initializationPresentationStatus, initializationDetail, gatewayAction, modelAccessState, gatewayConnectionState, gatewayAccountReady, displayedModelId, displayedReasoning, issues, zh, issueList, settingValueLabel, renderSettingControl };
}
export type SettingsPageContext = ReturnType<typeof useSettingsPageContext>;

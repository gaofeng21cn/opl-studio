import { LoaderCircle, RefreshCw, Wrench } from "lucide-react";

import type { RuntimeMaintenanceActionRef } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";
import type { ManagedCompanionViewModel } from "../managedCompanions";
import { actionPayloadComplete, type SettingsExecutableIntent, type SettingsActionRequest, type SettingsHostActionIntent } from "../settingsActions";

import { SettingRow, SettingsGroup, StatusValue } from "./primitives";

export function RuntimeActionButton({
  action,
  locale,
  busyKey,
  onAction,
  primary = false,
  previewOnly = false
}: {
  action?: RuntimeMaintenanceActionRef;
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  primary?: boolean;
  previewOnly?: boolean;
}) {
  if (!action || !actionPayloadComplete(action.payload, action.requiredPayloadFields)) return null;
  const key = `runtime:${action.actionId}`;
  const labels: Record<string, [string, string]> = {
    settings_check_app_update: ["检查更新", "Check for updates"],
    settings_apply_opl_packages: ["更新能力包", "Update packages"],
    settings_sync_capabilities: ["同步能力", "Sync capabilities"],
    settings_prune_runtime_roots_dry_run: ["检查可清理内容", "Check reclaimable data"],
    provider_service_status: ["检查服务", "Check service"],
    provider_service_start: ["启动服务", "Start service"],
    provider_service_restart: ["重启服务", "Restart service"],
    provider_worker_status: ["检查任务处理", "Check task processing"],
    provider_worker_start: ["启动任务处理", "Start task processing"],
    provider_worker_restart: ["重启任务处理", "Restart task processing"],
    provider_scheduler_status: ["检查定时任务", "Check scheduled tasks"],
    provider_scheduler_install: ["启用定时任务", "Enable scheduled tasks"],
    provider_scheduler_trigger: ["立即运行", "Run now"],
    settings_install_docker_webui: ["安装网页端", "Install WebUI"],
    settings_configure_webui_api_key: ["配置访问密钥", "Configure access key"],
    settings_run_webui_startup_maintenance: ["运行启动维护", "Run startup maintenance"],
    settings_open_docker_webui: ["打开网页端", "Open WebUI"],
    settings_diagnose_docker_webui: ["运行诊断", "Run diagnostics"],
    settings_inventory_agent_package_store: ["刷新智能体与能力用量", "Refresh agents and capabilities usage"],
    settings_inventory_webui_data_volume: ["刷新网页端数据用量", "Refresh WebUI data usage"]
  };
  const label = labels[action.actionId]?.[locale === "zh" ? 0 : 1] ?? action.label;
  const refreshOnly = [
    "settings_check_app_update",
    "settings_sync_capabilities",
    "settings_inventory_agent_package_store",
    "settings_inventory_webui_data_volume",
    "provider_service_status",
    "provider_worker_status",
    "provider_scheduler_status"
  ].includes(action.actionId);
  return (
    <button
      className={`${refreshOnly ? "settings-icon-button" : "settings-action-button"} ${primary ? "primary" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={busyKey !== null}
      onClick={() => onAction({ key, actionId: action.actionId, label, payload: action.payload, confirmationRequired: action.confirmationRequired, previewOnly, dryRunSupported: action.dryRunSupported })}
    >
      {busyKey === key ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : refreshOnly ? <RefreshCw aria-hidden="true" size={13} /> : null}
      {refreshOnly ? <span className="visually-hidden">{label}</span> : label}
    </button>
  );
}

export function ManagedCompanionsGroup({
  companions,
  locale,
  busyKey,
  onAction
}: {
  companions: ManagedCompanionViewModel[];
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
}) {
  const yesNo = (value: boolean) => value
    ? (locale === "zh" ? "是" : "Yes")
    : (locale === "zh" ? "否" : "No");
  return (
    <SettingsGroup title={locale === "zh" ? "OPL 托管" : "OPL managed"}>
      {companions.map((companion) => <div key={companion.providerId} data-testid="opl-managed-companion" data-provider-id={companion.providerId}>
        <SettingRow label={`${companion.productName}${companion.version ? ` ${companion.version}` : ""}`} detail={companion.providerId}>
          <StatusValue status={companion.status} locale={locale} />
        </SettingRow>
        <SettingRow label={locale === "zh" ? "安装与启用" : "Install and enablement"}>
          <span>{locale === "zh"
            ? `已安装 ${yesNo(companion.installed)} · 已注册 ${yesNo(companion.registered)} · 已启用 ${yesNo(companion.enabled)}`
            : `Installed ${yesNo(companion.installed)} · Registered ${yesNo(companion.registered)} · Enabled ${yesNo(companion.enabled)}`}</span>
        </SettingRow>
        <SettingRow label={locale === "zh" ? "权限" : "Permissions"} detail={companion.healthRef}>
          <StatusValue status={companion.permission} locale={locale} />
        </SettingRow>
        {companion.actions.length ? <SettingRow label={locale === "zh" ? "操作" : "Actions"}>
          <span className="runtime-setting-control">
            {companion.actions.map((action) => {
              const key = `managed-companion:${companion.providerId}:${action.actionId}`;
              return <button
                key={action.actionId}
                className={`settings-action-button ${action.dangerLevel === "medium" ? "danger" : ""}`}
                type="button"
                aria-label={action.label}
                title={action.label}
                disabled={busyKey !== null}
                onClick={() => onAction({ key, actionId: action.actionId, label: action.label, payload: {}, confirmationRequired: action.confirmationRequired })}
              >
                {busyKey === key ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Wrench aria-hidden="true" size={13} />}
                {action.label}
              </button>;
            })}
          </span>
        </SettingRow> : null}
      </div>)}
    </SettingsGroup>
  );
}

export function settingsIntentLabel(intent: SettingsExecutableIntent, locale: WorkbenchSettings["locale"]): string {
  if (intent.transport !== "app_action") return intent.label;
  const semanticLabels: Record<string, [string, string]> = {
    refresh: ["刷新", "Refresh"],
    disconnect: ["断开连接", "Disconnect"],
    repair: ["修复", "Repair"],
    complete_setup: ["完成设置", "Complete setup"],
    use_for_model_access: ["切换为 OPL Gateway", "Switch to OPL Gateway"]
  };
  return (intent.semantic ? semanticLabels[intent.semantic]?.[locale === "zh" ? 0 : 1] : undefined) ?? intent.label;
}

export function SettingsIntentButton({
  intent,
  locale,
  busyKey,
  onAction,
  onHostAction,
  primary = false
}: {
  intent?: SettingsExecutableIntent;
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  primary?: boolean;
}) {
  if (!intent || intent.availability !== "ready" || (intent.transport !== "app_action" && !onHostAction)) return null;
  const label = settingsIntentLabel(intent, locale);
  const isRefresh = intent.transport === "app_action"
    ? intent.semantic === "refresh" || intent.semantic === "status" || intent.semantic === "check"
    : intent.operation === "status" || intent.operation === "check";
  return (
    <button
      className={`${isRefresh ? "settings-icon-button" : "settings-action-button"} ${primary ? "primary" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={busyKey !== null}
      onClick={() => intent.transport === "app_action" ? onAction(intent) : onHostAction?.(intent)}
    >
      {busyKey === intent.key
        ? <LoaderCircle className="spin" aria-hidden="true" size={13} />
        : isRefresh ? <RefreshCw aria-hidden="true" size={13} /> : null}
      {isRefresh ? <span className="visually-hidden">{label}</span> : label}
    </button>
  );
}

import { SettingsActionDialog } from "./settings/SettingsActionDialog";

import { RiskConfirmation } from "@deepseek-ai/dsh-client-ui-primitives";

import { FeatureStatusPanel } from "./FeatureStatusPanel";

import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";

import { type SettingsActionRequest } from "./settingsActions";

import { type ThemeKey } from "../vendor/deepseek-harness/packages/client/ui-theme/src/client/locales";
export type { SettingsActionRequest } from "./settingsActions";
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "settings.theme": ThemeKey;
  }
}
import { SettingsPanelProps } from "./settings/types";

import { formatBytes } from "./settings/presentation";

import { OverviewSettingsPage } from "./settings/pages/OverviewSettingsPage";
import { AccountSettingsPage } from "./settings/pages/AccountSettingsPage";
import { ModelsSettingsPage } from "./settings/pages/ModelsSettingsPage";
import { ResourcesSettingsPage } from "./settings/pages/ResourcesSettingsPage";
import { WorkspaceSettingsPage } from "./settings/pages/WorkspaceSettingsPage";
import { StorageSettingsPage } from "./settings/pages/StorageSettingsPage";
import { AgentsSettingsPage } from "./settings/pages/AgentsSettingsPage";
import { CapabilitiesSettingsPage } from "./settings/pages/CapabilitiesSettingsPage";
import { InstructionsSettingsPage } from "./settings/pages/InstructionsSettingsPage";
import { MemorySettingsPage } from "./settings/pages/MemorySettingsPage";
import { SchedulesSettingsPage } from "./settings/pages/SchedulesSettingsPage";
import { ServicesSettingsPage } from "./settings/pages/ServicesSettingsPage";
import { UpdatesSettingsPage } from "./settings/pages/UpdatesSettingsPage";
import { DiagnosticsSettingsPage } from "./settings/pages/DiagnosticsSettingsPage";
import { PreferencesSettingsPage } from "./settings/pages/PreferencesSettingsPage";
import { AboutSettingsPage } from "./settings/pages/AboutSettingsPage";
import { useSettingsPageContext } from "./settings/useSettingsPageContext";
export * from "./settings/types";
export * from "./settings/navigation";
export * from "./settings/presentation";
export * from "./settings/primitives";
export * from "./settings/packages";
export * from "./settings/capabilities";
export * from "./settings/instructions";
export * from "./settings/actions";
export * from "./settings/maintenance";
export function SettingsPanel(props: SettingsPanelProps) {
const context = useSettingsPageContext(props);
const { settings, copy, selectedDestination, zh, stateStatus, actionBusyKey, gatewayAction, onAction, refreshPage, pagePresentation, activeGroup, onNavigate, setSubDestination, localNotice, onRefresh, actionFeedback, feedbackDestinationRef, actionReceipt, model, permissionConfirmation, permissionAcknowledged, setPermissionAcknowledged, setPermissionConfirmation, onSettingChange, pendingConfirmation, confirmationDialogRef, onCancelAction, confirmationCancelRef, onConfirmAction } = context;
function renderContent() { switch (context.selectedDestination) {
case "overview": return <OverviewSettingsPage {...context} />;
case "account": return <AccountSettingsPage {...context} />;
case "models": return <ModelsSettingsPage {...context} />;
case "resources": return <ResourcesSettingsPage {...context} />;
case "workspace": return <WorkspaceSettingsPage {...context} />;
case "storage": return <StorageSettingsPage {...context} />;
case "agents": return <AgentsSettingsPage {...context} />;
case "capabilities": return <CapabilitiesSettingsPage {...context} />;
case "instructions": return <InstructionsSettingsPage {...context} />;
case "memory": return <MemorySettingsPage {...context} />;
case "schedules": return <SchedulesSettingsPage {...context} />;
case "services": return <ServicesSettingsPage {...context} />;
case "updates": return <UpdatesSettingsPage {...context} />;
case "diagnostics": return <DiagnosticsSettingsPage {...context} />;
case "preferences": return <PreferencesSettingsPage {...context} />;
default: return <AboutSettingsPage {...context} />;
} }
return (
    <section data-testid="opl-settings-panel" className="settings-page" aria-label={settings.locale === "zh" ? "设置" : "Settings"}>
      <div className="settings-detail">
        <header className="settings-detail-header">
          <div className="settings-detail-title-row">
            <h1>{copy[selectedDestination]}</h1>
            {selectedDestination !== "preferences" && selectedDestination !== "about" ? (
              <button type="button" className="settings-icon-button settings-page-refresh"
                aria-label={selectedDestination === "account" ? (zh ? "刷新账户与用量" : "Refresh account and usage") : (zh ? "刷新本页" : "Refresh this page")}
                title={selectedDestination === "account" ? (zh ? "刷新账户与用量" : "Refresh account and usage") : (zh ? "刷新本页" : "Refresh this page")}
                disabled={stateStatus === "loading" || actionBusyKey !== null} onClick={() => { const action = gatewayAction("refresh"); if (selectedDestination === "account" && action?.availability === "ready") onAction(action); else refreshPage(); }}>
                <RefreshCw aria-hidden="true" size={16} className={stateStatus === "loading" ? "spin" : undefined} />
              </button>
            ) : null}
          </div>
          <p className="settings-detail-description">{pagePresentation.description}</p>
          {activeGroup && activeGroup.destinations.length > 1 ? (
            <nav className="settings-subnav" aria-label={settings.locale === "zh" ? `${activeGroup.label}分类` : `${activeGroup.label} sections`}>
              {activeGroup.destinations.map((destination) => (
                <button key={destination.id} type="button"
                  aria-current={destination.id === selectedDestination ? "page" : undefined}
                  onClick={() => onNavigate ? onNavigate(destination.id) : setSubDestination(destination.id)}>
                  {destination.label}
                </button>
              ))}
            </nav>
          ) : null}
        </header>
        <div className="settings-content" data-section={selectedDestination}>
          {localNotice ? <p className="settings-inline-note" role="status">{localNotice}</p> : null}
          {stateStatus !== "ready" && selectedDestination !== "preferences" && selectedDestination !== "about" ? (
            <div className="settings-state-notice" role="status" data-testid="opl-settings-state-notice">
              {stateStatus === "loading" ? <LoaderCircle className="spin" aria-hidden="true" size={16} /> : <AlertCircle aria-hidden="true" size={16} />}
              <span>{stateStatus === "loading"
                ? (settings.locale === "zh" ? "正在读取本机设置与能力…" : "Loading settings and capabilities…")
                : (settings.locale === "zh" ? "暂时无法读取最新设置。已有配置已保留，请刷新重试。" : "Settings could not be refreshed. Your configuration is preserved; retry to reconnect.")}</span>
              {stateStatus === "error" ? <button type="button" onClick={onRefresh}>{settings.locale === "zh" ? "重试" : "Retry"}</button> : null}
            </div>
          ) : null}
          {actionFeedback && feedbackDestinationRef.current === selectedDestination ? (
            <div className="settings-action-feedback" data-tone={actionFeedback.tone} role="status">
              {actionFeedback.tone === "success" ? <CheckCircle2 aria-hidden="true" size={15} /> : <AlertCircle aria-hidden="true" size={15} />}
              <span>{actionFeedback.message}</span>
            </div>
          ) : null}
          {actionReceipt && feedbackDestinationRef.current === selectedDestination && <details className="settings-secondary-details settings-action-receipt" data-testid="opl-settings-receipt"><summary>{settings.locale === "zh" ? "操作结果" : "Action result"}</summary><p>{actionReceipt.summary}</p><p>{actionReceipt.nextStep}</p>{actionReceipt.selectedBytes !== undefined || actionReceipt.expectedRemainingBytes !== undefined ? <p>{settings.locale === "zh" ? `本次释放 ${formatBytes(actionReceipt.selectedBytes, settings.locale)}，预计保留 ${formatBytes(actionReceipt.expectedRemainingBytes, settings.locale)}` : `Release ${formatBytes(actionReceipt.selectedBytes, settings.locale)}; expected remaining ${formatBytes(actionReceipt.expectedRemainingBytes, settings.locale)}`}</p> : null}{actionReceipt.readbackStatus ? <p>{settings.locale === "zh" ? `执行后重新盘点：${actionReceipt.readbackStatus === "confirmed" ? "已确认" : "暂不可用"}${actionReceipt.actualRemainingBytes !== undefined ? `，当前占用 ${formatBytes(actionReceipt.actualRemainingBytes, settings.locale)}` : ""}` : `Post-action inventory: ${actionReceipt.readbackStatus}${actionReceipt.actualRemainingBytes !== undefined ? `; current usage ${formatBytes(actionReceipt.actualRemainingBytes, settings.locale)}` : ""}`}</p> : null}{actionReceipt.recoverability ? <p>{settings.locale === "zh" ? `恢复能力：${actionReceipt.recoverability === "not_restorable" ? "不可恢复" : actionReceipt.recoverability}` : `Recovery: ${actionReceipt.recoverability}`}</p> : null}{actionReceipt.protectedFromChange?.length ? <p>{settings.locale === "zh" ? `未改变：${actionReceipt.protectedFromChange.join("、")}` : `Unchanged: ${actionReceipt.protectedFromChange.join(", ")}`}</p> : null}<small>{settings.locale === "zh" ? `技术回执：${actionReceipt.receiptId ?? "--"}` : `Technical receipt: ${actionReceipt.receiptId ?? "--"}`}</small></details>}
          {stateStatus === "ready" || model.settingsProjection || ["preferences", "about"].includes(selectedDestination) ? renderContent() : null}
          {selectedDestination === "diagnostics" ? <FeatureStatusPanel features={model.features} locale={settings.locale} destination="overview"
            onNavigate={destination => onNavigate ? onNavigate(destination) : setSubDestination(destination)}
            onRefresh={refreshPage} onAction={onAction} busy={actionBusyKey !== null} /> : null}
        </div>
      </div>
      <RiskConfirmation open={permissionConfirmation} title={zh ? "启用完整权限" : "Enable full access"}
        description={zh ? "完整权限允许任务修改本机文件。" : "Full access allows the task to modify local files."}
        acknowledgeLabel={zh ? "我了解此权限" : "I understand this access"} cancelLabel={zh ? "取消" : "Cancel"}
        closeLabel={zh ? "关闭" : "Close"} confirmLabel={zh ? "启用" : "Enable"}
        acknowledged={permissionAcknowledged} onAcknowledgedChange={setPermissionAcknowledged}
        onCancel={() => setPermissionConfirmation(false)} onConfirm={() => { if (permissionAcknowledged) { onSettingChange("agentPermissions", ":danger-full-access"); setPermissionConfirmation(false); } }} />
      <SettingsActionDialog settings={settings} pendingConfirmation={pendingConfirmation} actionBusyKey={actionBusyKey} onCancelAction={onCancelAction} onConfirmAction={onConfirmAction} />
    </section>
  );
}

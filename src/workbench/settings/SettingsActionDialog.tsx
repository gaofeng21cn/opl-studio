import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Wrench, LoaderCircle } from "lucide-react";
import { trapDialogFocus, formatStatus, formatBytes } from "./presentation";
import type { SettingsPanelProps } from "./types";
export function SettingsActionDialog({ settings, pendingConfirmation, actionBusyKey, onCancelAction, onConfirmAction }: Pick<SettingsPanelProps, "settings" | "pendingConfirmation" | "actionBusyKey" | "onCancelAction" | "onConfirmAction">) {
 const confirmationDialogRef = useRef<HTMLElement>(null);
 const confirmationCancelRef = useRef<HTMLButtonElement>(null);
 const open = Boolean(pendingConfirmation);
 useEffect(() => { if (!open) return; const previous = document.activeElement; confirmationCancelRef.current?.focus(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, [open]);
 return (pendingConfirmation ? createPortal(
        <div className="settings-action-dialog-backdrop" role="presentation">
          <section
            ref={confirmationDialogRef}
            className="settings-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-action-dialog-title"
            data-testid="opl-settings-action-confirmation"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancelAction();
                return;
              }
              trapDialogFocus(event, confirmationDialogRef.current);
            }}
          >
            <div className="settings-action-dialog-icon"><Wrench aria-hidden="true" size={18} /></div>
            <div>
              <h2 id="settings-action-dialog-title">{pendingConfirmation.request.label}</h2>
              <p>{pendingConfirmation.request.actionId === "official_profile_restore"
                ? (settings.locale === "zh" ? "将安装或修复当前官方组合中缺少的智能体和必需能力，包括此前主动卸载的项目。已有项目、会话和用户文件会保留。" : "Install or repair missing agents and required capabilities in the current official combination, including previously uninstalled items. Existing projects, conversations, and user files are preserved.")
                : pendingConfirmation.request.actionId === "gateway_account_use_for_model_access"
                ? (settings.locale === "zh"
                    ? "确认后，本机新会话将默认通过 OPL Gateway 访问模型。账户本身不会被修改。"
                    : "New conversations on this device will use OPL Gateway for model access by default. The account itself will not be changed.")
                : (settings.locale === "zh" ? "检查已完成。确认后将执行此操作并刷新最新状态。" : "The check is complete. Confirm to run this action and refresh the latest status.")}</p>
              {pendingConfirmation.preview && <div data-testid="opl-action-preview-detail"><p>{pendingConfirmation.preview.owner}</p><p>{pendingConfirmation.preview.summary}</p><p>{pendingConfirmation.preview.affectedCategories.join(" · ")}</p><p>{pendingConfirmation.preview.nextStep}</p>{pendingConfirmation.preview.selectedBytes !== undefined || pendingConfirmation.preview.expectedRemainingBytes !== undefined ? <p>{settings.locale === "zh" ? `将释放 ${formatBytes(pendingConfirmation.preview.selectedBytes, settings.locale)}，预计保留 ${formatBytes(pendingConfirmation.preview.expectedRemainingBytes, settings.locale)}` : `Will release ${formatBytes(pendingConfirmation.preview.selectedBytes, settings.locale)}; expected remaining ${formatBytes(pendingConfirmation.preview.expectedRemainingBytes, settings.locale)}`}</p> : null}{pendingConfirmation.preview.recoverability ? <p>{settings.locale === "zh" ? `恢复能力：${pendingConfirmation.preview.recoverability === "not_restorable" ? "不可恢复" : pendingConfirmation.preview.recoverability}` : `Recovery: ${pendingConfirmation.preview.recoverability}`}</p> : null}{pendingConfirmation.preview.protectedFromChange?.length ? <p>{settings.locale === "zh" ? `不会改变：${pendingConfirmation.preview.protectedFromChange.join("、")}` : `Will not change: ${pendingConfirmation.preview.protectedFromChange.join(", ")}`}</p> : null}{pendingConfirmation.preview.affectedFiles?.length ? <ul style={{ maxHeight: 180, overflow: "auto" }}>{pendingConfirmation.preview.affectedFiles.map(file => <li key={file.name}>{file.name} · {formatBytes(file.bytes, settings.locale)}</li>)}</ul> : null}</div>}
              <small>{settings.locale === "zh" ? "预检查" : "Preview"}: {formatStatus(pendingConfirmation.previewStatus, settings.locale)}</small>
            </div>
            <div className="settings-action-dialog-actions">
              <button ref={confirmationCancelRef} type="button" onClick={onCancelAction}>{settings.locale === "zh" ? "取消" : "Cancel"}</button>
              <button className="primary" type="button" onClick={onConfirmAction} disabled={actionBusyKey !== null}>
                {actionBusyKey ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
                {pendingConfirmation.request.actionId === "gateway_account_use_for_model_access"
                  ? (settings.locale === "zh" ? "切换为 OPL Gateway" : "Switch to OPL Gateway")
                  : (settings.locale === "zh" ? "确认执行" : "Confirm")}
              </button>
            </div>
          </section>
        </div>,
        document.body) : null);
}

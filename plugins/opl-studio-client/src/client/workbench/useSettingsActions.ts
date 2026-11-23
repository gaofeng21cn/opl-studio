import { useEffect, useRef, useState } from "react";
import type { OplActionReceipt, OplBridge } from "../bridge/oplBridge";
import { actionReceiptView, type ActionReceiptView } from "./actionReceiptView";
import { dockerDiagnosticFromReceipt } from "./appProjection";
import { preparePackageOperationRequest } from "./packageOperations";
import type { SettingsActionFeedback, SettingsDockerDiagnostic } from "./settings/types";
import type { SettingsActionRequest } from "./settingsActions";
import type { SettingsActionConfirmation } from "./settings/presentation";
import type { WorkbenchSettings } from "./settingsModel";
import type { WorkbenchModel } from "./workbenchModel";
import type { usePackageOperations } from "./usePackageOperations";

const initializationActionIds = new Set([
  "workspace_root_set",
  "codex_install",
  "gateway_account_complete_setup",
  "gateway_account_use_for_model_access"
]);

type SettingsActionDependencies = {
  bridge: Pick<OplBridge, "executeAction">;
  settings: Pick<WorkbenchSettings, "locale" | "runtimeProfile">;
  model: Pick<WorkbenchModel, "managedCompanions">;
  packageOperations: Pick<ReturnType<typeof usePackageOperations>, "accept" | "supported">;
  captureManagedUpdateReceipt(receipt: OplActionReceipt): void;
  loadState(profile: WorkbenchSettings["runtimeProfile"]): Promise<unknown>;
  loadInitialize(): Promise<unknown>;
};

export function useSettingsActions({
  bridge, settings, model, packageOperations, captureManagedUpdateReceipt, loadState, loadInitialize
}: SettingsActionDependencies) {
  const [settingsActionReceipt, setSettingsActionReceipt] = useState<ActionReceiptView | null>(null);
  const [settingsActionBusyKey, setSettingsActionBusyKey] = useState<string | null>(null);
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<SettingsActionFeedback | null>(null);
  const [dockerDiagnostic, setDockerDiagnostic] = useState<SettingsDockerDiagnostic | null>(null);
  const [settingsActionConfirmation, setSettingsActionConfirmation] = useState<SettingsActionConfirmation | null>(null);
  const workbenchActionResolver = useRef<{ key: string; resolve(value: { status: string; [key: string]: unknown }): void } | null>(null);
  useEffect(() => () => {
    workbenchActionResolver.current?.resolve({ status: "cancelled" });
    workbenchActionResolver.current = null;
  }, []);
  function settingsReceiptFeedback(receipt: OplActionReceipt, label: string): SettingsActionFeedback {
    if (receipt.status === "preview_ready") {
      return {
        tone: "success",
        message: settings.locale === "zh" ? `${label}已完成，只读检查结果已生成。` : `${label} completed and produced a read-only check result.`
      };
    }
    if (receipt.status === "no_op" || receipt.status === "unsupported") {
      return { tone: "neutral", message: receipt.status === "no_op" ? (settings.locale === "zh" ? "Owner 回读：无需变更。" : "Owner reports no changes needed.") : (settings.locale === "zh" ? "Owner 尚不支持此操作；请刷新或在所属服务处理。" : "This action is unsupported by the owner; refresh or use the owner service.") };
    }
    if (receipt.status === "executed") {
      if (receipt.payload?.package_id === 'opl-workbench-services' && receipt.payload?.ref === 'workbench#task_run') return { tone: 'success', message: settings.locale === 'zh' ? '运行请求已提交；请在执行历史中查看进度与结果。' : 'Run request submitted. Check history for progress and results.' };
      return {
        tone: "success",
        message: settings.locale === "zh" ? `${label}已完成，状态已刷新。` : `${label} completed and state was refreshed.`
      };
    }
    if (receipt.status === "blocked_read_only") {
      return {
        tone: "attention",
        message: settings.locale === "zh" ? "当前以只读评估模式运行，预检查可用，但执行已被阻止。" : "The app is running in read-only evaluation mode. Preview is available, but execution is blocked."
      };
    }
    if (/^(source_|knowledge_source_)/.test(receipt.actionId)) {
      return { tone: "attention", message: settings.locale === "zh" ? `${label}尚未完成，请查看当前状态并重新检查；输入已保留。` : `${label} did not complete. Review the current status and check again; your input is retained.` };
    }
    return {
      tone: "attention",
      message: receipt.blockedReason || receipt.stderr || (settings.locale === "zh" ? `${label}未完成。` : `${label} did not complete.`)
    };
  }

  function acceptPackageOperation(receipt: OplActionReceipt, request: SettingsActionRequest) {
    if (request.actionId !== 'package_operation_start' || !packageOperations.accept(receipt)) return false;
    setSettingsActionConfirmation(null);
    setSettingsActionReceipt(null);
    setSettingsActionFeedback(null);
    settleWorkbenchAction(request.key, { status: 'running' });
    return true;
  }

  function settleWorkbenchAction(key: string, result: { status: string; [key: string]: unknown }) {
    const pending = workbenchActionResolver.current;
    if (!pending || pending.key !== key) return;
    workbenchActionResolver.current = null;
    pending.resolve(result);
  }

  function cancelSettingsAction() {
    if (settingsActionBusyKey !== null) return;
    if (settingsActionConfirmation) settleWorkbenchAction(settingsActionConfirmation.request.key, { status: "cancelled" });
    setSettingsActionConfirmation(null);
  }

  async function runSettingsAction(request: SettingsActionRequest) {
    const pendingWorkbench = workbenchActionResolver.current;
    if (pendingWorkbench && pendingWorkbench.key !== request.key) {
      const result = { status: "failed", error: "Another App action is awaiting confirmation." };
      if (request.key.startsWith("workbench:task_")) settleWorkbenchAction(request.key, result);
      setSettingsActionFeedback({ tone: "attention", message: settings.locale === "zh" ? "另一个操作正在等待确认，请先完成或取消该操作。" : "Another action is awaiting confirmation. Finish or cancel it first." });
      return;
    }
    if (settingsActionBusyKey !== null || settingsActionConfirmation !== null) {
      settleWorkbenchAction(request.key, { status: "failed", error: "Another App action is awaiting confirmation." });
      setSettingsActionFeedback({ tone: "attention", message: settings.locale === "zh" ? "请先完成或取消当前操作。" : "Finish or cancel the current action first." });
      return;
    }
    setSettingsActionBusyKey(request.key);
    setSettingsActionFeedback(null);
    setSettingsActionReceipt(null);
    try {
      request = await preparePackageOperationRequest(request, packageOperations.supported, bridge.executeAction);
      if (request.previewOnly) {
        const preview = await bridge.executeAction({ actionId: request.actionId, payload: request.payload, dryRun: true });
        setSettingsActionReceipt(actionReceiptView(preview));
        setSettingsActionFeedback(settingsReceiptFeedback(preview, request.label));
        return;
      }
      if (request.confirmationRequired) {
        if (request.dryRunSupported === false) {
          setSettingsActionConfirmation({ request, previewStatus: "confirmation_required" });
          return;
        }
        const preview = await bridge.executeAction({ actionId: request.actionId, payload: request.payload, dryRun: true });
        if (!["preview_ready", "confirmation_required"].includes(preview.status)) {
          setSettingsActionReceipt(actionReceiptView(preview));
          setSettingsActionFeedback(settingsReceiptFeedback(preview, request.label));
          settleWorkbenchAction(request.key, { ...preview, status: preview.status });
          return;
        }
        setSettingsActionConfirmation({ request, previewStatus: preview.status, preview: actionReceiptView(preview), confirmationId: preview.confirmationId, receiptId: preview.receiptId });
        return;
      }
      const receipt = await bridge.executeAction({
        actionId: request.actionId,
        payload: { ...request.payload, confirmed: true },
        dryRun: false
      });
      if (acceptPackageOperation(receipt, request)) return;
      const diagnostic = request.actionId === "settings_diagnose_docker_webui"
        ? dockerDiagnosticFromReceipt(receipt)
        : null;
      let stateReadFailed = false;
      if (diagnostic) setDockerDiagnostic(diagnostic);
      if (receipt.status === "executed" || /^(source_|knowledge_source_)/.test(receipt.actionId) && receipt.status !== "blocked_read_only") {
        captureManagedUpdateReceipt(receipt);
        if (request.actionId === "settings_diagnose_docker_webui") {
          // The doctor is a receipt-only read; its result is already authoritative
          // for this check and does not require a second full App-state read.
        } else {
          const profile = model.managedCompanions.some((companion) => companion.actions.some((action) => action.actionId === request.actionId)) ? "full" : settings.runtimeProfile;
          stateReadFailed = await loadState(profile) === null;
        }
        if (initializationActionIds.has(request.actionId)) await loadInitialize();
      }
      setSettingsActionReceipt(actionReceiptView(receipt));
      settleWorkbenchAction(request.key, { ...receipt, status: receipt.status });
      setSettingsActionFeedback(stateReadFailed ? {
        tone: "attention",
        message: settings.locale === "zh" ? "操作结果已返回，但最新状态暂未读取成功。请刷新核实，无需再次提交。" : "The action returned a result, but its latest state could not be read. Refresh to verify; do not submit it again."
      } : diagnostic ? {
        tone: diagnostic.status === "attention" || (diagnostic.attentionCount ?? 0) > 0 ? "attention" : "success",
        message: settings.locale === "zh"
          ? `诊断完成${diagnostic.attentionCount ? `，发现 ${diagnostic.attentionCount} 项需要处理` : "，未发现需要处理的项目"}。`
          : `Diagnostics completed${diagnostic.attentionCount ? ` with ${diagnostic.attentionCount} item(s) requiring attention` : " with no items requiring attention"}.`
      } : settingsReceiptFeedback(receipt, request.label));
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
      settleWorkbenchAction(request.key, { status: "failed", error: String(error) });
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function confirmSettingsAction() {
    const confirmation = settingsActionConfirmation;
    if (!confirmation) return;
    setSettingsActionBusyKey(confirmation.request.key);
    setSettingsActionFeedback(null);
    try {
      const receipt = await bridge.executeAction({
        actionId: confirmation.request.actionId,
        payload: { ...confirmation.request.payload, confirmed: true, ...(confirmation.confirmationId ? { confirmationId: confirmation.confirmationId } : {}), ...(confirmation.receiptId ? { receiptId: confirmation.receiptId } : {}) },
        dryRun: false
      });
      if (acceptPackageOperation(receipt, confirmation.request)) return;
      let stateReadFailed = false;
      if (receipt.status === "executed" || /^(source_|knowledge_source_)/.test(receipt.actionId) && receipt.status !== "blocked_read_only") {
        captureManagedUpdateReceipt(receipt);
        const profile = model.managedCompanions.some((companion) => companion.actions.some((action) => action.actionId === confirmation.request.actionId)) ? "full" : settings.runtimeProfile;
        stateReadFailed = await loadState(profile) === null;
        if (initializationActionIds.has(confirmation.request.actionId)) await loadInitialize();
      }
      setSettingsActionReceipt(actionReceiptView(receipt));
      settleWorkbenchAction(confirmation.request.key, { ...receipt, status: receipt.status });
      setSettingsActionFeedback(stateReadFailed ? {
        tone: "attention",
        message: settings.locale === "zh" ? "操作结果已返回，但最新状态暂未读取成功。请刷新核实，无需再次提交。" : "The action returned a result, but its latest state could not be read. Refresh to verify; do not submit it again."
      } : settingsReceiptFeedback(receipt, confirmation.request.label));
      setSettingsActionConfirmation(null);
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
      settleWorkbenchAction(confirmation.request.key, { status: "failed", error: String(error) });
      setSettingsActionConfirmation(null);
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  return {
    settingsActionReceipt, settingsActionBusyKey, settingsActionFeedback, dockerDiagnostic,
    settingsActionConfirmation, workbenchActionResolver,
    setSettingsActionReceipt, setSettingsActionBusyKey, setSettingsActionFeedback,
    runSettingsAction, confirmSettingsAction, cancelSettingsAction, settingsReceiptFeedback
  };
}

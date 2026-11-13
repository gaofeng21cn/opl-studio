import type { OplActionReceipt, OplActionRequest } from '../bridge/oplBridge';
import type { SettingsActionRequest } from './settingsActions';

export type PackageOperation = {
  operation_id: string; package_id: string; action_id: string; status: string; stage: string;
  active_package_id?: string; downloaded_bytes?: number; total_bytes?: number;
  bytes_per_second?: number; eta_seconds?: number | null; cached_bytes?: number;
  install_location?: string; error_code?: string; can_cancel: boolean; cancel_requested?: boolean;
};
export type PackageDownloadPlan = {
  package_id: string; version: string | null; install_location: string | null;
  download_bytes: number | null; cached_bytes: number; available_disk_bytes: number; unpacked_bytes: number | null;
};
export const packageBackgroundActions = new Set(['agent_package_install', 'agent_package_update', 'agent_package_repair']);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function packageOperationRequest(request: SettingsActionRequest): SettingsActionRequest {
  return packageBackgroundActions.has(request.actionId) && typeof request.payload.package_id === 'string'
    ? { ...request, actionId: 'package_operation_start', payload: { action_id: request.actionId, package_id: request.payload.package_id } }
    : request;
}
export function packageOperationResult(receipt: OplActionReceipt) {
  return record(record(record(receipt.stdoutJson).app_action_execution).result);
}
export function readPackageOperation(value: unknown): PackageOperation | null {
  const item = record(value);
  if (typeof item.operation_id !== 'string' || typeof item.package_id !== 'string'
    || typeof item.action_id !== 'string' || !packageBackgroundActions.has(item.action_id)
    || !['running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(String(item.status))) return null;
  return item as PackageOperation;
}
export function operationErrorMessage(code: string | undefined, zh: boolean) {
  if (code === 'package_download_insufficient_space') return zh ? '磁盘空间不足。释放空间后重试，已下载内容会保留。' : 'Not enough disk space. Free space and retry; downloaded bytes are retained.';
  if (code === 'package_download_integrity_failed') return zh ? '下载内容校验失败。重试将重新下载。' : 'Download verification failed. Retry to download a fresh copy.';
  if (code === 'package_download_network_failed') return zh ? '下载连接中断。重试将从已下载的位置继续。' : 'The download connection failed. Retry to resume the download.';
  if (code === 'package_operation_interrupted') return zh ? '安装进程已结束，结果未确认。刷新软件状态后可重试。' : 'The installer stopped without a confirmed result. Refresh software status before retrying.';
  return zh ? '安装未完成。查看软件源与本机状态后重试，已有下载会复用。' : 'Installation did not complete. Check the source and local status, then retry using the existing download.';
}

export async function preparePackageOperationRequest(request: SettingsActionRequest, supported: boolean, execute: (request: OplActionRequest) => Promise<OplActionReceipt>) {
  if (!packageBackgroundActions.has(request.actionId)) return request;
  if (supported) return packageOperationRequest(request);
  // The first click must not race the page's initial capability read.
  const status = await execute({ actionId: 'package_operation_status', payload: {}, dryRun: true });
  return Array.isArray(packageOperationResult(status).operations) ? packageOperationRequest(request) : request;
}

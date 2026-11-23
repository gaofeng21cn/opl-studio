import { useEffect, useId, useRef } from "react";
import type { WorkItemRuntimeItem } from "@gaofeng21cn/opl-host-contracts";
import type { RuntimeLocale } from "./runtimeStatusHelpers";

export type ArchiveConfirmDialogProps = {
  item: WorkItemRuntimeItem | null;
  targetArchived: boolean;
  locale: RuntimeLocale;
  busy: boolean;
  error?: string;
  onCancel(): void;
  onConfirm(): void;
};

/**
 * Native modal confirmation dialog strictly following modern-web-guidance `dialog`:
 * - Uses `showModal()`, letting the browser supply inert background, top layer, backdrop, and Esc handling.
 * - Never adds redundant `role="dialog"` or `aria-modal`.
 * - Resets `dialog.returnValue = ""` on close and autofocuses the safe Cancel action.
 */
export function ArchiveConfirmDialog({
  item,
  targetArchived,
  locale,
  busy,
  error,
  onCancel,
  onConfirm
}: ArchiveConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const zh = locale === "zh";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) {
      dialog.returnValue = "";
      dialog.showModal();
    } else if (!item && dialog.open) {
      dialog.returnValue = "";
      dialog.close();
    }
  }, [item]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      const value = dialog.returnValue;
      dialog.returnValue = "";
      if (value !== "confirm" && item) {
        onCancel();
      }
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [item, onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="runtime-confirm-dialog"
      aria-labelledby={titleId}
      data-testid="opl-runtime-archive-dialog"
    >
      {item ? (
        <div className="runtime-confirm-dialog-body">
          <h2 id={titleId}>
            {targetArchived
              ? (zh ? "归档此工作项？" : "Archive this work item?")
              : (zh ? "从归档库恢复此工作项？" : "Restore this work item?")}
          </h2>
          <p className="runtime-confirm-target">
            <strong>{item.projectDisplayName}</strong> · {item.title}
          </p>
          <p className="runtime-confirm-note">
            {targetArchived
              ? (zh
                  ? "归档只改变列表展示，不会停止正在运行的任务，也不会删除证据与产物；停止任务需前往该任务的所属控制面。"
                  : "Archiving only hides this item from the active view. Running work may continue; stop tasks from their owning control surface.")
              : (zh
                  ? "恢复后此工作项将回到运行状态主列表，原有进度与产物保持不变。"
                  : "Restoring returns this item to the active runtime list with its existing progress and deliverables intact.")}
          </p>
          {error ? <p className="runtime-confirm-error" role="alert">{error}</p> : null}
          <div className="runtime-confirm-actions">
            <button
              type="button"
              className="runtime-btn-secondary"
              disabled={busy}
              autoFocus
              onClick={() => {
                if (dialogRef.current) dialogRef.current.returnValue = "cancel";
                onCancel();
              }}
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              className="runtime-btn-primary"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy
                ? (zh ? "正在同步…" : "Updating…")
                : targetArchived
                  ? (zh ? "确认归档" : "Archive")
                  : (zh ? "确认恢复" : "Restore")}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

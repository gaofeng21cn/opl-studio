import * as Dialog from "@radix-ui/react-dialog";
import { Archive, ArchiveRestore, GitFork, Play, Trash2, X } from "lucide-react";
import type { WorkbenchThreadItem } from "../workbenchModel";

type ThreadDetailPopoverProps = {
  thread: WorkbenchThreadItem | null;
  locale: "zh" | "en";
  busy: boolean;
  onClose: () => void;
  onResume: (thread: WorkbenchThreadItem) => void;
  onFork: (thread: WorkbenchThreadItem) => void;
  onRequestArchive: (thread: WorkbenchThreadItem, archived: boolean) => void;
  onRequestDelete: (thread: WorkbenchThreadItem) => void;
};

export function ThreadDetailPopover({ thread, locale, busy, onClose, onResume, onFork, onRequestArchive, onRequestDelete }: ThreadDetailPopoverProps) {
  const copy = locale === "zh"
    ? { title: "对话详情", project: "项目", workspace: "工作区", lineage: "上游", agent: "智能体", source: "来源", activeTurn: "活动 Turn", status: "状态", id: "Thread ID", resume: "恢复对话", fork: "派生对话", archive: "归档", restore: "恢复", delete: "删除", close: "关闭" }
    : { title: "Thread details", project: "Project", workspace: "Workspace", lineage: "Lineage", agent: "Agent", source: "Source", activeTurn: "Active turn", status: "Status", id: "Thread ID", resume: "Resume thread", fork: "Fork thread", archive: "Archive", restore: "Restore", delete: "Delete", close: "Close" };

  return (
    <Dialog.Root open={Boolean(thread)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content data-testid="opl-thread-detail-popover" className="thread-detail-popover" aria-describedby={undefined}>
          <header>
            <Dialog.Title>{copy.title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label={copy.close}><X aria-hidden="true" size={15} /></button>
            </Dialog.Close>
          </header>
          {thread ? (
            <>
              <strong className="thread-detail-title">{thread.title}</strong>
              <dl>
                <div><dt>{copy.project}</dt><dd>{thread.projectLabel ?? (thread.projectId ? thread.projectId : locale === "zh" ? "未归属" : "None")}</dd></div>
                <div><dt>{copy.workspace}</dt><dd><code>{thread.workspace ?? "-"}</code></dd></div>
                <div><dt>{copy.lineage}</dt><dd><code>{thread.parentThreadId ?? "-"}</code></dd></div>
                <div><dt>{copy.agent}</dt><dd>{thread.agentNickname ?? thread.agentRole ?? "-"}</dd></div>
                <div><dt>{copy.source}</dt><dd><code>{thread.sourceKind ?? "-"}</code></dd></div>
                <div><dt>{copy.activeTurn}</dt><dd><code>{thread.activeTurnId ?? "-"}</code></dd></div>
                <div><dt>{copy.status}</dt><dd>{thread.status}</dd></div>
                <div><dt>{copy.id}</dt><dd><code>{thread.id}</code></dd></div>
              </dl>
              <div className="thread-detail-actions">
                {thread.status === "unloaded" || thread.status === "notLoaded" ? (
                  <button data-testid="opl-thread-resume" type="button" disabled={busy} onClick={() => onResume(thread)}><Play aria-hidden="true" size={14} />{copy.resume}</button>
                ) : null}
                <button type="button" disabled={busy} onClick={() => onFork(thread)}><GitFork aria-hidden="true" size={14} />{copy.fork}</button>
                <button type="button" disabled={busy} onClick={() => onRequestArchive(thread, !thread.archived)}>
                  {thread.archived ? <ArchiveRestore aria-hidden="true" size={14} /> : <Archive aria-hidden="true" size={14} />}
                  {thread.archived ? copy.restore : copy.archive}
                </button>
                <button type="button" disabled={busy} onClick={() => onRequestDelete(thread)}><Trash2 aria-hidden="true" size={14} />{copy.delete}</button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

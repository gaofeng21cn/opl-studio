import { useEffect, useState } from "react";
import { Download, ExternalLink, FolderOpen } from "lucide-react";
import { DshPreviewAdapter, type WorkspaceFilePreviewSource } from "./DshPreviewAdapter";

export type WorkspaceFilePreviewProps = WorkspaceFilePreviewSource & {
  locale: "zh" | "en";
  title?: string;
  subtitle?: string;
  onCopyPath?(): void;
  copied?: boolean;
};

/** Generic deliverable preview pane with system-open / reveal / download actions. */
export function WorkspaceFilePreview({
  sourceKey,
  relativePath,
  sizeBytes,
  nativeFileAccess,
  readBytes,
  accessFile,
  locale,
  title,
  subtitle,
  onCopyPath,
  copied
}: WorkspaceFilePreviewProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const zh = locale === "zh";

  useEffect(() => {
    setError("");
    setBusy(false);
  }, [sourceKey, relativePath]);

  async function trigger(action: "open" | "reveal" | "download") {
    setBusy(true);
    setError("");
    try {
      await accessFile(action);
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setBusy(false);
    }
  }

  const displayName = title ?? relativePath.split("/").at(-1) ?? relativePath;

  return (
    <section className="opl-workspace-file-preview" data-testid="opl-workspace-file-preview">
      <header className="opl-workspace-file-preview-header">
        <div className="opl-workspace-file-preview-meta">
          <strong title={relativePath}>{displayName}</strong>
          <small title={relativePath}>{subtitle ?? relativePath}</small>
        </div>
        <div className="opl-workspace-file-preview-actions">
          {onCopyPath ? (
            <button type="button" className="opl-preview-action-btn" onClick={onCopyPath}>
              {copied ? (zh ? "已复制路径" : "Copied") : (zh ? "复制路径" : "Copy path")}
            </button>
          ) : null}
          {nativeFileAccess ? (
            <>
              <button type="button" className="opl-preview-action-btn" disabled={busy} onClick={() => void trigger("open")}>
                <ExternalLink aria-hidden="true" size={14} />
                <span>{zh ? "用系统应用打开" : "Open"}</span>
              </button>
              <button type="button" className="opl-preview-action-btn" disabled={busy} onClick={() => void trigger("reveal")}>
                <FolderOpen aria-hidden="true" size={14} />
                <span>{zh ? "在文件管理器中显示" : "Reveal"}</span>
              </button>
            </>
          ) : (
            <button type="button" className="opl-preview-action-btn" disabled={busy} onClick={() => void trigger("download")}>
              <Download aria-hidden="true" size={14} />
              <span>{zh ? "下载文件" : "Download"}</span>
            </button>
          )}
        </div>
      </header>
      {error ? <p className="opl-workspace-file-preview-error" role="alert">{error}</p> : null}
      <div className="opl-workspace-file-preview-body">
        <DshPreviewAdapter
          key={`${sourceKey}:${relativePath}`}
          sourceKey={sourceKey}
          relativePath={relativePath}
          sizeBytes={sizeBytes}
          nativeFileAccess={nativeFileAccess}
          readBytes={readBytes}
          accessFile={accessFile}
          locale={locale}
        />
      </div>
    </section>
  );
}

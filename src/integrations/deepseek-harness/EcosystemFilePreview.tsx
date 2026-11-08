import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { DshPreviewAdapter } from "./DshPreviewAdapter";
import type { EcosystemWorkspaceBridge } from "./ecosystemWorkspaceProvider";

export type EcosystemFilePreviewProps = EcosystemWorkspaceBridge & {
  relativePath: string;
  locale: "zh" | "en";
  startSeconds?: number;
  endSeconds?: number;
  onClose(): void;
};

/** Canonical workspace bridge for the supported DSH preview primitives. */
export function EcosystemFilePreview(props: EcosystemFilePreviewProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setError(""); setBusy(false); }, [props.threadId, props.relativePath]);
  async function open() {
    setBusy(true); setError("");
    try { await props.accessWorkspace({ threadId: props.threadId, relativePath: props.relativePath, action: props.nativeFileAccess ? "open" : "download" }); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  return <section className="opl-ecosystem-file-preview" data-testid="opl-ecosystem-file-preview" style={{ minWidth: 0, display: "flex", flexDirection: "column", height: "min(65vh, 740px)", minHeight: 340 }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={props.relativePath}>{props.relativePath.split("/").at(-1)}</strong>
      <button type="button" disabled={busy} onClick={() => void open()}>{props.locale === "zh" ? (props.nativeFileAccess ? "用系统应用打开" : "下载文件") : (props.nativeFileAccess ? "Open in system app" : "Download file")}</button>
      <button type="button" aria-label={props.locale === "zh" ? "关闭预览" : "Close preview"} title={props.locale === "zh" ? "关闭预览" : "Close preview"} onClick={props.onClose}><ChevronLeft aria-hidden="true" size={18} /></button>
    </header>
    {error ? <p role="alert">{error}</p> : null}
    <DshPreviewAdapter key={`${props.threadId}:${props.relativePath}`} {...props} />
  </section>;
}

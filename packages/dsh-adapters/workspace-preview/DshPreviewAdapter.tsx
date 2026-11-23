import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MarkdownText, type MarkdownLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ThreadWorkspaceBytes } from "@gaofeng21cn/opl-host-contracts";
import type { EcosystemWorkspaceBridge } from "./ecosystemWorkspaceProvider";

export type WorkspaceFilePreviewSource = {
  sourceKey: string;
  relativePath: string;
  sizeBytes?: number;
  nativeFileAccess: boolean;
  readBytes(request: { relativePath: string; offset?: number; length?: number }): Promise<ThreadWorkspaceBytes>;
  accessFile(action: "open" | "reveal" | "download"): Promise<unknown>;
};

type PreviewProps = (
  | (EcosystemWorkspaceBridge & { relativePath: string; startSeconds?: number; endSeconds?: number })
  | (WorkspaceFilePreviewSource & { startSeconds?: number; endSeconds?: number })
) & { locale: "zh" | "en" };

type LoadedFile = { data: Uint8Array<ArrayBuffer>; sizeBytes: number };

const textExtensions = new Set([
  "md", "markdown", "html", "htm", "txt", "text", "log", "json", "jsonl", "yaml", "yml", "toml",
  "csv", "tsv", "ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "scss", "less", "py", "go", "rs",
  "java", "kt", "swift", "c", "cpp", "h", "hpp", "sh", "bash", "xml", "sql", "r", "rmd", "qmd",
  "tex", "bib", "ini", "conf", "rst"
]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);
const mediaTypes: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac"
};
const officeOrArchiveExtensions = new Set(["doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "ppt", "pptx", "odp", "pages", "numbers", "key", "zip", "tar", "gz", "7z"]);

function extensionOf(value: string): string {
  const name = value.replaceAll("\\", "/").split("/").at(-1) ?? value;
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function isEcosystemBridge(props: PreviewProps): props is EcosystemWorkspaceBridge & { relativePath: string; locale: "zh" | "en"; startSeconds?: number; endSeconds?: number } {
  return "threadId" in props;
}

async function readComplete(
  readBytes: (request: { relativePath: string; offset?: number; length?: number }) => Promise<ThreadWorkspaceBytes>,
  relativePath: string,
  signal: AbortSignal,
  maxPreviewBytes = 8 * 1024 * 1024
): Promise<LoadedFile> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let sizeBytes = 0;
  while (true) {
    signal.throwIfAborted();
    const result = await readBytes({ relativePath, offset, length: 512 * 1024 });
    signal.throwIfAborted();
    const raw = atob(result.data);
    if (result.offset !== offset || raw.length > 512 * 1024 || (!raw.length && !result.eof)) {
      throw new Error("Invalid workspace byte response");
    }
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    chunks.push(bytes);
    sizeBytes = result.sizeBytes;
    offset += bytes.length;
    if (result.eof || offset >= maxPreviewBytes) break;
  }
  const data = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    data.set(chunk, cursor);
    cursor += chunk.length;
  }
  return { data, sizeBytes };
}

function textFor(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function formatJsonText(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function parseDelimitedRows(raw: string, delimiter: string, maxRows = 200): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length > maxRows) {
        return { rows: rows.slice(0, maxRows), truncated: true };
      }
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows: rows.slice(0, maxRows), truncated: rows.length > maxRows };
}

const markdownLabels: MarkdownLabels = {
  code: {
    copyLabel: "Copy",
    copiedLabel: "Copied",
    toolbarLabels: { codeLabel: "Code block", wrapLabel: "Wrap lines", unwrapLabel: "Unwrap lines" }
  },
  footnotes: "Footnotes"
};

function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Canonical workspace preview adapter supporting both thread workspaces and
 * registered agent deliverable workspaces across Markdown, CSV/TSV, HTML,
 * JSON/Code, PDF, images, audio, and video.
 */
export function DshPreviewAdapter(props: PreviewProps): ReactNode {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; file?: LoadedFile }>({ status: "loading" });
  const [blobUrl, setBlobUrl] = useState<string>();
  const [viewMode, setViewMode] = useState<"rendered" | "source">("rendered");
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  const sourceKey = isEcosystemBridge(props) ? props.threadId : props.sourceKey;
  const extension = extensionOf(props.relativePath);
  const isText = textExtensions.has(extension);
  const isImage = imageExtensions.has(extension);
  const isTable = extension === "csv" || extension === "tsv";
  const isHtml = extension === "html" || extension === "htm";
  const isJson = extension === "json";
  const mediaType = mediaTypes[extension];
  const supported = isText || isImage || Boolean(mediaType) || extension === "pdf";

  const readBytesFn = isEcosystemBridge(props)
    ? (req: { relativePath: string; offset?: number; length?: number }) => props.readBytes({ threadId: props.threadId, ...req })
    : props.readBytes;

  useEffect(() => {
    setViewMode("rendered");
  }, [sourceKey, props.relativePath]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    if (!supported) return () => controller.abort();
    const maxBytes = isText ? 2 * 1024 * 1024 : 32 * 1024 * 1024;
    void readComplete(readBytesFn, props.relativePath, controller.signal, maxBytes).then(
      (file) => {
        if (!controller.signal.aborted) setState({ status: "ready", file });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    );
    return () => controller.abort();
  }, [sourceKey, props.relativePath, supported, isText]);

  const text = useMemo(() => (isText && state.status === "ready" && state.file ? textFor(state.file.data) : ""), [isText, state]);
  const tableData = useMemo(() => (isTable && text ? parseDelimitedRows(text, extension === "tsv" ? "\t" : ",") : null), [isTable, text, extension]);

  useEffect(() => {
    if (state.status !== "ready" || !state.file || (!isImage && !mediaType && extension !== "pdf")) {
      setBlobUrl(undefined);
      return;
    }
    const mime = mediaType || (extension === "pdf" ? "application/pdf" : extension === "svg" ? "image/svg+xml" : `image/${extension === "jpg" ? "jpeg" : extension}`);
    const url = URL.createObjectURL(new Blob([state.file.data], { type: mime }));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [extension, isImage, mediaType, state]);

  const seek = () => {
    if (media.current && props.startSeconds !== undefined) media.current.currentTime = props.startSeconds;
  };
  useEffect(seek, [props.startSeconds, blobUrl]);
  const stopAtEnd = () => {
    if (!media.current || props.endSeconds === undefined || media.current.currentTime <= props.endSeconds) return;
    media.current.currentTime = props.endSeconds;
    media.current.pause();
  };

  const zh = props.locale === "zh";
  const fileSizeHint = !isEcosystemBridge(props) ? formatFileSize(props.sizeBytes) : "";

  if (!supported) {
    const isArchiveOrOffice = officeOrArchiveExtensions.has(extension);
    return (
      <div className="opl-preview-unsupported" role="status">
        <p>
          {isArchiveOrOffice
            ? (zh
                ? `该 ${extension.toUpperCase()} 文件不支持内嵌渲染，请使用系统默认应用打开或下载查看。`
                : `${extension.toUpperCase()} files open externally. Open with your system app or download to inspect.`)
            : (zh ? "请使用系统应用打开或下载此文件。" : "Open this file in the system app or download it.")}
        </p>
        {fileSizeHint ? <small>{zh ? "文件大小：" : "File size: "}{fileSizeHint}</small> : null}
      </div>
    );
  }
  if (state.status === "loading") return <p role="status">{zh ? "正在加载文件…" : "Loading file…"}</p>;
  if (state.status === "error" || !state.file) return <p role="alert">{zh ? "无法读取此文件。" : "This file could not be read."}</p>;
  if (isImage && blobUrl) {
    return (
      <div className="opl-preview-media-stage">
        <img src={blobUrl} alt={props.relativePath} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", alignSelf: "center" }} />
      </div>
    );
  }
  if (mediaType && blobUrl) {
    return (
      <div className="opl-preview-media-stage">
        {mediaType.startsWith("video/")
          ? <video ref={media} src={blobUrl} controls preload="metadata" onLoadedMetadata={seek} onTimeUpdate={stopAtEnd} onSeeking={stopAtEnd} style={{ width: "100%", maxHeight: "100%" }} />
          : <audio ref={media} src={blobUrl} controls preload="metadata" onLoadedMetadata={seek} style={{ width: "100%" }} />}
      </div>
    );
  }
  if (extension === "pdf" && blobUrl) {
    return <iframe title={props.relativePath} src={blobUrl} style={{ border: 0, width: "100%", height: "100%", minHeight: 360 }} />;
  }
  if (isTable && tableData) {
    const [head, ...body] = tableData.rows;
    return (
      <div className="opl-preview-structured">
        <div className="opl-preview-mode-bar">
          <button type="button" aria-pressed={viewMode === "rendered"} onClick={() => setViewMode("rendered")}>{zh ? "表格视图" : "Table"}</button>
          <button type="button" aria-pressed={viewMode === "source"} onClick={() => setViewMode("source")}>{zh ? "原始文本" : "Raw text"}</button>
          {tableData.truncated ? <span>{zh ? "已截取前 200 行预览" : "Showing first 200 rows"}</span> : null}
        </div>
        {viewMode === "source" ? (
          <pre className="opl-preview-code">{text}</pre>
        ) : (
          <div className="opl-preview-table-wrap">
            <table className="opl-preview-table">
              {head ? <thead><tr>{head.map((cell, idx) => <th key={idx}>{cell}</th>)}</tr></thead> : null}
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  if (isHtml) {
    return (
      <div className="opl-preview-structured">
        <div className="opl-preview-mode-bar">
          <button type="button" aria-pressed={viewMode === "rendered"} onClick={() => setViewMode("rendered")}>{zh ? "页面预览" : "Preview"}</button>
          <button type="button" aria-pressed={viewMode === "source"} onClick={() => setViewMode("source")}>{zh ? "源码" : "Source"}</button>
        </div>
        {viewMode === "source"
          ? <pre className="opl-preview-code">{text}</pre>
          : <iframe title={props.relativePath} sandbox="" srcDoc={text} style={{ border: 0, width: "100%", flex: 1, minHeight: 360, background: "#fff", borderRadius: 6 }} />}
      </div>
    );
  }
  if (extension === "md" || extension === "markdown") {
    return <div className="opl-preview-markdown" style={{ overflow: "auto", flex: 1, minHeight: 0 }}><MarkdownText text={text} labels={markdownLabels} /></div>;
  }
  if (isJson) {
    return <pre className="opl-preview-code" style={{ margin: 0, overflow: "auto", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{formatJsonText(text)}</pre>;
  }
  if (isText) {
    return <pre className="opl-preview-code" style={{ margin: 0, overflow: "auto", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</pre>;
  }
  return <p role="status">{zh ? "官方 DSH 文档预览运行时尚未在当前文件面板启用；请使用系统应用打开。" : "The official DSH document preview runtime is not enabled in this file panel yet; use the system app to open this file."}</p>;
}

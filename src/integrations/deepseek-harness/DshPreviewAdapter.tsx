import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MarkdownText, type MarkdownLabels } from "../../vendor/deepseek-harness/packages/client/ui-primitives/src/index";
import type { EcosystemWorkspaceBridge } from "./ecosystemWorkspaceProvider";

type PreviewProps = EcosystemWorkspaceBridge & { relativePath: string; locale: "zh" | "en"; startSeconds?: number; endSeconds?: number };
type LoadedFile = { data: Uint8Array; sizeBytes: number };

const textExtensions = new Set([
  "md", "markdown", "html", "htm", "txt", "text", "log", "json", "yaml", "yml", "toml",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "scss", "less", "py", "go", "rs", "java",
  "kt", "swift", "c", "cpp", "h", "hpp", "sh", "bash", "xml"
]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);
const mediaTypes: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac" };

function extensionOf(value: string): string {
  const name = value.replaceAll("\\", "/").split("/").at(-1) ?? value;
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

async function readComplete(bridge: EcosystemWorkspaceBridge, relativePath: string, signal: AbortSignal): Promise<LoadedFile> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let sizeBytes = 0;
  while (true) {
    signal.throwIfAborted();
    const result = await bridge.readBytes({ threadId: bridge.threadId, relativePath, offset, length: 512 * 1024 });
    signal.throwIfAborted();
    const raw = atob(result.data);
    if (result.offset !== offset || raw.length > 512 * 1024 || (!raw.length && !result.eof)) throw new Error("Invalid workspace byte response");
    const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
    chunks.push(bytes);
    sizeBytes = result.sizeBytes;
    offset += bytes.length;
    if (result.eof) break;
  }
  const data = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) { data.set(chunk, cursor); cursor += chunk.length; }
  return { data, sizeBytes };
}

function textFor(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

const markdownLabels: MarkdownLabels = {
  code: {
    copyLabel: "Copy",
    copiedLabel: "Copied",
    toolbarLabels: { codeLabel: "Code block", wrapLabel: "Wrap lines", unwrapLabel: "Unwrap lines" }
  },
  footnotes: "Footnotes"
};

/**
 * Temporary OPL workspace adapter. The official DSH documentpreview client is
 * carried separately and is activated only when the full Remote/Resource/
 * Sidebar runtime is present; this adapter keeps the current file panel usable
 * without fabricating those DSH services.
 */
export function DshPreviewAdapter(props: PreviewProps): ReactNode {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; file?: LoadedFile }>({ status: "loading" });
  const [imageUrl, setImageUrl] = useState<string>();
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const extension = extensionOf(props.relativePath);
  const isText = textExtensions.has(extension);
  const isImage = imageExtensions.has(extension);
  const mediaType = mediaTypes[extension];
  const supported = isText || isImage || Boolean(mediaType) || extension === "pdf";

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    if (!supported) return () => controller.abort();
    void readComplete(props, props.relativePath, controller.signal).then(
      file => { if (!controller.signal.aborted) setState({ status: "ready", file }); },
      () => { if (!controller.signal.aborted) setState({ status: "error" }); },
    );
    return () => controller.abort();
  }, [props.threadId, props.relativePath, supported]);

  const text = useMemo(() => isText && state.status === "ready" && state.file ? textFor(state.file.data) : "", [isText, state]);

  useEffect(() => {
    if (state.status !== "ready" || !state.file || (!isImage && !mediaType && extension !== "pdf")) { setImageUrl(undefined); return; }
    const mime = mediaType || (extension === "pdf" ? "application/pdf" : extension === "svg" ? "image/svg+xml" : `image/${extension === "jpg" ? "jpeg" : extension}`);
    const url = URL.createObjectURL(new Blob([state.file.data], { type: mime }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [extension, isImage, mediaType, state]);

  const seek = () => { if (media.current && props.startSeconds !== undefined) media.current.currentTime = props.startSeconds; };
  useEffect(seek, [props.startSeconds, imageUrl]);
  const stopAtEnd = () => {
    if (!media.current || props.endSeconds === undefined || media.current.currentTime <= props.endSeconds) return;
    media.current.currentTime = props.endSeconds;
    media.current.pause();
  };

  if (!supported) return <p role="status">{props.locale === "zh" ? "请使用系统应用打开或下载此文件。" : "Open this file in the system app or download it."}</p>;
  if (state.status === "loading") return <p role="status">{props.locale === "zh" ? "正在加载文件..." : "Loading file..."}</p>;
  if (state.status === "error" || !state.file) return <p role="alert">{props.locale === "zh" ? "无法读取此文件。" : "This file could not be read."}</p>;
  if (isImage && imageUrl) return <img src={imageUrl} alt={props.relativePath} style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain", alignSelf: "center" }} />;
  if (mediaType && imageUrl) return mediaType.startsWith("video/")
    ? <video ref={media} src={imageUrl} controls preload="metadata" onLoadedMetadata={seek} onTimeUpdate={stopAtEnd} onSeeking={stopAtEnd} style={{ width: "100%", maxHeight: "60vh" }} />
    : <audio ref={media} src={imageUrl} controls preload="metadata" onLoadedMetadata={seek} onTimeUpdate={stopAtEnd} />;
  if (extension === "pdf" && imageUrl) return <iframe title={props.relativePath} src={imageUrl} style={{ border: 0, width: "100%", height: "100%" }} />;
  if (extension === "md" || extension === "markdown") return <div style={{ overflow: "auto" }}><MarkdownText text={text} labels={markdownLabels} /></div>;
  if (isText) return <pre style={{ margin: 0, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</pre>;
  return <p role="status">{props.locale === "zh" ? "官方 DSH 文档预览运行时尚未在当前文件面板启用；请使用系统应用打开。" : "The official DSH document preview runtime is not enabled in this file panel yet; use the system app to open this file."}</p>;
}

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronLeft } from "lucide-react";
import { createEcosystemLocale, loadEcosystemClient } from "./ecosystemClients";
import { createEcosystemWorkspaceProvider, type EcosystemContentProvider, type EcosystemWorkspaceBridge } from "./ecosystemWorkspaceProvider";

type ViewerService = {
  openFile(locator: string): void;
  registerContentProvider(provider: EcosystemContentProvider): () => void;
};
type ViewerMount = { Component: ComponentType<any>; props: Record<string, unknown> };
export type EcosystemFilePreviewProps = EcosystemWorkspaceBridge & {
  relativePath: string;
  locale: "zh" | "en";
  onClose(): void;
};

/** The unchanged community viewer owns rendering; Studio supplies file access. */
export function EcosystemFilePreview(props: EcosystemFilePreviewProps) {
  const [mount, setMount] = useState<ViewerMount | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(props);
  latest.current = props;
  const locale = useRef(createEcosystemLocale(() => latest.current.locale));

  useEffect(() => { locale.current.refresh(); }, [props.locale]);
  useEffect(() => {
    let active = true;
    const cleanup: (() => void)[] = [];
    setMount(null);
    setError("");
    void loadEcosystemClient("dsh-file-viewer").then((plugin) => {
      if (!active) return;
      const { provider, locator } = createEcosystemWorkspaceProvider({
        ...latest.current,
        // Capture the canonical thread for this mount. A task switch unmounts
        // this provider rather than redirecting an in-flight read to a new task.
        threadId: props.threadId,
      });
      let service: ViewerService | undefined;
      let view: ViewerMount | undefined;
      const previousBrowse = (window as unknown as Record<string, unknown>).__dsfvBrowseWorkspace;
      const sessionProjection = { list: { getSnapshot: () => ({ current: props.threadId, byId: { [props.threadId]: { cwd: locator("") } } }) } };
      plugin.apply({
        locale: locale.current,
        connection: { rpc: { call: async () => ({ ok: false, error: { message: "Only this task's workspace files are available" } }) } },
        get: (name: string) => name === "sessions" ? sessionProjection : name === "workspaces" ? { list: { getSnapshot: () => ({ items: [] }) } } : undefined,
        provide(name: string, value: unknown) { if (name === "fileViewer") service = value as ViewerService; },
        effect(callback: () => void | (() => void)) { const dispose = callback(); if (dispose) cleanup.push(dispose); },
        logger: { warn: console.warn, error: console.error },
        slots: {
          inject(name: string, activate: () => unknown) { if (name === "conversation.view") activate(); },
          register(options: Record<string, unknown>, Component: ComponentType<any>) {
            if (options.name !== "conversation.view" || options.id !== "dsh-file-viewer") return;
            view = { Component, props: { ...(typeof options.inject === "function" ? options.inject() : {}), t: locale.current.bind("fileViewer"), sessionId: props.threadId,
              useSessions: (selector: (snapshot: unknown) => unknown) => selector(sessionProjection.list.getSnapshot()) } };
          },
        },
      });
      if (!service || !view) throw new Error("The file viewer did not expose its public provider and view");
      cleanup.push(service.registerContentProvider(provider));
      cleanup.push(() => { (window as unknown as Record<string, unknown>).__dsfvBrowseWorkspace = previousBrowse; });
      service.openFile(locator(props.relativePath));
      setMount(view);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; for (const dispose of cleanup.reverse()) dispose(); };
  }, [props.threadId, props.relativePath]);

  return <section className="opl-ecosystem-file-preview" data-testid="opl-ecosystem-file-preview" style={{ minWidth: 0, display: "flex", flexDirection: "column", height: "min(65vh, 740px)", minHeight: 340 }}>
    <style>{`.opl-ecosystem-file-preview .dsfv-panel{--dsfv-bottom-clearance:0px}.opl-ecosystem-file-preview .dsfv-titlebar{flex-wrap:wrap;gap:6px;padding:8px}.opl-ecosystem-file-preview .dsfv-titlebar-path{min-width:0;flex:1 1 100%}.opl-ecosystem-file-preview .dsfv-path,.opl-ecosystem-file-preview .dsfv-back-btn,.opl-ecosystem-file-preview .dsfv-close{display:none}.opl-ecosystem-file-preview .dsfv-titlebar-actions{flex-wrap:wrap}`}</style>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={props.relativePath}>{props.relativePath.split("/").at(-1)}</strong>
      <button type="button" aria-label={props.locale === "zh" ? "返回文件列表" : "Back to files"} title={props.locale === "zh" ? "返回文件列表" : "Back to files"} onClick={props.onClose}><ChevronLeft aria-hidden="true" size={18} /></button>
    </header>
    {error ? <p role="alert">{error}</p> : mount ? <mount.Component {...mount.props} /> : <p role="status">{props.locale === "zh" ? "正在加载文件预览…" : "Loading file preview…"}</p>}
  </section>;
}

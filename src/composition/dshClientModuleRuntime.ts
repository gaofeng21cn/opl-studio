import { AppWebEntry, applyIndexInjections } from "@deepseek-ai/dsh-client-web";
import type { IndexInjection } from "@deepseek-ai/dsh-host-webserver";

type DesktopBridge = {
  readClientModuleBoot?: () => Promise<IndexInjection[]>;
};

/** Map DSH's document-relative resources onto Electron's restricted carrier route. */
export function desktopClientResource(reference: string): string {
  const url = new URL(reference, "opl-client://modules/");
  if (url.protocol !== "opl-client:" || url.hostname !== "modules" || url.port || url.username || url.password
    || !url.pathname.startsWith("/plugins/")) throw new Error("Invalid DSH client module resource");
  return url.href;
}

/** Execute the official boot table; discovery and activation stay in DSH. */
export async function bootDesktopDshClient(container: HTMLElement): Promise<AppWebEntry> {
  const bridge = window.oplStudio as DesktopBridge | undefined;
  if (!bridge?.readClientModuleBoot) {
    throw new Error("Desktop DSH client module transport is unavailable");
  }
  const loadBundle = (reference: string) => new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = desktopClientResource(reference);
    script.onload = () => { script.remove(); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error(`Cannot load DSH client bundle: ${reference}`)); };
    document.head.append(script);
  });
  await applyIndexInjections(await bridge.readClientModuleBoot(), loadBundle);
  const entry = new AppWebEntry(container, { loadBundle, resolveAsset: desktopClientResource });
  let failure: unknown;
  await entry.run(reason => { failure = reason; });
  if (failure) { await entry.dispose(); throw failure; }
  return entry;
}

import type { ThreadWorkspaceAccessRequest, ThreadWorkspaceBytes, ThreadWorkspaceListing } from "../../bridge/oplBridge";

export type EcosystemWorkspaceBridge = {
  threadId: string;
  nativeFileAccess: boolean;
  listWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
  readBytes(request: { threadId: string; relativePath: string; offset?: number; length?: number }): Promise<ThreadWorkspaceBytes>;
  accessWorkspace(request: ThreadWorkspaceAccessRequest): Promise<{ accepted: boolean }>;
};
type ContentMeta = { name: string; size: number; isDirectory?: boolean };
export type EcosystemContentProvider = {
  id: string;
  supports(locator: string): boolean;
  stat(locator: string, signal: AbortSignal): Promise<ContentMeta | undefined>;
  read(locator: string, request: { offset: number; length: number; signal: AbortSignal }): Promise<Uint8Array>;
  list(locator: string, signal: AbortSignal): Promise<(ContentMeta & { locator: string })[]>;
  openExternal(locator: string, signal: AbortSignal): Promise<void>;
  saveAsAllowed(): { allowed: boolean; maxBytes: number };
};

export function createEcosystemWorkspaceProvider(bridge: EcosystemWorkspaceBridge): { provider: EcosystemContentProvider; locator(relativePath: string): string } {
  const prefix = `opl-workspace://${encodeURIComponent(bridge.threadId)}/`;
  const relative = (locator: string) => {
    if (!locator.startsWith(prefix)) throw new Error("This file belongs to another workspace");
    const value = locator.slice(prefix.length);
    if (value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => part === "." || part === "..") || value.includes("\0")) {
      throw new Error("Invalid workspace file path");
    }
    return value;
  };
  const locator = (value: string) => { const result = `${prefix}${value}`; relative(result); return result; };
  const metadata = new Map<string, ContentMeta>();
  const provider: EcosystemContentProvider = {
    id: `opl-codex-workspace:${bridge.threadId}`,
    supports: (value) => value.startsWith(prefix),
    async stat(value, signal) {
      signal.throwIfAborted();
      const path = relative(value);
      if (!path) return { name: "Workspace", size: 0, isDirectory: true };
      const known = metadata.get(path);
      if (known?.isDirectory) return known;
      // Stat through the same canonical file descriptor used for byte reads,
      // so a stale directory listing cannot become file-access authority.
      const result = await bridge.readBytes({ threadId: bridge.threadId, relativePath: path, offset: 0, length: 1 });
      signal.throwIfAborted();
      return { name: path.split("/").at(-1) ?? path, size: result.sizeBytes, isDirectory: false };
    },
    async read(value, request) {
      const path = relative(value);
      if (!Number.isSafeInteger(request.offset) || request.offset < 0 || !Number.isSafeInteger(request.length) || request.length < 1 || request.length > 8 * 1024 * 1024) {
        throw new Error("Invalid workspace byte range");
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (received < request.length) {
        request.signal.throwIfAborted();
        const offset = request.offset + received;
        const length = Math.min(512 * 1024, request.length - received);
        const result = await bridge.readBytes({ threadId: bridge.threadId, relativePath: path, offset, length });
        request.signal.throwIfAborted();
        const decoded = atob(result.data);
        if (result.offset !== offset || decoded.length > length || (!decoded.length && !result.eof)) throw new Error("Invalid workspace byte response");
        const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
        chunks.push(bytes);
        received += bytes.length;
        if (result.eof) break;
      }
      const result = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    },
    async list(value, signal) {
      signal.throwIfAborted();
      const result = await bridge.listWorkspace({ threadId: bridge.threadId, relativePath: relative(value) });
      signal.throwIfAborted();
      return result.entries.filter((entry) => entry.kind !== "symlink").map((entry) => {
        const meta = { name: entry.name, size: entry.sizeBytes ?? 0, isDirectory: entry.kind === "directory" };
        metadata.set(entry.relativePath, meta);
        return { ...meta, locator: locator(entry.relativePath) };
      });
    },
    async openExternal(value, signal) {
      signal.throwIfAborted();
      const relativePath = relative(value);
      await bridge.accessWorkspace({ threadId: bridge.threadId, relativePath, action: bridge.nativeFileAccess ? "open" : "download" });
    },
    saveAsAllowed: () => ({ allowed: true, maxBytes: 100 * 1024 * 1024 }),
  };
  return { provider, locator };
}

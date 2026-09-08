import { describe, expect, test } from "bun:test";
import { createEcosystemWorkspaceProvider, type EcosystemWorkspaceBridge } from "../../src/integrations/deepseek-harness/ecosystemWorkspaceProvider";

function fixture() {
  const bytes = new Uint8Array(700_000).map((_, index) => index % 251);
  const calls: { threadId: string; relativePath: string; offset?: number; length?: number }[] = [];
  const bridge: EcosystemWorkspaceBridge = {
    threadId: "canonical-thread",
    nativeFileAccess: false,
    listWorkspace: async () => ({ schema: "opl_thread_workspace_listing.v1", threadId: "canonical-thread", relativePath: "", truncated: false, entries: [
      { name: "report.pdf", relativePath: "report.pdf", kind: "file", sizeBytes: bytes.length },
      { name: "external", relativePath: "external", kind: "symlink" },
    ] }),
    async readBytes(request) {
      calls.push(request);
      const offset = request.offset ?? 0;
      const part = bytes.subarray(offset, offset + (request.length ?? 0));
      return { data: Buffer.from(part).toString("base64"), offset, sizeBytes: bytes.length, eof: offset + part.length >= bytes.length };
    },
    accessWorkspace: async () => ({ accepted: true }),
  };
  return { ...createEcosystemWorkspaceProvider(bridge), bridge, bytes, calls };
}

describe("community viewer canonical workspace provider", () => {
  test("reads binary windows through the existing bridge without inventing a filesystem owner", async () => {
    const { provider, locator, bytes, calls } = fixture();
    const result = await provider.read(locator("report.pdf"), { offset: 10, length: 800_000, signal: new AbortController().signal });
    expect(result).toEqual(bytes.subarray(10));
    expect(calls).toHaveLength(2);
    expect(calls.every((request) => request.threadId === "canonical-thread" && request.relativePath === "report.pdf" && request.length! <= 512 * 1024)).toBe(true);
  });

  test("rejects cross-task and traversal locators before bridge access", async () => {
    const { provider, locator, calls } = fixture();
    expect(() => locator("../secret")).toThrow("Invalid workspace");
    expect(() => locator("dir\\secret")).toThrow("Invalid workspace");
    await expect(provider.stat("opl-workspace://another-task/report.pdf", new AbortController().signal)).rejects.toThrow("another workspace");
    expect(calls).toHaveLength(0);
  });

  test("an aborted or malformed response cannot be presented as another file", async () => {
    const { provider, locator, calls, bridge } = fixture();
    await expect(provider.read(locator("report.pdf"), { offset: 0, length: 100, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    bridge.readBytes = async () => ({ data: "YWJj", offset: 4, sizeBytes: 10, eof: false });
    await expect(provider.read(locator("report.pdf"), { offset: 0, length: 100, signal: new AbortController().signal })).rejects.toThrow("Invalid workspace byte response");
  });

  test("does not expose symlinks as downloadable directory entries", async () => {
    const { provider, locator } = fixture();
    const entries = await provider.list(locator(""), new AbortController().signal);
    expect(entries.map((entry) => entry.name)).toEqual(["report.pdf"]);
  });
});

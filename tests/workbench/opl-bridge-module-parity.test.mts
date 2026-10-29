import { expect, test } from "bun:test";

Object.assign(globalThis, {
  __OPL_CODEX_MODEL_POLICY__: {
    source: "bridge-module-parity-test",
    defaultModel: "test-model",
    defaultReasoningEffort: "high",
    visibleModels: [{ id: "test-model" }],
    reasoningEfforts: ["high"],
    autoLabel: { zh: "Auto", en: "Auto" },
    knownModelReasoningEffortOverrides: {},
    acceptUnknownCatalogDefault: true,
    useHighestSupportedReasoningForUnknown: true
  }
});

const [root, commands, action, events, models, platform, threads] = await Promise.all([
  import("../../src/bridge/oplBridge"),
  import("../../src/bridge/oplBridge-commands"),
  import("../../src/bridge/oplBridge-normalizers-action"),
  import("../../src/bridge/oplBridge-normalizers-events"),
  import("../../src/bridge/oplBridge-normalizers-codex"),
  import("../../src/bridge/oplBridge-normalizers-platform"),
  import("../../src/bridge/oplBridge-normalizers-threads")
]);

test("root facade preserves module export identity", () => {
  expect(root.OPL_COMMANDS).toBe(commands.OPL_COMMANDS);
  expect(root.CODEX_APP_SERVER).toBe(commands.CODEX_APP_SERVER);
  expect(root.buildActionCommandArgs).toBe(commands.buildActionCommandArgs);
  expect(root.normalizeActionReceipt).toBe(action.normalizeActionReceipt);
  expect(root.normalizeBridgeEvent).toBe(events.normalizeBridgeEvent);
  expect(root.normalizeCodexModelCatalog).toBe(models.normalizeCodexModelCatalog);
  expect(root.normalizeCarrierDiagnostics).toBe(platform.normalizeCarrierDiagnostics);
  expect(root.normalizeCodexThread).toBe(threads.normalizeCodexThread);
});

test("command builders preserve ordering, JSON payloads, and dry-run defaults", () => {
  expect(root.buildActionCommandArgs({ actionId: "package.review", payload: { id: "p1" } })).toEqual([
    "opl", "app", "action", "execute", "--action", "package.review",
    "--payload", '{"id":"p1"}', "--dry-run", "--json"
  ]);
  expect(root.buildActionCommandArgs({ actionId: "package.review", dryRun: false })).toEqual([
    "opl", "app", "action", "execute", "--action", "package.review", "--json"
  ]);
  expect(root.buildDomainDetailViewCommandArgs({ itemId: "item-1", viewId: "detail", ifRevision: 7 })).toEqual([
    "opl", "app", "view", "read", "--item-id", "item-1", "--view-id", "detail",
    "--if-revision", "7", "--json"
  ]);
});

test("representative normalizers retain their public readback behavior", () => {
  const receipt = root.normalizeActionReceipt({
    actionId: "package.review",
    dryRun: false,
    confirmationRequired: false,
    canExecute: true,
    receiptKind: "execute",
    status: "executed",
    command: "opl",
    commandArgs: ["app"],
    exitCode: 0,
    stdout: JSON.stringify({ ok: true }),
    stderr: "",
    timedOut: false
  }, { actionId: "package.review", dryRun: false, payload: { confirmed: true } });
  expect(receipt.status).toBe("executed");
  expect(receipt.stdoutJson).toEqual({ ok: true });

  expect(root.normalizeBridgeEvent({ method: "item/permission/request", params: { turnId: "turn-1" } }, "test")).toMatchObject({
    method: "item/permission/request",
    eventKind: "permission",
    source: "test",
    turnId: "turn-1"
  });

  expect(root.normalizeCodexModelCatalog({ models: [{ id: "gpt", supportedReasoningEfforts: ["low", "high"] }] })).toEqual({
    source: "codex_app_server_model_list",
    models: [{
      id: "gpt",
      model: "gpt",
      displayName: "gpt",
      isDefault: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["low", "high"]
    }]
  });

  expect(root.normalizeCodexThread({
    id: "thread-1",
    status: { type: "active", activeFlags: ["turn"] },
    turns: [{ id: "turn-1", status: "inProgress" }],
    source: { type: "codex" }
  })).toMatchObject({
    id: "thread-1",
    state: "running",
    activeTurnId: "turn-1",
    sourceKind: "codex"
  });
});


test("WebUI transport resolves API, upload, download, SSE and login against its document base", async () => {
  const originals = new Map(["document", "window", "location", "fetch", "EventSource"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const eventUrls: string[] = [];
  const redirects: string[] = [];
  let unauthorized = false;
  const fakeLink = { href: "", download: "", click() {}, remove() {} };
  try {
    Object.assign(globalThis, {
      window: { setTimeout() {} },
      location: { replace: (url: string) => redirects.push(url) },
      document: { baseURI: "https://workspace.example/", createElement: () => fakeLink, body: { append() {} } },
      EventSource: class { constructor(url: string) { eventUrls.push(url); } close() {} },
      fetch: async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (unauthorized) return Response.json({}, { status: 401 });
        if (url.includes("/auth/user")) return Response.json({ csrfToken: "test-csrf" });
        if (url.includes("/inputs") && init?.method === "POST" && !url.includes("complete")) return Response.json({ id: "input-1" });
        if (url.includes("/complete")) return Response.json({ inputs: [{ kind: "file", name: "note.txt", path: "/data/note.txt" }] });
        if (url.includes("/download")) return new Response("download");
        return Response.json({});
      }
    });
    const { installWebTransport } = await import("../../src/bridge/webTransport");
    for (const prefix of ["/", "/w/workspace_0123456789abcdef0123456789abcdef/"]) {
      document.baseURI = `https://workspace.example${prefix}`;
      installWebTransport();
      const surface = window.oplStudio!;
      await surface.readState("fast");
      await surface.listThreads({});
      await surface.resolveDroppedInputs([new File(["hello"], "note.txt")]);
      const close = surface.subscribeEvents(() => {});
      close();
      await surface.accessThreadWorkspace({ threadId: "thread-1", relativePath: "note.txt", action: "download" });
      const urls = calls.splice(0);
      expect(urls.every(({ url }) => url.startsWith(`https://workspace.example${prefix}api/`))).toBe(true);
      expect(urls.some(({ url }) => url.endsWith("api/opl/state?profile=fast"))).toBe(true);
      expect(urls.some(({ url }) => url.includes("api/inputs/input-1/files?path=note.txt"))).toBe(true);
      expect(new Headers(urls.find(({ url }) => url.endsWith("/threads/list"))?.init?.headers).get("x-csrf-token")).toBe("test-csrf");
      expect(eventUrls.at(-1)).toBe(`https://workspace.example${prefix}api/opl-events`);
    }
    unauthorized = true;
    await expect(window.oplStudio!.readState("fast")).rejects.toMatchObject({ code: "authentication_required" });
    expect(redirects.at(-1)).toBe("https://workspace.example/w/workspace_0123456789abcdef0123456789abcdef/login");
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

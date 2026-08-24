import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CodexAppServerTransport } from "../../scripts/webui-host/app-server-transport.mjs";
import { abbreviateHomePath } from "../../src/integrations/deepseek-harness/runtimeShim.ts";
import { assistantDisplayMarkdown } from "../../src/workbench/messageDisplay.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const app = read("src/workbench/App.tsx");
const main = read("src/main.tsx");
const bridge = read("src/bridge/oplBridge.ts");
const webTransport = read("src/bridge/webTransport.ts");
const model = read("src/workbench/workbenchModel.ts");
const runtimePage = read("src/workbench/RuntimeOverviewPage.tsx");
const runtimeCache = read("src/workbench/runtimeOverviewCache.ts");
const settingsPanel = read("src/workbench/SettingsPanel.tsx");
const styles = read("src/workbench/codexWorkbenchStyles.ts");
const adapterStyles = read("src/integrations/deepseek-harness/oplAdapter.css");
const slotHost = read("src/composition/dshSlotHost.tsx");
const appFrame = read("src/vendor/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx");
const appFrameStyles = read("src/vendor/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.module.css");
const conversationStyles = read("src/vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css");
const settingsRoot = read("src/vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx");
const desktopMain = read("desktop/main.mjs");
const desktopPreload = read("desktop/preload.cjs");
const rendererShell = read("src/renderer-shell.html");
const hostCore = read("scripts/webui-host/host-core.mjs");
const dshHost = read("scripts/webui-host/dsh/host.mjs");
const dshProfile = read("scripts/webui-host/dsh/cordis.yml");
const dshWebOverlay = read("scripts/webui-host/dsh/web.patch.yml");
const codexNative = read("scripts/webui-host/opl-codex-native.mjs");
const dshToolMcp = read("scripts/webui-host/dsh-tool-mcp.mjs");
const appServerTransport = read("scripts/webui-host/app-server-transport.mjs");
const detail = read("src/workbench/threads/ThreadDetailPopover.tsx");
const lifecycle = read("src/workbench/threads/ThreadLifecycleConfirmationDialog.tsx");
const composerPalette = read("src/workbench/ComposerCapabilityPalette.tsx");
const projectProgress = read("src/workbench/projectProgress.ts");
const projectProgressPanel = read("src/workbench/ProjectProgressPanel.tsx");
const workspaceFilesPanel = read("src/workbench/WorkspaceFilesPanel.tsx");
const clientCordis = read("src/composition/clientCordis.ts");
const settings = read("src/workbench/settingsModel.ts");
const gatewayCache = read("src/workbench/gatewayAccountCache.ts");
const gatewayLoginHost = read("scripts/webui-host/gateway-account-login.mjs");
const contributionComponents = read("src/composition/contributionComponents.tsx");
const contributionProjection = read("src/composition/contributionProjection.ts");
const primitiveIndex = read("src/vendor/deepseek-harness/packages/client/ui-primitives/src/index.ts");
const scopedSlots = read("src/vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx");
const runtimeShim = read("src/integrations/deepseek-harness/runtimeShim.ts");
const bunBuild = read("scripts/bun-build-renderer-entry.ts");
const sourceManifest = JSON.parse(read("src/composition/deepseekHarnessSourceManifest.json"));
const candidateEvidence = JSON.parse(read("src/candidateContractEvidence.json"));
const packageJson = JSON.parse(read("package.json"));
const tsconfig = JSON.parse(read("tsconfig.json"));
const typecheckConfig = JSON.parse(read("tsconfig.typecheck.json"));

test("renderer consumes one standard Codex thread adapter", () => {
  assert.match(app, /from "\.\.\/threads\/types"/);
  assert.doesNotMatch(app, /from "\.\/threads\/ThreadRail"/);
  for (const method of ["listThreads", "readThread", "resumeThread", "forkThread", "setArchived"]) {
    assert.match(desktopPreload, new RegExp(`${method}:`));
    assert.match(hostCore, new RegExp(`case "${method}"`));
    assert.match(bridge, new RegExp(`${method}\\(`));
  }
  for (const route of ["/api/threads/list", "/api/threads/read", "/api/threads/resume", "/api/threads/fork", "/api/threads/archive", "/api/threads/unarchive"]) {
    assert.ok(webTransport.includes(route), `missing WebUI thread route ${route}`);
  }

  const runtimeSources = `${app}\n${main}\n${bridge}\n${webTransport}\n${desktopMain}\n${desktopPreload}\n${hostCore}`;
  for (const retired of [
    "prepareCoordination",
    "dispatchCoordination",
    "waitCoordination",
    "subscribeThreadEvents",
    "CoordinationDialog",
    "coordination/lifecycle-proposal",
    "host_queue",
    "CoordinationLedger",
    "ThreadCoordinationHost"
  ]) assert.doesNotMatch(runtimeSources, new RegExp(retired));
});

test("DSH workspace home abbreviation is POSIX-boundary-safe and Windows fail-open", () => {
  assert.equal(abbreviateHomePath("/Users/opl/project", "/Users/opl"), "~/project");
  assert.equal(abbreviateHomePath("/Users/opl/", "/Users/opl/"), "~");
  assert.equal(abbreviateHomePath("/Users/opl-other/project", "/Users/opl"), "/Users/opl-other/project");
  assert.equal(abbreviateHomePath("C:\\Users\\opl\\project", "C:\\Users\\opl"), "C:\\Users\\opl\\project");
  assert.equal(abbreviateHomePath("\\\\server\\share\\project", "\\\\server\\share"), "\\\\server\\share\\project");
});

test("ordinary fallback data and example content stay out of the renderer", () => {
  for (const field of ["sessions", "results", "deliverables", "receipts", "artifactPreviews", "deliveryPackages", "actionReceipts", "confirmations", "questions", "activeProjectLines", "contextSources", "contextActions", "contextTrace"]) {
    assert.match(model, new RegExp(`${field}: \\[\\]`));
  }
  for (const example of ["GlycoFold", "Project brief.md", "Data inventory.csv", "Result summary"]) {
    assert.doesNotMatch(`${app}\n${model}`, new RegExp(example.replace(".", "\\.")));
  }
  assert.doesNotMatch(app, /model\.confirmations\[0\]!/);
  assert.match(settingsPanel, /data-testid="opl-settings-action-confirmation"/);
  assert.match(lifecycle, /data-testid="opl-thread-lifecycle-confirmation"/);
});

test("primary settings actions keep readable contrast on hover", () => {
  assert.match(
    styles,
    /\.settings-action-button\.primary:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--opl-text\) 88%, var\(--opl-canvas\)\);[\s\S]*?color:\s*var\(--opl-canvas\);/
  );
});

test("Studio exposes an App-projected first-level runtime overview", () => {
  assert.match(slotHost, /function RuntimeNavigation/);
  assert.doesNotMatch(slotHost, /SidebarPrimaryNavigationSlot|opl-primary-navigation/);
  assert.match(slotHost, /studio\.primaryView === "runtime"/);
  assert.match(app, /<RuntimeOverviewPage/);
  assert.match(bridge, /workbench\?: Record<string, unknown>/);
  assert.match(model, /work_item_projection_v2/);
  assert.match(runtimePage, /data-testid="opl-runtime-overview-page"/);
  assert.match(runtimePage, /formatTokens/);
  assert.match(runtimePage, /value === null/);
  assert.match(runtimePage, /aria-expanded=\{stagesOpen\}/);
  assert.match(runtimePage, /showArchived/);
  assert.match(runtimePage, /runtime-recovery-band/);
  assert.match(runtimePage, /recoveryStatusLabel/);
  assert.doesNotMatch(runtimePage, /causalRoot\.reasonCode|causalRoot\.rawStatus|mutationGuard\.status/);
  assert.match(app, /const refreshedModel = await loadState\(settings\.runtimeProfile\)/);
  assert.match(app, /refreshedRecovery\.primaryAction\?\.actionId !== action\.actionId/);
  assert.match(app, /await bridge\.executeAction/);
  assert.match(app, /await loadState\(settings\.runtimeProfile\)/);
  assert.match(app, /writeRuntimeOverviewCache/);
  assert.match(app, /runtimeSnapshotSource/);
  assert.match(runtimePage, /runtime-snapshot-note/);
  assert.match(runtimeCache, /opl_studio_runtime_overview_cache\.v1/);
  assert.match(runtimeCache, /cached_snapshot_requires_fresh_state/);
  assert.match(runtimeCache, /maintenanceActions: \[\]/);
  assert.match(runtimePage, /causalRoot\.detail\[locale\]/);
});

test("new task and runtime entries share the light primary navigation treatment", () => {
  assert.match(slotHost, /function RuntimeNavigation/);
  assert.match(styles, /\.opl-primary-nav button[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(styles, /button\[class\*="newSession"\][\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(styles, /button\[aria-current="page"\][\s\S]*?background: var\(--opl-selected\)/);
});

test("local storage keeps only UI metadata and drafts after one-way legacy backup", () => {
  assert.match(app, /legacyChatSessionsBackupKey/);
  assert.match(app, /storage\.removeItem\(legacyChatSessionsStorageKey\)/);
  assert.match(app, /uiMetadataStorageKey/);
  assert.match(app, /draftStorageKey/);
  assert.doesNotMatch(app, /writeChatSessions|messages:\s*nextMessages|setItem\(legacyChatSessionsStorageKey/);
});

test("DSH workspace browser, lifecycle, and Codex subagent projection stay explicit", () => {
  assert.match(slotHost, /<WorkspaceBrowser/);
  assert.match(slotHost, /const projects = studio\.threadProjects\.filter\(project => !project\.projectless\)/);
  assert.match(slotHost, /studio\.threadProjects\.filter\(project => !project\.projectless\)\.map/);
  assert.match(slotHost, /const projectless = studio\.threadProjects\.find\(project => project\.projectless\)/);
  assert.match(slotHost, /function RecentSessionsSection/);
  assert.match(slotHost, /<section className="opl-recent-sessions" aria-labelledby="opl-recent-sessions-title">/);
  assert.match(slotHost, /<h2 id="opl-recent-sessions-title">/);
  assert.match(slotHost, /className="opl-recent-session-list" role="tree" aria-labelledby="opl-recent-sessions-title"/);
  assert.match(slotHost, /@opl-vendor\/dsh-session-node/);
  assert.match(slotHost, /className="opl-workspace-browser-seat"/);
  assert.ok(slotHost.indexOf("<WorkspaceBrowser") < slotHost.indexOf("<RecentSessionsSection"));
  assert.doesNotMatch(slotHost, /key === "group\.ungrouped"/);
  assert.doesNotMatch(slotHost.slice(slotHost.indexOf("function RecentSessionsSection"), slotHost.indexOf("function RuntimeNavigation")), /aria-expanded|<Folder|<Chevron/);
  assert.match(styles, /\.opl-workspace-browser-seat \{[^}]*overflow-y: auto;[^}]*scrollbar-gutter: stable;/s);
  assert.match(styles, /\.opl-workspace-browser-seat \[role="tree"\] \{[^}]*overflow: visible;/s);
  const recentStyles = styles.slice(styles.indexOf(".opl-recent-sessions {"), styles.indexOf(".opl-recent-sessions h2"));
  assert.doesNotMatch(recentStyles, /overflow|max-height/);
  assert.match(slotHost, /project\.threads\.map/);
  assert.match(slotHost, /searchSessions=\{async/);
  assert.match(slotHost, /archiveSession=\{/);
  assert.match(slotHost, /forkSession=\{/);
  assert.match(detail, /opl-thread-resume/);
  assert.match(detail, /onRequestArchive/);
  assert.doesNotMatch(detail, /onCoordinate|coordinate/);
  assert.match(lifecycle, /opl-thread-lifecycle-confirmation/);
  assert.match(lifecycle, /ThreadLifecycleAction/);
  assert.match(app, /action === "fork"/);
  assert.match(app, /confirmed: true/);
  assert.match(app, /deriveThreadMessages/);
  assert.match(app, /<Streamdown/);
  assert.match(app, /linkSafety=\{assistantMarkdownLinkSafety\}/);
  assert.match(app, /assistantDisplayMarkdown\(/);
  assert.doesNotMatch(app, /opl-assistant-artifact-card/);
  assert.match(app, /bridge\.readThread\(\{ threadId: thread\.id, includeTurns: true \}\)/);
  assert.match(app, /activeTurnRef\.current = readbackTurnId \? \{ threadId: readbackThreadId, turnId: readbackTurnId \} : null/);
  assert.match(app, /setActiveTurnId\(readbackTurnId \?\? null\)/);
  assert.doesNotMatch(app, /const resumed = thread\.status === "unloaded"/);
  assert.match(app, /async function resumeThreadAndOpen/);
  assert.match(app, /thread-read-error/);
  assert.match(app, /message\.subagent \? " subagent"/);
  assert.match(model, /"collabAgentToolCall" \| "subAgentActivity"/);
  assert.match(model, /type === "collabagenttoolcall"/);
  assert.match(model, /type === "subagentactivity"/);
  assert.match(model, /parentThreadId/);
  assert.match(model, /sourceKind/);
  assert.match(app, /threadDirectoryError,/);
  assert.match(app, /reloadThreadDirectory:/);
  assert.match(slotHost, /opl-thread-directory-error/);
  assert.match(slotHost, /studio\.reloadThreadDirectory\(\)/);
});

test("composer exposes Auto as a root recommendation action instead of a fake model", () => {
  assert.match(slotHost, /@deepseek-ai\/dsh-client-ui-primitives/);
  assert.match(slotHost, /id:\s*"model"/);
  assert.match(slotHost, /id:\s*"reasoning"/);
  assert.match(slotHost, /id:\s*"automatic"/);
  assert.match(slotHost, /label:\s*autoModelLabel\(studio\.locale\)/);
  assert.match(slotHost, /studio\.selectModel\("__auto"\)/);
  assert.doesNotMatch(slotHost, /\{ id: "__auto", name:/);
});

test("starting a new task clears the previous thread identity and errors", () => {
  const startNewChat = app.match(/function startNewChat\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(startNewChat, /setCodexThreadId\(undefined\)/);
  assert.match(startNewChat, /selectedThreadId: undefined/);
  assert.match(startNewChat, /setThreadActionError\(""\)/);
});

test("standard Agent selection binds only to a newly created Codex thread", async () => {
  const requests = [];
  let threadSequence = 0;
  let turnSequence = 0;
  const turnByThread = new Map();
  const transport = new CodexAppServerTransport({ cwd: "/tmp/opl-studio-agent-fixture" });
  transport.request = async (method, params) => {
    requests.push({ method, params });
    if (method === "thread/start") return { thread: { id: `thread-${++threadSequence}` } };
    if (method === "turn/start") {
      const turnId = `turn-${++turnSequence}`;
      turnByThread.set(params.threadId, turnId);
      return { turn: { id: turnId } };
    }
    if (method === "thread/read") {
      return {
        thread: {
          id: params.threadId,
          status: { type: "idle" },
          turns: [{ id: turnByThread.get(params.threadId), status: "completed" }]
        }
      };
    }
    throw new Error(`unexpected request: ${method}`);
  };
  transport.waitForTurn = async (turnId) => ({
    finalMessage: `completed ${turnId}`,
    events: [],
    notification: { turn: { id: turnId, status: "completed" } }
  });

  const selection = {
    package_id: "mas",
    shortcut_id: "medical-autoscience",
    codex_visible_entry: "med-autoscience:med-autoscience",
    required_skill_ids: ["medical-research-lit", "medical-statistical-review"]
  };
  const first = await transport.sendMessage({
    prompt: "Start the study",
    inputs: [],
    agentSelection: selection
  });
  const firstThreadStart = requests.find((request) => request.method === "thread/start");
  const firstTurnStart = requests.find((request) => request.method === "turn/start");
  assert.equal(first.threadId, "thread-1");
  assert.match(firstThreadStart.params.developerInstructions, /application-owned routing snapshot/);
  assert.ok(firstThreadStart.params.developerInstructions.includes(JSON.stringify(selection)));
  assert.deepEqual(firstTurnStart.params.additionalContext, {
    "opl.standard_agent_selection": {
      kind: "application",
      value: JSON.stringify(selection)
    }
  });

  await assert.rejects(
    transport.sendMessage({
      prompt: "Rebind the existing conversation",
      inputs: [],
      threadId: first.threadId,
      agentSelection: selection
    }),
    (error) => error?.code === "invalid_request" && /cannot be rebound/.test(error.message)
  );

  const second = await transport.sendMessage({ prompt: "Start another task", inputs: [] });
  assert.equal(second.threadId, "thread-2");
  assert.notEqual(second.threadId, first.threadId);
  assert.equal(requests.filter((request) => request.method === "thread/start").length, 2);
});

test("App session instructions are injected only when a new Codex conversation is created", async () => {
  const requests = [];
  const turnByThread = new Map();
  const transport = new CodexAppServerTransport({ cwd: "/tmp/opl-studio-context-fixture" });
  transport.request = async (method, params) => {
    requests.push({ method, params });
    if (method === "thread/start") return { thread: { id: "thread-context" } };
    if (method === "thread/resume") return { thread: { id: params.threadId } };
    if (method === "turn/start") {
      const turnId = `turn-${requests.length}`;
      turnByThread.set(params.threadId, turnId);
      return { turn: { id: turnId } };
    }
    if (method === "thread/read") {
      return {
        thread: {
          id: params.threadId,
          status: { type: "idle" },
          turns: [{ id: turnByThread.get(params.threadId), status: "completed" }]
        }
      };
    }
    throw new Error(`unexpected request: ${method}`);
  };
  transport.waitForTurn = async (turnId) => ({
    finalMessage: `completed ${turnId}`,
    events: [],
    notification: { turn: { id: turnId, status: "completed" } }
  });

  await transport.sendMessage({
    prompt: "Start with App context",
    inputs: [],
    additionalInstructions: "Use the local OPL review conventions."
  });
  const started = requests.find((request) => request.method === "thread/start");
  assert.equal(started.params.developerInstructions, "Use the local OPL review conventions.");

  await transport.sendMessage({
    prompt: "Continue without rebinding context",
    inputs: [],
    threadId: "thread-context",
    additionalInstructions: "This must not replace existing conversation context."
  });
  assert.equal(requests.filter((request) => request.method === "thread/start").length, 1);
  assert.equal(requests.some((request) => request.method === "thread/resume"), true);
  await assert.rejects(
    transport.sendMessage({ prompt: "Oversized", inputs: [], additionalInstructions: "x".repeat(65_537) }),
    (error) => error?.code === "invalid_request" && /64 KiB/.test(error.message)
  );
});

test("turn steering preserves the active thread and expected turn identity", async () => {
  const requests = [];
  let acknowledgedTurnId = "turn-active";
  const transport = new CodexAppServerTransport({ cwd: "/tmp/opl-studio-steer-fixture" });
  transport.request = async (method, params) => {
    requests.push({ method, params });
    assert.equal(method, "turn/steer");
    return { turnId: acknowledgedTurnId };
  };

  const accepted = await transport.steerMessage({
    threadId: "thread-active",
    expectedTurnId: "turn-active",
    prompt: "Prioritize the new evidence",
    inputs: []
  });
  assert.deepEqual(requests[0], {
    method: "turn/steer",
    params: {
      threadId: "thread-active",
      expectedTurnId: "turn-active",
      input: [{ type: "text", text: "Prioritize the new evidence", text_elements: [] }]
    }
  });
  assert.deepEqual(accepted, {
    executor: "codex_app_server",
    transport: "stdio_json_rpc",
    threadId: "thread-active",
    expectedTurnId: "turn-active",
    turnId: "turn-active",
    accepted: true
  });

  acknowledgedTurnId = "turn-other";
  await assert.rejects(
    transport.steerMessage({
      threadId: "thread-active",
      expectedTurnId: "turn-active",
      prompt: "Do not accept a stale acknowledgement",
      inputs: []
    }),
    (error) => error?.code === "invalid_app_server_response"
      && error?.details?.receivedTurnId === "turn-other"
  );
});

test("assistant display consumes Codex UI directives without rewriting Markdown examples", () => {
  const visible = assistantDisplayMarkdown([
    "发布完成。",
    "",
    '::git-stage{cwd="/tmp/example"}',
    '::git-commit{cwd="/tmp/example"}',
    '::git-push{cwd="/tmp/example" branch="main"}',
    '::git-create-branch{cwd="/tmp/example" branch="codex/example"}',
    '::git-create-pr{cwd="/tmp/example" branch="codex/example" url="https://example.test" isDraft=false}',
    '::created-thread{threadId="thread-1"}',
    '::code-comment{title="Review" body="Keep this hidden" file="/tmp/example.ts" start=1}',
    "",
    "普通正文中的 `::git-commit{...}` 示例应保留。",
    "",
    "```text",
    '::git-commit{cwd="/tmp/fenced-example"}',
    "```",
    "::unknown-directive{value=\"visible\"}"
  ].join("\n"));

  for (const hidden of ["::git-stage{", "::git-push{", "::git-create-pr{", "::created-thread{", "::code-comment{"]) {
    assert.equal(visible.includes(hidden), false, `display text leaked ${hidden}`);
  }
  assert.match(visible, /普通正文中的 `::git-commit\{\.\.\.\}` 示例应保留。/);
  assert.match(visible, /```text\n::git-commit\{cwd="\/tmp\/fenced-example"\}\n```/);
  assert.match(visible, /::unknown-directive\{value="visible"\}/);
});

test("Electron desktop hosts the live DeepSeek Harness composition root", () => {
  assert.match(slotHost, /import \{ AppFrame \} from "@opl-vendor\/dsh-app-frame"/);
  assert.match(slotHost, /import \{ SidebarRoot \} from "@opl-vendor\/dsh-sidebar-root"/);
  assert.match(slotHost, /import \{ ConversationRoot \} from "@opl-vendor\/dsh-conversation-root"/);
  assert.match(slotHost, /import \{ InputBar \} from "@opl-vendor\/dsh-input-bar"/);
  assert.match(slotHost, /import \{ QueueDock \} from "@opl-vendor\/dsh-queue-dock"/);
  assert.match(slotHost, /import \{ SettingsRoot \} from "@opl-vendor\/dsh-settings-root"/);
  for (const component of ["AppFrame", "SidebarRoot", "ConversationRoot", "InputBar", "QueueDock", "SettingsRoot"]) {
    assert.match(slotHost, new RegExp(`<${component}`));
  }
  assert.match(app, /return renderShell\(\{/);
  assert.match(app, /threadProjects,/);
  assert.match(app, /agentPresets:/);
  assert.match(app, /modelOptions,/);
  assert.match(app, /conversationBody: studioConversationBody/);
  assert.match(app, /renderSettings: renderStudioSettings/);
  assert.match(main, /mountOplStudioClient\(rootElement\)/);
  assert.match(main, /oplStudioClientPlugin/);
  assert.match(main, /document\.documentElement\.dataset\.oplHost = desktopTransportInstalled \? "desktop" : "web"/);
  assert.match(desktopMain, /new BrowserWindow\(/);
  assert.match(desktopMain, /titleBarStyle: "hiddenInset"/);
  assert.match(desktopMain, /contextIsolation: true/);
  assert.match(desktopMain, /nodeIntegration: false/);
  assert.match(desktopMain, /sandbox: true/);
  assert.match(desktopMain, /ipcMain\.handle\("opl:invoke"/);
  assert.match(desktopMain, /trustedRendererUrl\(event\.senderFrame\.url\)/);
  assert.match(desktopPreload, /contextBridge\.exposeInMainWorld\("oplStudio"/);
  assert.match(desktopPreload, /ipcRenderer\.invoke\("opl:invoke"/);
});

test("Web host exposes the product brand while keeping Studio as an internal client id", () => {
  const webHostTransport = read("scripts/webui-host/app-server-transport.mjs");
  assert.match(webHostTransport, /name: "opl-studio-webui"/);
  assert.match(webHostTransport, /title: "One Person Lab"/);
  assert.doesNotMatch(webHostTransport, /title: "OPL Studio WebUI"/);
  assert.match(
    adapterStyles,
    /\[data-slot="sidebar\.brand\.mark"],\s*\n\.opl-studio-dsh-root \[data-slot="conversation\.hero\.brand\.mark"\] \{\s*display: none;/s,
  );
  assert.doesNotMatch(adapterStyles, /content: "OPL"/);
});

test("desktop exposes a drag region before the DSH application mounts", () => {
  assert.match(rendererShell, /\[data-opl-desktop-drag\][^}]*position: fixed;[\s\S]*-webkit-app-region: drag/s);
  assert.match(rendererShell, /<div data-opl-desktop-drag hidden><\/div>/);
  assert.match(adapterStyles, /html\[data-opl-host="desktop"\] body > \[data-opl-desktop-drag\] \{\s*display: block;/s);
  assert.doesNotMatch(adapterStyles, /padding-top: 28px/);
});

test("wide DSH sidebar gives the product title a deliberate top inset", () => {
  assert.match(slotHost, /className="opl-dsh-sidebar-shell" data-collapsed=\{collapsed \|\| undefined\}/);
  assert.match(adapterStyles, /\.opl-dsh-sidebar-shell \{\s*display: contents;\s*\}/s);
  assert.match(adapterStyles, /\.opl-dsh-sidebar-shell:not\(\[data-collapsed\]\) > div:first-child \{\s*padding-top: 18px;\s*\}/s);
});

test("App update restart follows the carrier result instead of a host-name special case", () => {
  assert.match(app, /nativeAppUpdate\?\.supported === true && nativeAppUpdate\.restartRequired === true/);
  assert.doesNotMatch(app, /nativeAppUpdate\?\.host === "native"/);
});

test("desktop version and updater state have one main-process source", () => {
  assert.match(desktopMain, /resolveDesktopRuntimeEnvironment/);
  assert.match(desktopMain, /desktop\/native-app-update/);
  assert.match(desktopMain, /window\.webContents\.once\("did-finish-load"/);
  assert.match(app, /method === "desktop\/native-app-update"/);
  assert.match(app, /nativeAppUpdate\?\.supported === true && nativeAppUpdate\.state === "available"/);
  assert.match(settingsPanel, /nativeAppUpdate\?\.currentVersion/);
  assert.match(settingsPanel, /nativeAppUpdate\?\.state/);
  assert.doesNotMatch(settingsPanel, /<span>0\.1\.0<\/span>/);
});

test("Framework managed updates reuse the projected App action bus", () => {
  const settingsActionFlow = app.match(/async function runSettingsAction\([\s\S]*?\n  async function runSettingsHostAction/)?.[0] ?? "";
  assert.match(app, /readProjectedManagedUpdateActions\(state\)/);
  assert.match(app, /setProjectedManagedUpdateActions/);
  assert.match(app, /managedUpdateActions: \[[\s\S]*\.\.\.projectedManagedUpdateHostActions/);
  assert.match(app, /runSettingsAction\(\{[\s\S]*actionId: projectedAction\.actionId/);
  assert.match(settingsActionFlow, /dryRun: true/);
  assert.match(settingsActionFlow, /payload: \{ \.\.\.request\.payload, confirmed: true \}[\s\S]*dryRun: false/);
  assert.match(settingsActionFlow, /payload: \{ \.\.\.confirmation\.request\.payload, confirmed: true \}[\s\S]*dryRun: false/);
  assert.match(settingsActionFlow, /captureManagedUpdateReceipt\(receipt\)/);
  assert.match(settingsActionFlow, /await loadState\(settings\.runtimeProfile\)/);
  assert.doesNotMatch(app, /Framework 尚未投影此更新操作|Framework has not projected this update operation/);
});

test("Framework managed companions are projected into Capabilities through the App action bus", () => {
  assert.match(settingsPanel, /model\.managedCompanions/);
  assert.match(settingsPanel, /data-testid="opl-managed-companion"/);
  assert.match(app, /model\.managedCompanions\.some/);
});

test("channel_access stays declarative and forwards only owner-projected scoped input", () => {
  assert.match(contributionComponents, /viewType === "channel_access"/);
  assert.match(contributionComponents, /readChannelAccessResult/);
  assert.match(contributionComponents, /owner\.onAction\(entry, command, action\.input\)/);
  assert.match(contributionComponents, /entry\.view\?\.viewType === "channel_access" \? null : <ContributionActions/);
  assert.match(contributionComponents, /data-testid="opl-channel-access-pairings"/);
  assert.match(contributionComponents, /data-testid="opl-channel-access-users"/);
  assert.match(contributionComponents, /result\.connection\?\.state === "qr_ready"/);
  assert.match(contributionComponents, /qrChallenge\.expiresAtMs > Date\.now\(\)/);
  assert.match(app, /createOplContributionActionRequest\(entry, command, confirmed\)/);
  assert.match(app, /actionRequest\.payload\.input = input/);
  assert.match(app, /bridge\.readContribution\(\{ packageId: entry\.packageId, ref: entry\.view\.dataRef, input \}\)/);
  assert.doesNotMatch(`${contributionComponents}\n${contributionProjection}`, /transport_bindings|canonical_thread_id|AionCore/);
});

test("search, composer attachments, and Agent permissions route to real renderer and bridge behavior", () => {
  assert.doesNotMatch(app, /data-testid="opl-workspace-rail"/);
  assert.doesNotMatch(app, /setThreadSearchOpen\(true\)/);
  assert.doesNotMatch(app, /<ThreadSearchDialog/);
  assert.match(slotHost, /<SidebarRoot/);
  assert.match(slotHost, /name: "sidebar\.workspaces"/);
  assert.match(slotHost, /<WorkspaceBrowser/);
  assert.match(slotHost, /searchSessions=/);
  assert.match(app, /<ComposerCapabilityPalette/);
  assert.match(app, /function openComposerPalette\(\)/);
  assert.doesNotMatch(app, /openComposerPalette\("capabilities"\)|composerPaletteMode/);
  assert.match(app, /\.\.\.pendingSelections\.map\(\(selection\) => selection\.input\)/);
  assert.match(app, /\.\.\.\(codexThreadId \? \[\] : selectedAgentInputs\(\)\)/);
  assert.match(app, /permissions: settings\.agentPermissions/);
  assert.match(app, /setComposerSelections\(pendingSelections\)/);
  assert.match(settings, /agentPermissions: ":danger-full-access"/);
  assert.match(app, /permissions: settings\.agentPermissions/);
  for (const method of ["readCodexCapabilities", "readCodexPermissionProfiles", "pickFiles", "pickDirectory", "setLogDirectory"]) {
    assert.match(desktopPreload, new RegExp(`${method}:`));
    assert.match(hostCore, new RegExp(`case "${method}"`));
    assert.match(bridge, new RegExp(`${method}\\(`));
  }
  assert.match(appServerTransport, /this\.request\("permissionProfile\/list"/);
  assert.match(appServerTransport, /DEFAULT_PERMISSION_PROFILE = ":danger-full-access"/);
  assert.match(desktopMain, /dialog\.showOpenDialog/);
  assert.match(composerPalette, /catalog\.skills/);
  assert.match(composerPalette, /seenSkillNames/);
  assert.match(composerPalette, /if \(!open\) \{\s*setQuery\(""\)/s);
  assert.match(composerPalette, /catalog\.plugins/);
  assert.match(composerPalette, /catalog\.apps/);
});

test("DSH details tools project the current OPL project and a contained read-only workspace", () => {
  assert.match(clientCordis, /OPL_STUDIO_DETAIL_TABS/);
  assert.match(clientCordis, /项目进度/);
  assert.match(app, /const projectProgressWorkspace = currentSession\?\.workspace/);
  assert.match(app, /\?\? \(codexThreadId \? "" : selectedProject\?\.workspace \?\? ""\)/);
  assert.match(app, /selectProjectProgress\(projectProgressWorkspace/);
  assert.match(projectProgress, /normalizeProjectProgressWorkspace\(project\.workspacePath\) === workspace/);
  assert.match(projectProgress, /const currentStageId = nonEmpty\(item\.currentStageId\)/);
  assert.match(projectProgressPanel, /item\.currentStage \?/);
  assert.match(projectProgressPanel, /item\.attempt \?/);
  for (const method of ["listThreadWorkspace", "readThreadWorkspaceFile", "searchThreadWorkspace"]) {
    assert.match(desktopPreload, new RegExp(`${method}:`));
    assert.match(hostCore, new RegExp(`case "${method}"`));
    assert.match(bridge, new RegExp(`${method}\\(`));
  }
  for (const route of ["/api/threads/workspace/list", "/api/threads/workspace/read", "/api/threads/workspace/search"]) {
    assert.ok(webTransport.includes(route), `missing WebUI workspace route ${route}`);
  }
  assert.match(workspaceFilesPanel, /relativePath/);
  assert.doesNotMatch(workspaceFilesPanel, /rename|writeFile|git status|terminal/i);
});

test("DSH QueueDock owns queued follow-ups and steers the exact active Codex turn", () => {
  assert.match(slotHost, /function QueueDockSlot\(\)/);
  assert.match(slotHost, /updateQueue=\{studio\.updateQueue\}/);
  assert.match(slotHost, /name: "conversation\.input\.dock", id: "queue", order: 20/);
  assert.match(app, /await bridge\.steerTurn\(\{\s*threadId: active\.threadId,\s*expectedTurnId: active\.turnId,/s);
  assert.doesNotMatch(`${app}\n${slotHost}`, /host_queue/);
});

test("desktop visual shell uses vendored DeepSeek Harness roots and theme tokens", () => {
  const theme = read("src/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css");
  for (const marker of ["--dsw-static-deepseek-450", "--dsw-alias-bg-base", "--dsw-specific-sidebar-fill", "--dsw-alias-button-primary-fill"]) {
    assert.ok(theme.includes(marker), `missing DeepSeek Harness visual token: ${marker}`);
  }
  assert.match(adapterStyles, /\.opl-studio-dsh-root \{/);
  assert.doesNotMatch(adapterStyles, /\.opl-dsh-conversation-header \{/);
  assert.match(adapterStyles, /\.opl-dsh-context-panel \{/);
  assert.doesNotMatch(adapterStyles, /\.opl-dsh-workspace-rail|\.opl-dsh-hero-actions|composer-model-controls/);
  assert.match(adapterStyles, /letter-spacing: 0/);
  assert.match(styles, /\[data-streamdown="link"\]/);
  assert.match(styles, /\[data-streamdown="inline-code"\]/);
  assert.match(styles, /\[data-streamdown="code-block"\]/);
});

test("DSH rc2 controls resolve to the complete pinned source cohort and OPL-owned slots", () => {
  const primitiveAlias = ["src/vendor/deepseek-harness/packages/client/ui-primitives/src/index.ts"];
  assert.deepEqual(tsconfig.compilerOptions.paths["@deepseek-ai/dsh-client-ui-primitives"], primitiveAlias);
  assert.deepEqual(typecheckConfig.compilerOptions.paths["@deepseek-ai/dsh-client-ui-primitives"], primitiveAlias);
  assert.equal(sourceManifest.upstream.ref, "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e");
  assert.equal(sourceManifest.upstream.source_package_version, "0.1.1-rc.2");
  assert.equal(sourceManifest.snapshot.file_count, 277);
  assert.equal(sourceManifest.files.length, 277);
  assert.equal(sourceManifest.snapshot.byte_identical_to_pinned_ref, true);
  assert.ok(sourceManifest.snapshot.package_roots.includes("packages/client/ui-primitives/src"));
  assert.ok(sourceManifest.snapshot.package_roots.includes("packages/client/ui-renderer/src"));
  assert.equal(candidateEvidence.reused_oss_module_policy.vendored_file_count, 277);
  assert.equal(candidateEvidence.reused_oss_module_policy.byte_identical_to_pinned_ref, true);
  assert.deepEqual(candidateEvidence.reused_oss_module_policy.direct_reuse_modules, [
    "@deepseek-ai/cordis@4.0.1",
    "@deepseek-ai/cordis-plugin-group@1.0.1",
    "@deepseek-ai/cordis-plugin-include@1.0.6",
    "@deepseek-ai/cordis-plugin-loader@1.0.2",
    "@deepseek-ai/dsh-app-boot@0.1.1-rc.2",
    "@deepseek-ai/dsh-brand@0.1.1-rc.2",
    "@deepseek-ai/dsh-client-modules@0.1.1-rc.2",
    "@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2",
    "@deepseek-ai/dsh-client-ui-slots@0.1.1-rc.2",
    "@deepseek-ai/dsh-client-web@0.1.1-rc.2",
    "@deepseek-ai/dsh-home-paths@0.1.1-rc.2",
    "@deepseek-ai/dsh-host-frontend-static@0.1.1-rc.2",
    "@deepseek-ai/dsh-host-plugin-inventory@0.1.1-rc.2",
    "@deepseek-ai/dsh-host-webserver@0.1.1-rc.2",
    "@deepseek-ai/dsh-invariants@0.1.1-rc.2",
    "@deepseek-ai/dsh-launch-environment@0.1.1-rc.2",
    "@deepseek-ai/dsh-llm@0.1.1-rc.2",
    "@deepseek-ai/dsh-scope@0.1.1-rc.2",
    "@deepseek-ai/dsh-session@0.1.1-rc.2",
    "@deepseek-ai/dsh-system-prompt@0.1.1-rc.2",
    "@deepseek-ai/dsh-timeout@0.1.1-rc.2",
    "@deepseek-ai/dsh-tools@0.1.1-rc.2",
    "@deepseek-ai/dsh-typert-protocol@0.1.1-rc.2",
    "use-sync-external-store@1.2.0"
  ]);
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-client-ui-slots"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-invariants"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-llm"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-scope"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-session"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-timeout"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-client-web-react"], undefined);
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh-client-ui-renderer"], undefined);
  assert.equal(fs.existsSync(path.join(root, "src/integrations/deepseek-harness/uiPrimitives.tsx")), false);

  for (const [source, primitives] of [
    [app, ["MessageText", "Pill"]],
    [composerPalette, ["Button", "Input"]],
    [contributionComponents, ["Button", "Pill", "StateDot", "Tooltip"]]
  ]) {
    assert.match(source, /from "@deepseek-ai\/dsh-client-ui-primitives"/);
    for (const primitive of primitives) assert.match(primitiveIndex, new RegExp(`export \\{ ${primitive} \\}`));
  }

  assert.match(scopedSlots, /export function createSlotRenderer/);
  assert.match(slotHost, /ui-renderer\/src\/client\/scoped-slots\.tsx/);
  for (const slot of ["sidebar.brand.mark", "sidebar.brand.name", "conversation.hero.brand.mark", "conversation.input.attachments"]) {
    assert.ok(slotHost.includes(`register({ name: "${slot}", registrant: "opl-studio" }`));
  }
  assert.match(slotHost, /function OplBrandMarkSlot\(\): null \{ return null; \}/);
  assert.ok(!slotHost.includes(">\n      OPL\n    </span>"));
  assert.match(slotHost, /function OplBrandNameSlot\(\) \{ return <>One Person Lab<\/>; \}/);
  assert.match(slotHost, /function EmptyAttachmentSlot\(\) \{ return null; \}/);
  assert.match(slotHost, /useHostDescription=\{\(selector: any\) => selector\(undefined\)\}/);
  assert.match(runtimeShim, /export function abbreviateHomePath/);
  assert.match(runtimeShim, /isWindowsStylePath/);
  assert.match(bunBuild, /"process\.env\.DSH_CLIENT_COMMIT_HASH": JSON\.stringify\(""\)/);
  assert.match(slotHost, /"hero.headline": \["One Person Lab", "One Person Lab"\]/);
  assert.match(slotHost, /"hero.preview": \["预览版", "Preview"\]/);
  assert.match(slotHost, /function SettingsHeaderSlot\(\) \{ return <>One Person Lab<\/>; \}/);
  assert.doesNotMatch(main, /--opl-brand-logo/);
  assert.doesNotMatch(main, /branding\/opl-app-logo\.png/);
});

test("Studio boots as the pinned DSH Application Host while Codex remains the thread owner", () => {
  assert.match(dshHost, /initProfile\(profileDir, \[\]\)/);
  assert.match(dshHost, /healProfilesModuleFallback/);
  assert.match(dshHost, /loadOverlayPatches/);
  assert.doesNotMatch(dshProfile, /dsh-base/);
  for (const id of ["system-prompt", "tools", "webserver", "opl-dsh-tool-mcp", "opl-codex-native", "opl-framework-bridge", "opl-host-core", "plugin-inventory"]) {
    assert.match(dshProfile, new RegExp(`id: ${id}`));
  }
  for (const id of ["frontend-static", "client-modules", "opl-studio-client", "opl-web-routes"]) {
    assert.match(dshWebOverlay, new RegExp(`id: ${id}`));
  }
  assert.match(dshToolMcp, /StreamableHTTPServerTransport/);
  assert.match(dshToolMcp, /sendToolListChanged/);
  assert.match(codexNative, /const name = "opl_studio_dsh"/);
  assert.match(codexNative, /codexArgsWithDshToolMcp/);
  assert.match(codexNative, /bearer_token_env_var/);
  assert.match(codexNative, /required=true/);
  assert.equal(candidateEvidence.application_host.codex_runtime_owner, "opl-codex-native");
  assert.equal(candidateEvidence.application_host.dsh_base_loaded, false);
  assert.equal(candidateEvidence.application_host.active_shell_adopted, false);
  assert.equal(candidateEvidence.application_host.release_ready, false);
});

test("primary canvas hides its scrollbar without disabling scrolling", () => {
  assert.match(conversationStyles, /\.scrollBody \{[^}]*overflow-y: auto;[^}]*overflow-x: hidden;/s);
  assert.match(styles, /\.settings-detail \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;/s);
  const workspaceStyles = read("src/vendor/deepseek-harness/packages/client/ui-workspace/src/client/WorkspaceBrowser.module.css");
  assert.match(workspaceStyles, /\.list \{[\s\S]*overflow-y: auto;/);
  assert.match(styles, /\.opl-workspace-browser-seat \{[^}]*overflow-y: auto;/s);
  assert.match(styles, /\.opl-workspace-browser-seat \[role="tree"\] \{[^}]*overflow: visible;/s);
  assert.match(styles, /\.sidebar-scroll > \*,[\s\S]*\.thread-directory-row \{[^}]*min-width: 0;[^}]*max-width: 100%;/s);
  assert.match(styles, /\.history-list li \.thread-directory-open \{[^}]*max-width: 100%;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.history-list li \.thread-directory-open \.thread-directory-copy \{[^}]*max-width: 100%;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.thread-directory-copy strong \{[^}]*max-width: 100%;[^}]*display: block;/s);
  assert.match(adapterStyles, /\.opl-dsh-context-panel \.context-scroll \{[^}]*overflow-y: auto;/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.composer-palette \{[^}]*position: fixed;[^}]*inset: 54px 0 0 56px;/s);
});

test("DSH AppFrame owns bounded sidebar/details resize and responsive collapse", () => {
  assert.match(appFrame, /computeColumns\(viewport, sidebarPreference/);
  assert.match(appFrame, /const narrow = viewport < SIDEBAR_AUTO_COLLAPSE/);
  assert.match(appFrame, /actions\.setSidebar\(sidebarBase\.current \+ dx\)/);
  assert.match(appFrame, /actions\.setDetails\(detailsBase\.current - dx\)/);
  assert.match(appFrame, /<DragHandle side="sidebar"/);
  assert.match(appFrame, /<DragHandle side="details"/);
  assert.match(appFrameStyles, /grid-template-rows: 100%/);
  assert.match(appFrameStyles, /transition: grid-template-columns/);
  assert.doesNotMatch(app, /data-testid="opl-sidebar-resizer"/);
});

test("OPL overlays and DSH resize handles expose complete keyboard accessibility", () => {
  assert.match(settingsPanel, /confirmationDialogRef/);
  assert.match(settingsPanel, /trapDialogFocus\(event, confirmationDialogRef\.current\)/);
  assert.match(settingsPanel, /const focusable = focusableElements\(root\)/);
  assert.match(settingsPanel, /event\.key === "Escape"/);
  assert.match(settingsPanel, /previousFocus\.focus\(\)/);

  assert.match(composerPalette, /aria-modal="true"/);
  assert.match(composerPalette, /focusableElements\(rootRef\.current\)/);
  assert.match(composerPalette, /event\.key === "Tab"/);
  assert.match(composerPalette, /previousFocus\.focus\(\)/);
  assert.doesNotMatch(composerPalette, /autoFocus/);
  assert.ok(
    composerPalette.indexOf("const previousFocus") < composerPalette.indexOf('querySelector<HTMLInputElement>("input")?.focus'),
    "composer must capture the trigger before moving focus to search"
  );

  assert.match(slotHost, /className="opl-mobile-details-overlay"\s*role="dialog"\s*aria-modal="true"\s*aria-labelledby=/);
  assert.match(slotHost, /className=\{wide \? undefined : "visually-hidden"\}/);
  assert.match(slotHost, /focusableElements\(detailsDialogRef\.current\)/);
  assert.match(slotHost, /closeButtonRef\.current\?\.focus/);
  assert.match(slotHost, /previousFocus\.focus\(\)/);

  assert.match(slotHost, /function useSettingsDialogFocus/);
  assert.match(slotHost, /document\.addEventListener\("keydown", trapFocus, true\)/);
  assert.match(slotHost, /button\[aria-haspopup="dialog"\]/);
  assert.match(slotHost, /target\?\.isConnected/);
  assert.match(adapterStyles, /\.opl-settings-slot-root\s*\{[^}]*display:\s*contents/s);

  assert.match(slotHost, /handle\.setAttribute\("role", "separator"\)/);
  assert.match(slotHost, /handle\.setAttribute\("aria-orientation", "vertical"\)/);
  assert.match(slotHost, /handle\.setAttribute\("aria-valuenow"/);
  assert.match(slotHost, /event\.key === "ArrowLeft"/);
  assert.match(slotHost, /event\.key === "ArrowRight"/);
  assert.match(slotHost, /actions\.setSidebar/);
  assert.match(slotHost, /actions\.setDetails/);
  assert.doesNotMatch(appFrame, /role="separator"|aria-valuenow|onKeyDown/);
  for (const source of [settingsPanel, composerPalette, slotHost]) assert.match(source, /getClientRects\(\)\.length > 0/);
});

test("DSH Settings content consumes the canonical Gateway account read model", () => {
  assert.match(model, /app_settings_read_model/);
  assert.match(model, /opl_gateway_account_read_model\.v1/);
  assert.match(model, /gatewayAccountRecord\?\.display_name/);
  assert.match(model, /gatewayAccountProjection\.connection_mode === "account"/);
  assert.match(model, /gatewayConnectionMode/);
  assert.match(app, /<SettingsPanel/);
  assert.match(app, /renderSettings: renderStudioSettings/);
  assert.match(slotHost, /<SettingsRoot/);
  assert.match(settingsPanel, /opl-settings-gateway-username/);
  assert.match(settingsPanel, /gatewayConnectionPresentation/);
  assert.match(settingsPanel, /gatewayConnectionMode === "manual_key"/);
  assert.match(settingsPanel, /gateway\.displayName/);
  assert.match(settingsPanel, /gateway\.email/);
  assert.match(settingsPanel, /gateway\.usage\?\.todayTokens/);
  assert.match(settingsPanel, /stateLoading \? "loading" : stateFailed \? "attention_needed"/);
  assert.match(settingsPanel, /正在读取 OPL App 状态/);
  assert.match(settingsPanel, /暂时不可用/);
  assert.doesNotMatch(settingsPanel, /missingGatewayLabel|missingGatewayDetail/);
  assert.doesNotMatch(settingsPanel, /<SettingRow label="AionCore"/);
  assert.doesNotMatch(settingsPanel, /Codex app-server · OPL App state\/action/);
  assert.doesNotMatch(`${app}\n${settingsPanel}\n${model}`, /masked_email/);
  assert.match(app, /readGatewayAccountCache/);
  assert.match(app, /writeGatewayAccountCache\(nextModel\.gatewayAccount\)/);
  assert.match(app, /markGatewayAccountCacheStale/);
  assert.match(gatewayCache, /opl\.app\.gatewayAccount\.lkg\.v1/);
  assert.match(gatewayCache, /sanitizeGatewayAccount/);
  assert.doesNotMatch(gatewayCache, /password|apiKey|receipt|stdout|stderr/);
  assert.doesNotMatch(settingsPanel, /gatewayDeviceLabel|设备名称|Device name/);
  assert.doesNotMatch(gatewayLoginHost, /deviceLabel|device_label/);
});

test("Settings uses the App-owned navigation groups and one shared read model", () => {
  for (const id of ["overview", "account_models", "connections_deployment", "workspace", "agents_capabilities", "runtime_maintenance", "preferences"]) {
    assert.match(settingsPanel, new RegExp(`id: "${id}"`));
  }
  for (const destination of ["account", "models", "resources", "storage", "instructions", "services", "updates", "diagnostics", "about"]) {
    assert.match(settingsPanel, new RegExp(`id: "${destination}"`));
  }
  assert.match(model, /settingsProjection/);
  assert.match(model, /codex_model_policy/);
  assert.match(model, /workspace_services/);
  assert.match(model, /storage_lifecycle/);
  assert.match(model, /codex_personalization/);
  assert.match(model, /ordinary_next_actions/);
  assert.match(model, /readManagedUpdateProjection/);
  assert.match(model, /mergeManagedUpdateProjections/);
  assert.match(app, /captureManagedUpdateReceipt\(receipt\)/);
  assert.match(app, /managedUpdate=\{managedUpdate\}/);
  assert.match(app, /setCarrierDiagnostics\(state\.carrierDiagnostics\)/);
  assert.match(app, /carrierDiagnostics=\{carrierDiagnostics\}/);
  assert.match(app, /capabilityCatalog=\{capabilityCatalog\}/);
  assert.match(app, /capabilityStatus=\{capabilityStatus\}/);
  assert.match(settingsPanel, /opl-settings-capability-directory/);
  assert.match(settingsPanel, /opl-settings-user-instructions-editor/);
  assert.match(settingsPanel, /opl-settings-additional-instructions-editor/);
  assert.match(settingsPanel, /codex_user_instructions_restore_opl_flow_default/);
  assert.match(app, /additionalInstructions: codexThreadId \? undefined : additionalConversationInstructions/);
  assert.match(app, /dockerDiagnosticFromReceipt\(receipt\)/);
  assert.match(settingsPanel, /feedbackDestinationRef\.current === selectedDestination/);
  assert.match(slotHost, /FirstRunOnboardingSlot/);
  assert.match(desktopPreload, /readInitialize:/);
  assert.match(hostCore, /case "readInitialize"/);
  assert.match(settingsPanel, /aria-label=\{refreshLabel\}/);
  assert.match(styles, /\.settings-icon-button \{/);
  assert.match(app, /await bridge\.setLogDirectory\(\{ path: selected\.path \}\)/);
  assert.doesNotMatch(settingsPanel, /createBrowserBridge|\.readState\(/);
  assert.match(settingsPanel, /carrierDiagnostics\.application\?\.systemInfo\.logDir/);
  assert.match(settingsPanel, /carrierDiagnostics\.setLogDirectorySupported/);
  assert.match(webTransport, /setLogDirectory: \(\) => Promise\.resolve/);
  assert.doesNotMatch(webTransport, /\/api\/.*log.*director/i);
  for (const componentId of ["opl_app", "opl_base", "opl_packages"]) {
    assert.match(settingsPanel, new RegExp(`component\\("${componentId}"\\)`));
  }
  assert.match(settingsPanel, /settings_apply_opl_packages/);
  assert.match(settingsPanel, /shortcut_id: shortcut\.shortcutId/);
  assert.match(settingsPanel, /visible,/);
  assert.match(settingsPanel, /sort_order: sortOrder/);
  assert.match(settingsRoot, /renderSlot\('settings\.section'/);
  assert.match(slotHost, /settingsDestinations\("en"\)\.entries\(\)/);
  assert.match(slotHost, /id: settingsSectionId\(destination\.id\)/);
  assert.match(slotHost, /renderSettings\(destination, renderContribution \?\? undefined\)/);
  assert.doesNotMatch(settingsPanel, /settings-mobile-navigation/);
  assert.doesNotMatch(settingsPanel, /useState<SettingsDestinationId>/);
  assert.doesNotMatch(styles, /grid-template-columns: 220px minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /\.settings-mobile-navigation/);
});

test("Settings directly reuses DSH appearance controls and applies the selected palette", () => {
  assert.match(settingsPanel, /from "\.\.\/vendor\/deepseek-harness\/packages\/client\/ui-theme\/src\/client\/AppearanceRow"/);
  assert.match(settingsPanel, /<AppearanceRow/);
  assert.match(app, /document\.body\.toggleAttribute\("data-ds-dark-theme", dark\)/);
  assert.match(app, /matchMedia\?\.\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(settings, /theme: "system" \| "light" \| "dark"/);
  assert.match(styles, /--opl-text: var\(--dsw-alias-label-primary\)/);
  assert.match(styles, /--opl-canvas: var\(--dsw-alias-bg-base\)/);
});

test("ordinary startup waits for four truthful readiness reads before exposing the shell", () => {
  const startupView = app.match(/if \(!startupGateOpen\) \{[\s\S]*?\n  return renderShell\(/)?.[0] ?? "";
  assert.match(app, /void Promise\.all\(\[\s*loadState\(settings\.runtimeProfile\),\s*loadThreadDirectory\(true\),\s*loadModels\(\),\s*loadCapabilities\(true\)\s*\]\)/s);
  assert.match(app, /const startupReadyCount = startupStages\.filter\(\(stage\) => stage\.status === "ready"\)\.length/);
  assert.match(app, /const startupAllReady = startupReadyCount === startupStages\.length/);
  assert.match(app, /globalThis\.setTimeout\(\(\) => setStartupTimedOut\(true\), 20_000\)/);
  assert.match(app, /const openError = await openThread\(savedThread\)/);
  assert.match(app, /setThreadDirectoryStatus\("error"\);\s*setThreadDirectoryError\(openError\);\s*return;/s);
  for (const id of ["app-state-and-agents", "conversations", "models", "capabilities"]) {
    assert.match(app, new RegExp(`id: "${id}"`));
  }
  assert.match(startupView, /`已就绪 \$\{startupReadyCount\} \/ \$\{startupStages\.length\}`/);
  assert.match(startupView, /data-testid="opl-startup-readiness"/);
  assert.match(startupView, /<div className="startup-readiness-wordmark">One Person Lab<\/div>/);
  assert.doesNotMatch(startupView, /startup-readiness-wordmark[^\n]*OPL/);
  assert.match(startupView, /重新加载/);
  assert.match(startupView, /受限进入/);
  assert.doesNotMatch(startupView, /%|progressPercent|Math\.round/);
  assert.match(styles, /\.startup-readiness \{[^}]*position: fixed;[^}]*inset: 0;/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.startup-readiness \{/s);
});

test("composer separates OPL standard agents from Skills, connections, and other modules", () => {
  assert.match(app, /agentPresets: \[/);
  assert.match(app, /id: "opl-daily-work"/);
  assert.match(app, /standardAgentSeatPresentationZh/);
  assert.match(app, /item\.packageRole === "standard_agent"/);
  assert.match(app, /item\.official/);
  assert.match(app, /item\.readiness\.selectable/);
  assert.match(app, /item\.homeShortcuts\.some\(\(shortcut\) => Boolean\(shortcut\.route\)\)/);
  assert.match(app, /standardAgentSeatPresentationZh\[left\.packageId\]\?\.order/);
  assert.match(app, /Number\.MAX_SAFE_INTEGER/);
  assert.match(app, /const formalName = agent\.displayNameI18n\.en \?\? agent\.label/);
  assert.match(app, /`\$\{formalName\} · \$\{description\}`/);
  assert.match(slotHost, /<AgentPresetSeat/);
  assert.match(slotHost, /name: "conversation\.hero\.agentPreset"/);
  assert.doesNotMatch(composerPalette, /standardAgents|OPL 标准智能体|data-testid="opl-standard-agents"/);
  assert.match(composerPalette, /其他模块/);
  assert.match(styles, /\.composer-palette \{[^}]*max-height: min\(520px, calc\(50dvh - 64px\)\);/s);
});

test("desktop uses DSH columns and mobile keeps full-height thread dialogs", () => {
  assert.match(appFrame, /gridTemplateColumns: `\$\{cols\.sidebar\}px minmax\(0, 1fr\) \$\{cols\.details\}px`/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\[role="dialog"\]\[aria-labelledby\]:has\(> nav\) > nav > div:last-child/);
  assert.match(styles, /flex-direction: row/);
  assert.match(app, /conversation\.scrollTop = conversation\.scrollHeight/);
  assert.match(slotHost, /<WorkspaceBrowser/);
  assert.match(styles, /\.thread-detail-popover,\s*\.thread-confirmation-dialog \{\s*inset: 0;/s);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /border-radius: 0/);
  assert.match(styles, /\.history-list li \.thread-directory-open \.thread-directory-copy/);
  assert.match(styles, /\.message\.system\.subagent \.message-frame/);
  assert.doesNotMatch(styles, /\.coordination-/);
  assert.match(styles, /\.composer-permissions select \{[^}]*max-width: 118px;/s);
});

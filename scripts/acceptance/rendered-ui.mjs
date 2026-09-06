import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "../build-renderer.mjs";
import { CodexAppServerTransport } from "../webui-host/app-server-transport.mjs";
import { createWebUiHost } from "../webui-host/http-host.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = fileURLToPath(new URL("../webui-host/fixtures/fake-app-server.mjs", import.meta.url));
const outputRoot = path.join(repositoryRoot, "out", "acceptance");
const session = `opl-rendered-${process.pid}`;

function run(executable, args, { cwd = repositoryRoot, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${executable} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
    });
  });
}

async function cli(args, cwd) {
  return run("npx", ["--yes", "--package", "@playwright/cli", "playwright-cli", "--json", `-s=${session}`, ...args], { cwd });
}

async function evaluate(expression, cwd) {
  const result = await cli(["eval", expression], cwd);
  const envelope = JSON.parse(result.stdout.trim());
  return typeof envelope.result === "string" ? JSON.parse(envelope.result) : envelope.result;
}

async function digestFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function git(...args) {
  return (await run("git", args)).stdout.trim();
}

async function latestScreenshot(cliRoot) {
  const directory = path.join(cliRoot, ".playwright-cli");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".png")).sort();
  assert.ok(files.length, "Playwright CLI emitted no screenshot");
  return path.join(directory, files.at(-1));
}

const opl = {
  readState: async (profile) => ({ profile, app_state: { meta: { profile } }, readback: { exitCode: 0 } }),
  readFullDrilldown: async () => ({ detail: "full", drilldown: {}, readback: { exitCode: 0 } }),
  readContribution: async (request) => ({ packageId: request.packageId, ref: request.ref, result: {} }),
  executeAction: async (request) => ({ actionId: request.actionId, status: "preview_ready" })
};

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-rendered-acceptance-"));
const cliRoot = path.join(tempRoot, "playwright");
await mkdir(cliRoot, { recursive: true });
let host;

try {
  buildRenderer({ outDir: path.join(repositoryRoot, "dist", "webui"), htmlName: "index.html", jsName: "renderer.js" });
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: tempRoot,
    env: { ...process.env, FAKE_APP_SERVER_INCLUDE_PROJECTLESS: "1" },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  host = await createWebUiHost({ transport, opl, webRoot: path.join(repositoryRoot, "dist", "webui") });
  const baseUrl = host.url;

  await cli(["open", baseUrl], cliRoot);
  await cli(["resize", "1440", "900"], cliRoot);
  const wide = await evaluate(`() => ({
    title: document.title,
    brand: document.querySelector('[data-testid="opl-studio-root"]')?.textContent?.includes('One Person Lab') === true,
    root: Boolean(document.querySelector('[data-testid="opl-studio-root"]')),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
    viewport: [window.innerWidth, window.innerHeight]
  })`, cliRoot);
  assert.deepEqual(wide.viewport, [1440, 900]);
  assert.equal(wide.title, "One Person Lab");
  assert.equal(wide.brand, true);
  assert.equal(wide.root, true);
  assert.equal(wide.horizontalOverflow, false);
  await evaluate(`() => { document.querySelector('[data-testid="opl-context-inspector-trigger"]').click(); return true; }`, cliRoot);
  const contextMenu = await evaluate(`() => Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent.trim())`, cliRoot);
  assert.deepEqual(contextMenu, ["项目进度", "文件与结果", "智能体与能力"]);
  await cli(["press", "Escape"], cliRoot);

  const sidebarRecent = await evaluate(`() => {
    const seat = document.querySelector('.opl-workspace-browser-seat');
    const recent = document.querySelector('.opl-recent-sessions');
    const heading = document.querySelector('#opl-recent-sessions-title');
    const workspaceGroup = seat?.querySelector('[role="treeitem"][aria-expanded]');
    const recentRows = recent ? Array.from(recent.querySelectorAll('[role="treeitem"]')) : [];
    const scrollOwners = seat ? [seat, ...seat.querySelectorAll('*')].filter((element) => {
      const overflowY = getComputedStyle(element).overflowY;
      return overflowY === 'auto' || overflowY === 'scroll';
    }) : [];
    return {
      heading: heading?.textContent?.trim(),
      headingIsTreeItem: heading?.getAttribute('role') === 'treeitem' || Boolean(heading?.closest('[role="treeitem"]')),
      headingExpanded: heading?.getAttribute('aria-expanded'),
      headingHasIcon: Boolean(heading?.querySelector('svg')),
      recentRowCount: recentRows.length,
      workspaceCollapsible: Boolean(workspaceGroup),
      recentAfterWorkspaceBrowser: Boolean(seat?.firstElementChild && recent && (seat.firstElementChild.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING)),
      scrollOwnerCount: scrollOwners.length,
      scrollOwnerClass: scrollOwners[0]?.className ?? null
    };
  }`, cliRoot);
  assert.deepEqual(sidebarRecent, {
    heading: "最近",
    headingIsTreeItem: false,
    headingExpanded: null,
    headingHasIcon: false,
    recentRowCount: 1,
    workspaceCollapsible: true,
    recentAfterWorkspaceBrowser: true,
    scrollOwnerCount: 1,
    scrollOwnerClass: "opl-workspace-browser-seat"
  });

  const settingsOpen = await evaluate(`async () => {
    const trigger = document.querySelector('button[aria-haspopup="dialog"]');
    trigger?.click();
    await new Promise(requestAnimationFrame);
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    return {
      open: Boolean(dialog),
      activeLabel: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
      sections: dialog ? Array.from(dialog.querySelectorAll('nav button')).map((item) => item.textContent?.trim()) : []
    };
  }`, cliRoot);
  assert.equal(settingsOpen.open, true);
  assert.equal(settingsOpen.activeLabel, "关闭");
  assert.deepEqual(settingsOpen.sections, ["概览", "账户与模型", "连接与访问", "工作区", "智能体与能力", "运行与维护", "偏好", "关于"]);

  const focusBounds = await evaluate(`() => {
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = dialog ? Array.from(dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0) : [];
    const label = (element) => element?.getAttribute('aria-label') ?? element?.textContent?.trim();
    focusable[0]?.focus();
    return { count: focusable.length, first: label(focusable[0]), last: label(focusable.at(-1)) };
  }`, cliRoot);
  assert.ok(focusBounds.count > 1);
  await cli(["press", "Shift+Tab"], cliRoot);
  const trapped = await evaluate(`() => ({
    label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]'))
  })`, cliRoot);
  assert.equal(trapped.insideDialog, true);
  assert.equal(trapped.label, focusBounds.last);

  await cli(["press", "Escape"], cliRoot);
  const restored = await evaluate(`() => ({
    label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
    expanded: document.activeElement?.getAttribute('aria-expanded'),
    dialogCount: document.querySelectorAll('[role="dialog"]').length
  })`, cliRoot);
  assert.deepEqual(restored, { label: "设置", expanded: "false", dialogCount: 0 });

  await cli(["screenshot"], cliRoot);
  const wideScreenshot = await latestScreenshot(cliRoot);
  await cli(["resize", "400", "800"], cliRoot);
  const narrow = await evaluate(`() => ({
    root: Boolean(document.querySelector('[data-testid="opl-studio-root"]')),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
    viewport: [window.innerWidth, window.innerHeight],
    promptVisible: document.querySelector('[data-composer-input]')?.getClientRects().length > 0,
    selectedModelLabel: document.querySelector('button[aria-label^="选择模型"] span')?.textContent?.trim()
  })`, cliRoot);
  assert.deepEqual(narrow.viewport, [400, 800]);
  assert.equal(narrow.root, true);
  assert.equal(narrow.horizontalOverflow, false);
  assert.equal(narrow.promptVisible, true);
  assert.equal(narrow.selectedModelLabel, "自动（推荐）");
  await cli(["screenshot"], cliRoot);
  const narrowScreenshot = await latestScreenshot(cliRoot);

  await evaluate(`() => { document.querySelector('[data-composer-input]').focus(); return true; }`, cliRoot);
  await cli(["type", "DSH 中文输入 regression"], cliRoot);
  await cli(["press", "Shift+Enter"], cliRoot);
  await cli(["type", "second line"], cliRoot);
  const composerText = await evaluate(`() => ({
    text: document.querySelector('[data-composer-input]').innerText,
    sendEnabled: !document.querySelector('button[aria-label="发送"]').disabled
  })`, cliRoot);
  assert.equal(composerText.text, "DSH 中文输入 regression\nsecond line");
  assert.equal(composerText.sendEnabled, true);
  await cli(["press", process.platform === "darwin" ? "Meta+z" : "Control+z"], cliRoot);
  const undone = await evaluate(`() => document.querySelector('[data-composer-input]').innerText`, cliRoot);
  assert.notEqual(undone, composerText.text);
  await cli(["press", process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z"], cliRoot);
  const redone = await evaluate(`() => document.querySelector('[data-composer-input]').innerText`, cliRoot);
  assert.equal(redone, composerText.text);
  await cli(["press", "Enter"], cliRoot);
  const submitted = await evaluate(`async () => {
    const deadline = Date.now() + 5000;
    while (!document.body.innerText.includes('completed turn-') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    return {
      completed: document.body.innerText.includes('completed turn-'),
      draft: document.querySelector('[data-composer-input]').innerText.trim()
    };
  }`, cliRoot);
  assert.deepEqual(submitted, { completed: true, draft: "" });

  await mkdir(outputRoot, { recursive: true });
  const wideOutput = path.join(outputRoot, "webui-1440x900.png");
  const narrowOutput = path.join(outputRoot, "webui-400x800.png");
  await copyFile(wideScreenshot, wideOutput);
  await copyFile(narrowScreenshot, narrowOutput);
  const [commit, tree] = (await git("rev-parse", "HEAD", "HEAD^{tree}")).split("\n");
  const sourceStatus = await git("status", "--porcelain", "--untracked-files=no");
  const vendorManifest = JSON.parse(await readFile(path.join(repositoryRoot, "src", "composition", "deepseekHarnessSourceManifest.json"), "utf8"));
  const receipt = {
    schema: "opl_studio_rendered_ui_acceptance.v1",
    status: "passed",
    evidenceLayer: "local_rendered_candidate",
    carrier: "shared_webui",
    source: { commit, tree, clean: sourceStatus === "" },
    cohort: {
      rendererSha256: await digestFile(path.join(repositoryRoot, "dist", "webui", "renderer.js")),
      packageLockSha256: await digestFile(path.join(repositoryRoot, "package-lock.json")),
      dshManifestSha256: await digestFile(path.join(repositoryRoot, "src", "composition", "deepseekHarnessSourceManifest.json")),
      dshUpstreamRef: vendorManifest.upstream.ref,
      dshVendoredFileCount: vendorManifest.snapshot.file_count
    },
    assertions: { wide, contextMenu, sidebarRecent, settingsOpen, trapped, restored, narrow, composerText, undone, redone, submitted },
    screenshots: [
      { viewport: "1440x900", path: path.relative(repositoryRoot, wideOutput), sha256: await digestFile(wideOutput) },
      { viewport: "400x800", path: path.relative(repositoryRoot, narrowOutput), sha256: await digestFile(narrowOutput) }
    ],
    activeShellAdopted: false,
    installedEvidence: false,
    releaseReady: false
  };
  await writeFile(path.join(outputRoot, "rendered-ui-acceptance.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await cli(["close"], cliRoot).catch(() => undefined);
  if (host) await host.close().catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true });
}

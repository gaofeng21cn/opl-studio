import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "../build-renderer.mjs";
import { CodexAppServerTransport } from "../../src/host/app-server-transport.mjs";
import { createWebUiHost } from "../../src/host/http-host.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = fileURLToPath(new URL("../../src/host/fixtures/fake-app-server.mjs", import.meta.url));
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
  readInitialize: async () => ({ system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } }, readback: { exitCode: 0 } }),
  readState: async (profile) => ({ profile, app_state: { meta: { profile } }, readback: { exitCode: 0 } }),
  readFullDrilldown: async () => ({ detail: "full", drilldown: {}, readback: { exitCode: 0 } }),
  readContribution: async (request) => ({ packageId: request.packageId, ref: request.ref, result: {} }),
  executeAction: async (request) => ({ actionId: request.actionId, status: "preview_ready" })
};

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-rendered-acceptance-"));
const cliRoot = path.join(tempRoot, "playwright");
const appServerLog = path.join(tempRoot, "app-server.jsonl");
await mkdir(cliRoot, { recursive: true });
await mkdir(outputRoot, { recursive: true });
let host;

try {
  buildRenderer({ outDir: path.join(repositoryRoot, "dist", "webui"), htmlName: "index.html", jsName: "renderer.js" });
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: tempRoot,
    env: { ...process.env, FAKE_APP_SERVER_INCLUDE_PROJECTLESS: "1", FAKE_APP_SERVER_LOG: appServerLog },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  host = await createWebUiHost({ transport, opl, dshHome: path.join(tempRoot, "dsh-home"), webRoot: path.join(repositoryRoot, "dist", "webui") });
  const baseUrl = host.url;

  await cli(["open", "about:blank"], cliRoot);
  await cli(["run-code", `async page => {
    await page.addInitScript(() => {
      window.__oplAcceptanceErrors = [];
      window.addEventListener('error', event => {
        if (event instanceof ErrorEvent) window.__oplAcceptanceErrors.push({ kind: 'error', message: event.message, stack: event.error?.stack });
      });
      window.addEventListener('unhandledrejection', event => {
        window.__oplAcceptanceErrors.push({ kind: 'unhandledrejection', message: String(event.reason), stack: event.reason?.stack });
      });
    });
  }`], cliRoot);
  await cli(["goto", baseUrl], cliRoot);
  await cli(["resize", "1440", "900"], cliRoot);
  const wide = await evaluate(`() => ({
    title: document.title,
    brand: document.querySelector('[data-testid="opl-studio-root"]')?.textContent?.includes('One Person Lab') === true,
    root: Boolean(document.querySelector('[data-testid="opl-studio-root"]')),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
    viewport: [window.innerWidth, window.innerHeight]
  })`, cliRoot);
  if (!wide.root) throw new Error(`renderer did not mount: ${(await cli(["console", "error"], cliRoot)).stdout}`);
  assert.deepEqual(wide.viewport, [1440, 900]);
  assert.equal(wide.title, "One Person Lab");
  assert.equal(wide.brand, true);
  assert.equal(wide.root, true);
  assert.equal(wide.horizontalOverflow, false);
  const iconSprite = await evaluate(`() => {
    const symbols = document.querySelectorAll('[data-dsh-icon-sprite] symbol');
    const references = Array.from(document.querySelectorAll('svg use')).map(use => use.getAttribute('href')).filter(href => href?.startsWith('#dsw-icon-'));
    return { count: document.querySelectorAll('[data-dsh-icon-sprite]').length, symbols: symbols.length, references: references.length, missing: references.filter(href => !document.querySelector(href)) };
  }`, cliRoot);
  assert.equal(iconSprite.count, 1);
  assert.ok(iconSprite.symbols > 0 && iconSprite.references > 0);
  assert.deepEqual(iconSprite.missing, []);
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
      customSeatScrolls: scrollOwners.includes(seat),
      officialViewport: Boolean(seat?.closest('[data-sidebar-scrollport]')),
      officialListArea: Boolean(seat?.querySelector('[data-sidebar-list-area]'))
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
    customSeatScrolls: false,
    officialViewport: true,
    officialListArea: true
  });

  const sidebarPanels = await evaluate(`async () => {
    const nav = document.querySelector('nav[aria-label="主页面"]');
    const labels = ['应用管理', '运行状态', '计划任务'];
    const icons = labels.map(label => Boolean(nav?.querySelector('button[aria-label="' + label + '"] svg use')));
    nav.querySelector('button[aria-label="更多"]').click();
    await new Promise(requestAnimationFrame);
    const initialMenu = Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent.trim());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    nav.querySelector('button[aria-label="从侧边栏取消固定计划任务"]').click();
    await new Promise(requestAnimationFrame);
    const unpinned = !nav.querySelector('button[aria-label="计划任务"]');
    nav.querySelector('button[aria-label="更多"]').click();
    await new Promise(requestAnimationFrame);
    const menuIcon = Boolean(document.querySelector('.opl-sidebar-more-entry [role="menuitem"] svg use'));
    document.querySelector('button[aria-label="固定计划任务"]').click();
    await new Promise(requestAnimationFrame);
    return { icons, initialMenu, unpinned, menuIcon, repinned: Boolean(nav.querySelector('button[aria-label="计划任务"]')) };
  }`, cliRoot);
  assert.deepEqual(sidebarPanels, { icons: [true, true, true], initialMenu: [], unpinned: true, menuIcon: true, repinned: true });

  const primaryPanels = [];
  for (const [label, testid] of [['应用管理', 'opl-app-management'], ['计划任务', 'opl-scheduled-tasks']]) {
    const result = await evaluate(`async () => {
      document.querySelector('nav[aria-label="主页面"] button[aria-label=${JSON.stringify(label)}]').click();
      await new Promise(requestAnimationFrame);
      return { label: ${JSON.stringify(label)}, mounted: Boolean(document.querySelector('[data-testid=${JSON.stringify(testid)}]')), selected: Boolean(document.querySelector('nav[aria-label="主页面"] button[aria-label=${JSON.stringify(label)}][aria-current="page"]')) };
    }`, cliRoot);
    assert.equal(result.mounted, true);
    assert.equal(result.selected, true);
    primaryPanels.push(result);
  }
  await evaluate(`async () => {
    document.querySelector('button[aria-label="新建任务"]').click();
    await new Promise(requestAnimationFrame);
    return true;
  }`, cliRoot);

  const recentMenu = await evaluate(`async () => {
    const row = document.querySelector('.opl-recent-session-list [data-row-key="session:thread-recent"]');
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    const deadline = Date.now() + 3000;
    while (!document.querySelector('[role="menuitem"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent.trim());
  }`, cliRoot);
  assert.deepEqual(recentMenu, ["重命名", "分叉会话", "归档会话"]);
  await evaluate(`() => { Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === '重命名').click(); return true; }`, cliRoot);
  const renameDialog = await evaluate(`async () => {
    const deadline = Date.now() + 3000;
    while (!document.querySelector('input[aria-label="会话名称"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    const input = document.querySelector('input[aria-label="会话名称"]');
    input.focus();
    return { value: input.value, dialog: Boolean(input.closest('[role="dialog"]')) };
  }`, cliRoot);
  assert.deepEqual(renameDialog, { value: "Thread thread-recent", dialog: true });
  await cli(["press", process.platform === "darwin" ? "Meta+a" : "Control+a"], cliRoot);
  await cli(["type", "Renamed recent task"], cliRoot);
  await cli(["press", "Enter"], cliRoot);
  const renamedRecent = await evaluate(`async () => {
    const deadline = Date.now() + 5000;
    const row = () => document.querySelector('.opl-recent-session-list [data-row-key="session:thread-recent"]');
    while (!row()?.textContent.includes('Renamed recent task') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return { renamed: row()?.textContent.includes('Renamed recent task'), dialogClosed: !document.querySelector('input[aria-label="会话名称"]') };
  }`, cliRoot);
  assert.deepEqual(renamedRecent, { renamed: true, dialogClosed: true });
  const renameMessages = (await readFile(appServerLog, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.ok(renameMessages.some(message => message.method === "thread/name/set" && message.params.threadId === "thread-recent" && message.params.name === "Renamed recent task"));

  const settingsOpen = await evaluate(`async () => {
    const trigger = document.querySelector('button[aria-haspopup="dialog"]');
    trigger?.click();
    await new Promise(requestAnimationFrame);
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    return {
      open: Boolean(dialog),
      activeLabel: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
      sections: dialog ? Array.from(dialog.querySelectorAll('button:has(.opl-settings-nav-label)')).map((item) => item.textContent?.trim()) : []
    };
  }`, cliRoot);
  assert.equal(settingsOpen.open, true);
  assert.equal(settingsOpen.activeLabel, "概览");
  assert.deepEqual(settingsOpen.sections, ["概览", "账户与模型", "连接与部署", "工作区", "扩展与应用", "运行与维护", "偏好", "关于"]);

  const focusBounds = await evaluate(`() => {
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = dialog ? Array.from(dialog.querySelectorAll('summary, button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0 && element.checkVisibility?.() !== false) : [];
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
  const narrowNavigation = await evaluate(`async () => {
    const opener = document.querySelector('[data-sidebar-opener]');
    opener.click();
    await new Promise(requestAnimationFrame);
    const dialog = document.querySelector('[data-shortcut-modal="sidebar"]');
    const more = dialog?.querySelector('button[aria-label="更多"]');
    more.click();
    await new Promise(requestAnimationFrame);
    return { drawer: dialog?.getAttribute('aria-modal') === 'true', moreOpen: more.getAttribute('aria-expanded') === 'true', menu: Array.from(document.querySelectorAll('[role="menuitem"]')).map(row => row.textContent.trim()) };
  }`, cliRoot);
  assert.deepEqual(narrowNavigation, { drawer: true, moreOpen: true, menu: [] });
  await cli(["press", "Escape"], cliRoot);
  await cli(["press", "Escape"], cliRoot);
  await evaluate(`() => { document.activeElement?.blur(); return true; }`, cliRoot);
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

  // Exercise the adapter through the rendered tree and the real Host transport:
  // a mounted conversation must remain selected, and busy submission must retain
  // localized labels and the distinct queue/steer delivery behavior.
  await cli(["resize", "1440", "900"], cliRoot);
  await evaluate(`() => {
    const group = document.querySelector('.opl-workspace-browser-seat [role="treeitem"][aria-expanded="false"]');
    group?.click();
    return true;
  }`, cliRoot);
  const sessionMenu = await evaluate(`async () => {
    const deadline = Date.now() + 5000;
    let row;
    while (!row && Date.now() < deadline) {
      row = document.querySelector('.opl-workspace-browser-seat [data-row-key^="session:"]');
      if (!row) await new Promise(resolve => setTimeout(resolve, 50));
    }
    const trigger = row?.querySelector('button[aria-label]');
    trigger?.click();
    const menuDeadline = Date.now() + 3000;
    while (!document.querySelector('[role="menuitem"]') && Date.now() < menuDeadline) await new Promise(resolve => setTimeout(resolve, 25));
    return {
      rowFound: Boolean(row),
      triggerFound: Boolean(trigger),
      items: Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent?.trim())
    };
  }`, cliRoot);
  assert.deepEqual(sessionMenu, { rowFound: true, triggerFound: true, items: ["重命名", "分叉会话", "归档会话"] });
  await cli(["press", "Escape"], cliRoot);
  const selection = [];
  for (const threadId of ["thread-idle", "thread-source", "thread-running"]) {
    const selected = await evaluate(`async () => {
      const label = ${JSON.stringify(`Thread ${threadId}`)};
      const rowDeadline = Date.now() + 5000;
      let row;
      while (!row && Date.now() < rowDeadline) {
        row = Array.from(document.querySelectorAll('[role="treeitem"][aria-selected]')).find(item => item.textContent.includes(label));
        if (!row) await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!row) throw new Error('Missing session row: ' + label + '; visible rows=' + Array.from(document.querySelectorAll('[role="treeitem"]')).map(item => item.textContent?.trim()).join(' | '));
      row.click();
      const deadline = Date.now() + 5000;
      while (document.querySelector('main strong')?.textContent !== label && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      return {
        header: document.querySelector('main strong')?.textContent,
        selected: Array.from(document.querySelectorAll('[role="treeitem"][aria-selected="true"]')).map(row => row.textContent.includes(label))
      };
    }`, cliRoot);
    assert.deepEqual(selected, { header: `Thread ${threadId}`, selected: [true] });
    selection.push({ threadId, ...selected });
  }
  const requestFrames = async () => (await readFile(appServerLog, "utf8")).trim().split("\n")
    .map(line => JSON.parse(line)).filter(frame => frame.direction === "client_to_server");
  const beforeQueue = (await requestFrames()).length;
  const queuedText = "DSH busy queue regression";
  const steerText = "DSH busy steer regression";
  await evaluate(`() => { document.querySelector('[data-composer-input]').focus(); return true; }`, cliRoot);
  await cli(["type", queuedText], cliRoot);
  const busyLabel = await evaluate(`() => ({
    localized: Boolean(document.querySelector('button[aria-label="排队发送"]:not(:disabled)')),
    rawKey: Boolean(document.querySelector('button[aria-label^="input.send."]'))
  })`, cliRoot);
  assert.deepEqual(busyLabel, { localized: true, rawKey: false });
  await evaluate(`() => { document.querySelector('button[aria-label="排队发送"]').click(); return true; }`, cliRoot);
  const queued = await evaluate(`async () => {
    const deadline = Date.now() + 5000;
    while (!document.querySelector('button[aria-label="编辑排队消息"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    return {
      visible: document.body.innerText.includes(${JSON.stringify(queuedText)}),
      editable: Boolean(document.querySelector('button[aria-label="编辑排队消息"]')),
      running: Boolean(document.querySelector('button[aria-label="停止"]')),
      draft: document.querySelector('[data-composer-input]').innerText.trim()
    };
  }`, cliRoot);
  assert.deepEqual(queued, { visible: true, editable: true, running: true, draft: "" });
  assert.equal((await requestFrames()).slice(beforeQueue).some(frame => ["turn/start", "turn/steer"].includes(frame.method)), false, "queue must wait for the running turn");
  await evaluate(`() => { document.querySelector('[data-composer-input]').focus(); return true; }`, cliRoot);
  await cli(["type", steerText], cliRoot);
  await cli(["press", process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"], cliRoot);
  const steered = (await requestFrames()).find(frame => frame.method === "turn/steer" && frame.params?.input?.some(item => item.text === steerText));
  assert.ok(steered, "accelerated Enter must steer through the App Server transport");
  assert.equal(steered.params.threadId, "thread-running");
  assert.equal(steered.params.expectedTurnId, "turn-running");
  const busySubmission = { busyLabel, queued, steer: { threadId: steered.params.threadId, turnId: steered.params.expectedTurnId } };

  for (const label of ["分叉会话", "归档会话"]) {
    await evaluate(`async () => {
      const row = document.querySelector('.opl-recent-session-list [data-row-key="session:thread-recent"]');
      if (!row) throw new Error('Recent session must remain available before the captured menu action');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 130, clientY: 250 }));
      const deadline = Date.now() + 3000;
      let item;
      while (!item && Date.now() < deadline) {
        item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(entry => entry.textContent.trim() === ${JSON.stringify(label)});
        if (!item) await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (!item) throw new Error('Menu action did not appear');
      item.click();
      return true;
    }`, cliRoot);
    if (label === "归档会话") {
      const archiveConfirmation = await evaluate(`async () => {
        const deadline = Date.now() + 3000;
        while (!document.querySelector('[data-testid="opl-thread-lifecycle-confirmation"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
        const dialog = document.querySelector('[data-testid="opl-thread-lifecycle-confirmation"]');
        const target = dialog?.querySelector('code')?.textContent;
        if (target === 'thread-recent') dialog.querySelector('footer button').click();
        return target;
      }`, cliRoot);
      assert.equal(archiveConfirmation, "thread-recent");
    }
    const method = label === "分叉会话" ? "thread/fork" : "thread/archive";
    const deadline = Date.now() + 5000;
    let seen = false;
    while (!seen && Date.now() < deadline) {
      const messages = (await readFile(appServerLog, "utf8")).trim().split("\n").map(line => JSON.parse(line));
      seen = messages.some(message => message.method === method && message.params.threadId === "thread-recent");
      if (!seen) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(seen, true, `${method} must act on the captured recent thread`);
  }
  const archivedRecent = await transport.readThread("thread-recent");
  assert.equal(archivedRecent.thread.archived, true);
  const archivedRowRemoved = await evaluate(`async () => {
    const deadline = Date.now() + 5000;
    while (document.querySelector('[data-row-key="session:thread-recent"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return !document.querySelector('[data-row-key="session:thread-recent"]');
  }`, cliRoot);
  assert.equal(archivedRowRemoved, true);
  const sessionMenuActions = { target: "thread-recent", renamed: true, forked: true, archived: archivedRecent.thread.archived, removedFromActiveList: archivedRowRemoved };

  const themeVariants = [];
  for (const theme of ['light', 'dark']) {
    await evaluate(`() => {
      const key = 'opl.studio.settings.v1';
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) || '{}'), locale: 'en', theme: ${JSON.stringify(theme)} }));
      return true;
    }`, cliRoot);
    await cli(["reload"], cliRoot);
    await cli(["resize", "1440", "900"], cliRoot);
    const variant = await evaluate(`async () => {
      const deadline = Date.now() + 5000;
      while (!document.querySelector('button[aria-label="More"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      const more = document.querySelector('button[aria-label="More"]');
      const newTask = document.querySelector('button[aria-label="New task"]');
      more.click(); await new Promise(requestAnimationFrame);
      return { theme: document.documentElement.getAttribute('data-ds-theme-source'), dark: document.body.hasAttribute('data-ds-dark-theme'), newTask: Boolean(newTask), menu: Array.from(document.querySelectorAll('[role="menuitem"]')).map(row => row.textContent.trim()), overflow: document.documentElement.scrollWidth > innerWidth };
    }`, cliRoot);
    assert.deepEqual(variant, { theme, dark: theme === 'dark', newTask: true, menu: [], overflow: false });
    themeVariants.push(variant);
    await cli(["screenshot"], cliRoot);
    await copyFile(await latestScreenshot(cliRoot), path.join(outputRoot, `webui-en-${theme}.png`));
    await cli(["press", "Escape"], cliRoot);
  }

  const unhandledErrors = await evaluate(`() => window.__oplAcceptanceErrors`, cliRoot);
  const consoleResponse = await cli(["console", "error"], cliRoot);
  const consoleErrorLog = JSON.parse(consoleResponse.stdout.trim()).result;
  const consoleErrors = consoleErrorLog.split(/\n(?=\[ERROR\])/).filter(message => message.startsWith("[ERROR]"));
  const nonBlockingWarnings = consoleErrors.filter(message => message.includes('Each child in a list should have a unique "key" prop'));
  const staticRequestErrors = consoleErrors.filter(message => message.includes("/favicon.ico") && message.includes("404 (Not Found)"));
  const unexpectedErrors = consoleErrors.filter(message => !nonBlockingWarnings.includes(message) && !staticRequestErrors.includes(message));
  const consoleReadback = { unhandledErrors, unexpectedErrors, nonBlockingWarnings, staticRequestErrors };
  assert.deepEqual(unhandledErrors, [], "the full interaction must produce no uncaught errors or unhandled rejections");
  assert.deepEqual(unexpectedErrors, [], "application console errors and failed settings log requests must be resolved");

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
    assertions: { consoleReadback, wide, iconSprite, contextMenu, sidebarRecent, sidebarPanels, primaryPanels, recentMenu, renameDialog, renamedRecent, sessionMenu, sessionMenuActions, settingsOpen, trapped, restored, narrow, narrowNavigation, themeVariants, composerText, undone, redone, submitted, selection, busySubmission },
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
} catch (error) {
  if (host) {
    const diagnostics = await cli(["console", "error"], cliRoot).catch(() => null);
    if (diagnostics) process.stderr.write(`Browser errors at the failed acceptance boundary:\n${diagnostics.stdout}\n`);
  }
  throw error;
} finally {
  await cli(["close"], cliRoot).catch(() => undefined);
  if (host) await host.close().catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true });
}

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

// Isolated synthetic Host: this script does not read or mutate real accounts,
// memories, scheduled tasks, or installed application state.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = path.join(repositoryRoot, "out", "acceptance");
const fakeAppServer = path.join(repositoryRoot, "src", "host", "fixtures", "fake-app-server.mjs");
const session = `opl-settings-${process.pid}`;
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-settings-acceptance-"));
const cliRoot = path.join(tempRoot, "playwright");
const results = {};
const screenshots = [];
let host;
let failure;

function run(executable, args, { cwd = repositoryRoot, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", code => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${executable} failed (${code}): ${stderr || stdout}`)));
  });
}

function cli(...args) {
  return run("npx", ["--yes", "--package", "@playwright/cli", "playwright-cli", "--json", `-s=${session}`, ...args], { cwd: cliRoot });
}

async function evaluate(fn, argument) {
  const source = `async () => (${fn.toString()})(${JSON.stringify(argument) ?? "undefined"})`;
  const response = JSON.parse((await cli("eval", source)).stdout.trim());
  if (response.isError) throw new Error(response.error);
  return typeof response.result === "string" ? JSON.parse(response.result) : response.result;
}

async function settle() {
  await evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return true; });
}

async function click(selector, label) {
  const clicked = await evaluate(({ selector, label }) => {
    const candidates = [...document.querySelectorAll(selector)];
    const target = candidates.find(element => label === undefined || element.textContent.trim() === label);
    if (!target) return false;
    target.click();
    return true;
  }, { selector, label });
  assert.equal(clicked, true, `Missing control: ${selector} ${label ?? ""}`);
  await settle();
}

async function panelState() {
  return evaluate(() => {
    const panel = document.querySelector('[data-testid="opl-settings-panel"]');
    const content = panel?.querySelector(".settings-content");
    const selected = panel?.querySelector('[role="tab"][aria-selected="true"]');
    return {
      view: panel?.dataset.mobileNav,
      destination: content?.dataset.section,
      heading: panel?.querySelector("h1")?.textContent.trim(),
      headingVisible: Boolean(panel?.querySelector("h1")?.getClientRects().length),
      contentVisible: Boolean(content?.getClientRects().length),
      selectedTab: selected?.textContent.trim(),
      selectedTabId: selected?.id,
      panelId: content?.id,
      panelRole: content?.getAttribute("role"),
      panelLabel: content?.getAttribute("aria-labelledby"),
      activeId: document.activeElement?.id,
      activeText: document.activeElement?.textContent.trim(),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
    };
  });
}

async function screenshot(name, viewport) {
  await cli("screenshot");
  const folder = path.join(cliRoot, ".playwright-cli");
  const captures = (await readdir(folder)).filter(file => file.endsWith(".png")).sort();
  assert.ok(captures.length, "No screenshot was captured");
  const target = path.join(outputRoot, name);
  await copyFile(path.join(folder, captures.at(-1)), target);
  screenshots.push({ path: path.relative(repositoryRoot, target), viewport, sha256: await digestFile(target) });
}

async function digestFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

const opl = {
  readState: async profile => ({ profile, app_state: { meta: { profile } }, readback: { exitCode: 0 } }),
  readFullDrilldown: async () => ({ detail: "full", drilldown: {}, readback: { exitCode: 0 } }),
  readContribution: async request => ({ packageId: request.packageId, ref: request.ref, result: { items: [] } }),
  executeAction: async request => ({ actionId: request.actionId, status: "preview_ready" }),
};

try {
  await mkdir(cliRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  buildRenderer({ outDir: path.join(repositoryRoot, "dist", "webui"), htmlName: "index.html", jsName: "renderer.js" });
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fakeAppServer],
    cwd: tempRoot,
    env: { ...process.env, FAKE_APP_SERVER_INCLUDE_PROJECTLESS: "1" },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000,
  });
  host = await createWebUiHost({ transport, opl, dshHome: path.join(tempRoot, "dsh-home"), webRoot: path.join(repositoryRoot, "dist", "webui") });
  await cli("open", host.url);
  await cli("resize", "1440", "900");
  await click('button[aria-haspopup="dialog"]');
  await cli("snapshot");

  const desktopRail = await evaluate(() => {
    const rail = document.querySelector('[data-shortcut-modal="settings"] > nav > [class*="navList"]');
    const buttons = [...rail.querySelectorAll(":scope > button")];
    const about = rail.querySelector('button:has([data-opl-settings-auxiliary="about"])');
    return {
      labels: buttons.map(button => button.textContent.trim()),
      aboutIsLast: buttons.at(-1) === about,
      aboutMarginTop: parseFloat(getComputedStyle(about).marginTop),
      aboutBottomGap: Math.round(rail.getBoundingClientRect().bottom - about.getBoundingClientRect().bottom),
      separator: getComputedStyle(about, "::before").borderTopWidth,
    };
  });
  assert.deepEqual(desktopRail.labels, ["概览", "账户与模型", "连接与部署", "工作区", "扩展与应用", "运行与维护", "偏好", "关于"]);
  assert.equal(desktopRail.aboutIsLast, true);
  assert.ok(desktopRail.aboutMarginTop > 100);
  assert.ok(desktopRail.aboutBottomGap >= 0 && desktopRail.aboutBottomGap < 4);
  assert.equal(desktopRail.separator, "1px");
  results.desktopRail = desktopRail;

  await click('button:has(.opl-settings-nav-label)', "扩展与应用");
  const tabs = await evaluate(() => {
    const panel = document.querySelector('[data-testid="opl-settings-panel"]');
    const tabs = [...panel.querySelectorAll('.settings-subnav [role="tab"]')];
    const content = panel.querySelector('[role="tabpanel"]');
    return {
      h1: [...panel.querySelectorAll("h1")].map(heading => heading.textContent.trim()),
      labels: tabs.map(tab => tab.textContent.trim()),
      selected: tabs.filter(tab => tab.getAttribute("aria-selected") === "true").map(tab => tab.id),
      tabStops: tabs.filter(tab => tab.tabIndex === 0).length,
      controls: tabs.map(tab => tab.getAttribute("aria-controls")),
      panelId: content.id,
      panelLabel: content.getAttribute("aria-labelledby"),
    };
  });
  assert.deepEqual(tabs.h1, ["扩展与应用"]);
  assert.deepEqual(tabs.labels, ["全部扩展", "智能体", "指令与上下文"]);
  assert.equal(tabs.tabStops, 1);
  assert.deepEqual(tabs.selected, ["settings-tab-capabilities"]);
  assert.ok(tabs.controls.every(id => id === tabs.panelId));
  assert.equal(tabs.panelLabel, tabs.selected[0]);
  results.desktopTabs = tabs;
  await screenshot("settings-desktop-1440x900.png", "1440x900");

  await evaluate(() => { document.querySelector('.settings-subnav [role="tab"][aria-selected="true"]').focus(); return true; });
  results.keyboard = [];
  for (const [key, destination] of [["ArrowRight", "agents"], ["End", "instructions"], ["Home", "capabilities"], ["ArrowLeft", "instructions"]]) {
    await cli("press", key);
    await settle();
    const state = await panelState();
    assert.equal(state.destination, destination, `Keyboard destination after ${key}`);
    assert.equal(state.activeId, `settings-tab-${destination}`, `Keyboard focus after ${key}`);
    results.keyboard.push({ key, destination: state.destination, activeId: state.activeId });
  }

  await click('.settings-subnav [role="tab"]', "全部扩展");
  await click('.settings-secondary-details > summary', "查看提供的技能与连接能力");
  const memoryClick = await evaluate(async () => {
    const row = [...document.querySelectorAll(".settings-row")].find(row => row.querySelector(".settings-row-label > span")?.textContent.trim() === "查看与纠正记忆");
    assert: if (!row) throw new Error("Memory configuration row is missing");
    row.querySelector("button").click();
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const panel = document.querySelector('[data-testid="opl-settings-panel"]');
    const memory = panel.querySelector("#settings-memory-context");
    return { destination: panel.querySelector(".settings-content").dataset.section, open: memory?.open, focused: memory?.contains(document.activeElement) };
  });
  assert.equal(memoryClick.destination, "instructions");
  assert.equal(memoryClick.open, true);
  results.memoryClick = memoryClick;

  const searchAvailable = await evaluate(async () => {
    const deadline = Date.now() + 2000;
    while (!document.querySelector(".sss-input") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const input = document.querySelector(".sss-input");
    input?.focus();
    return Boolean(input);
  });
  if (searchAvailable) {
    await cli("type", "memory");
    const searchResults = await evaluate(async () => {
      const deadline = Date.now() + 2000;
      while (!document.querySelector(".sss-item") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      return [...document.querySelectorAll(".sss-item")].map(item => item.querySelector(".sss-item-label")?.textContent.trim());
    });
    assert.ok(searchResults.includes("记忆与纠错"), `Memory search results: ${searchResults.join(", ")}`);
    await cli("press", "ArrowDown");
    await cli("press", "Enter");
    await settle();
    const searchResult = await panelState();
    const open = await evaluate(() => document.querySelector("#settings-memory-context")?.open);
    assert.equal(searchResult.destination, "instructions");
    assert.equal(open, true);
    results.memorySearch = { status: "passed", searchResults, destination: searchResult.destination, memoryOpen: open };

    await evaluate(() => {
      const input = document.querySelector(".sss-input");
      input?.focus();
      input?.setSelectionRange(0, input.value.length);
      return true;
    });
    await cli("type", "模型与执行");
    const destinationResults = await evaluate(async () => {
      const deadline = Date.now() + 2000;
      while (!document.querySelector(".sss-item") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      return [...document.querySelectorAll(".sss-item")].map(item => item.querySelector(".sss-item-label")?.textContent.trim());
    });
    assert.ok(destinationResults.includes("模型与执行"), `Destination search results: ${destinationResults.join(", ")}`);
    await cli("press", "ArrowDown");
    await cli("press", "Enter");
    await settle();
    const destinationSearch = await panelState();
    assert.equal(destinationSearch.destination, "models");
    assert.equal(destinationSearch.activeId, "settings-tab-models");
    results.destinationSearch = { status: "passed", searchResults: destinationResults, destination: destinationSearch.destination, activeId: destinationSearch.activeId };
  } else {
    results.memorySearch = { status: "skipped", reason: "The pinned settings-search plugin did not expose its input within 2 seconds in this synthetic fixture." };
  }

  await cli("press", "Escape");
  await settle();
  await cli("resize", "400", "800");
  await click('button[aria-haspopup="dialog"]');
  const mobileCategories = await evaluate(() => {
    const panel = document.querySelector('[data-testid="opl-settings-panel"]');
    return {
      view: panel.dataset.mobileNav,
      labels: [...panel.querySelectorAll(".settings-mobile-categories > button")].map(button => button.textContent.trim()),
      detailVisible: Boolean(panel.querySelector(".settings-content").getClientRects().length),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.equal(mobileCategories.view, "categories");
  assert.equal(mobileCategories.labels.length, 8);
  assert.equal(mobileCategories.labels.at(-1), "关于");
  assert.equal(mobileCategories.detailVisible, false);
  assert.equal(mobileCategories.overflow, false);
  results.mobileCategories = mobileCategories;
  await screenshot("settings-mobile-categories-400x800.png", "400x800");

  await click(".settings-mobile-categories > button", "账户与模型");
  await click(".settings-mobile-destinations > button", "模型与执行");
  const mobileDetails = await panelState();
  assert.equal(mobileDetails.view, "destinations");
  assert.equal(mobileDetails.destination, "models");
  assert.equal(mobileDetails.heading, "模型与执行");
  assert.equal(mobileDetails.contentVisible, true);
  assert.equal(mobileDetails.horizontalOverflow, false);
  results.mobileDetails = mobileDetails;
  await screenshot("settings-mobile-detail-400x800.png", "400x800");
  await click(".settings-mobile-back");
  const returned = await panelState();
  assert.equal(returned.view, "categories");
  assert.equal(returned.contentVisible, false);
  results.mobileReturn = returned;

  await click(".settings-mobile-categories > button", "偏好");
  const preferences = await panelState();
  assert.equal(preferences.destination, "preferences");
  assert.equal(preferences.contentVisible, true);
  assert.equal(preferences.heading, "偏好");
  assert.equal(await evaluate(() => Boolean(document.querySelector('.settings-mobile-back')?.getClientRects().length)), true);
  await click(".settings-mobile-back");
  assert.equal((await panelState()).view, "categories");
  results.mobilePreferences = preferences;

  await click(".settings-mobile-categories > button", "关于");
  const about = await panelState();
  assert.equal(about.view, "about");
  assert.equal(about.destination, "about");
  assert.equal(about.contentVisible, true);
  await click(".settings-mobile-back");
  assert.equal((await panelState()).view, "categories");
  results.mobileAbout = about;

  await click(".settings-mobile-categories > button", "运行与维护");
  const serviceState = await panelState();
  assert.equal(serviceState.destination, "services");
  await click('.settings-content button', "打开计划任务");
  const scheduled = await evaluate(() => ({
    settingsClosed: !document.querySelector('[data-shortcut-modal="settings"][role="dialog"]'),
    workbenchTasks: Boolean(document.querySelector(".opl-schedules-page")),
    heading: document.querySelector(".opl-schedules-page h1")?.textContent.trim(),
  }));
  assert.deepEqual(scheduled, { settingsClosed: true, workbenchTasks: true, heading: "计划任务" });
  results.scheduledTaskContext = scheduled;
} catch (error) {
  failure = error;
} finally {
  await cli("close").catch(() => undefined);
  if (host) await host.close().catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true });
}

const report = {
  schema: "opl_settings_rendered_acceptance.v1",
  status: failure ? "failed" : "passed",
  evidenceLayer: "local_synthetic_fixture",
  fixture: "fake-app-server with isolated temporary dshHome and synthetic OPL state/services",
  carrier: "shared_webui",
  rendererSha256: await digestFile(path.join(repositoryRoot, "dist", "webui", "renderer.js")),
  results,
  screenshots,
  cleanup: { browserSessionClosed: true, hostClosed: true, tempDirectoryRemoved: true },
  installedEvidence: false,
  releaseReady: false,
  ...(failure ? { error: failure instanceof Error ? failure.message : String(failure) } : {}),
};
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "settings-ui-acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failure) throw failure;

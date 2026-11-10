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

// Isolated UI acceptance for the DSH PluginManager page owner adapter. This
// script owns no package lifecycle; the synthetic projection and action log
// below only prove that the renderer keeps OPL actions behind the owner bridge.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fakeAppServer = path.join(repositoryRoot, "src", "host", "fixtures", "fake-app-server.mjs");
const fixturePath = path.join(repositoryRoot, "tests", "fixtures", "studio-vm-fixture", "state.json");
const outputRoot = path.join(repositoryRoot, "out", "acceptance", "plugin-manager-ui");
const session = `opl-plugin-manager-${process.pid}`;

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
      : reject(new Error(`${executable} ${args.join(" ")} failed (${code})\n${stderr || stdout}`)));
  });
}

async function cli(args, cwd) {
  const result = await run("npx", ["--yes", "--package", "@playwright/cli", "playwright-cli", "--json", `-s=${session}`, ...args], { cwd });
  let envelope;
  try { envelope = JSON.parse(result.stdout.trim()); } catch { return result; }
  if (envelope.isError || envelope.error) throw new Error(`Playwright CLI ${args[0]} failed: ${JSON.stringify(envelope.error ?? envelope.result ?? envelope)}\n${result.stderr}`);
  return result;
}

async function evaluate(expression, cwd) {
  const result = await cli(["eval", expression], cwd);
  const envelope = JSON.parse(result.stdout.trim());
  if (envelope.isError) throw new Error(envelope.error || "Playwright evaluation failed");
  return typeof envelope.result === "string" ? JSON.parse(envelope.result) : envelope.result;
}

async function latestScreenshot(cliRoot) {
  const files = (await readdir(path.join(cliRoot, ".playwright-cli")))
    .filter(name => name.endsWith(".png"))
    .sort();
  assert.ok(files.length, "Playwright CLI emitted no screenshot");
  return path.join(cliRoot, ".playwright-cli", files.at(-1));
}

async function digestFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function openApplicationManagement(cliRoot) {
  const state = await evaluate(`async () => {
    const deadline = Date.now() + 10000;
    const find = () => document.querySelector('nav[aria-label="主页面"] button[aria-label="应用管理"], nav[aria-label="Primary pages"] button[aria-label="Application management"]');
    let button = find();
    while (!button && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
      button = find();
    }
    if (!button) return { button: false, app: false };
    button.click();
    while (!document.querySelector('[data-testid="opl-app-management"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return { button: true, app: Boolean(document.querySelector('[data-testid="opl-app-management"]')) };
  }`, cliRoot);
  assert.deepEqual(state, { button: true, app: true }, "primary navigation should open application management");
}

function packageEntry({ id, label, installed, access = "public", actions = [] }) {
  return {
    package_id: id,
    display_name: label,
    display_name_i18n: { "zh-CN": label, "en-US": label },
    description: `${label} synthetic PluginManager acceptance entry`,
    description_i18n: { "zh-CN": `${label} 验收条目`, "en-US": `${label} acceptance entry` },
    publisher: installed ? "One Person Lab" : "Synthetic publisher",
    package_role: "standard_agent",
    official: installed,
    presence: { registered: installed, installed, present: installed, callable: installed, status: installed ? "present" : "not_installed" },
    installed,
    activated: installed,
    app_enabled: installed,
    capability_metadata: { source: "plugin_manager_acceptance", required_skill_ids: [] },
    readiness: { status: installed ? "ready" : "not_installed", operational_ready: installed, launch_allowed: installed },
    installed_readiness: { installed, physical_status: installed ? "available" : "missing", callability: installed ? "callable" : "unavailable" },
    package_access: {
      visibility: access === "public" ? "public" : "authorized_only",
      status: access,
      discover_allowed: true,
      download_allowed: access === "authorized"
    },
    version: installed ? "1.0.0-fixture" : undefined,
    package_currentness: installed ? { status: "update_available", available_version: "2.0.0-fixture" } : undefined,
    recommended_action: installed ? "agent_package_update" : undefined,
    home_shortcuts: [],
    available_actions: actions
  };
}

async function syntheticState() {
  const source = JSON.parse(await readFile(fixturePath, "utf8"));
  const action = (actionId, semantic, packageId, confirmationRequired = true) => ({
    action_id: actionId,
    action_ref: `acceptance:${actionId}:${packageId}`,
    semantic,
    payload: { package_id: packageId },
    required_payload_fields: ["package_id"],
    confirmation_required: confirmationRequired,
    status: "available"
  });
  const entries = [
    packageEntry({
      id: "acceptance-installed",
      label: "已安装应用",
      installed: true,
      access: "public",
      actions: [action("agent_package_update", "update", "acceptance-installed")]
    }),
    packageEntry({
      id: "acceptance-private",
      label: "授权应用",
      installed: false,
      access: "signed_out",
      actions: [action("agent_package_install", "install", "acceptance-private")]
    })
  ];
  source.meta = { ...(source.meta ?? {}), profile: "fast", generated_at: new Date().toISOString() };
  source.actions = [
    ...(source.actions ?? []),
    { action_id: "agent_package_update", label: "Update package", route: "opl app action execute", payload_fields: ["package_id"], owner: "OPL Framework", dry_run_supported: true, confirmation_required: true },
    { action_id: "agent_package_install", label: "Install package", route: "opl app action execute", payload_fields: ["package_id"], owner: "OPL Framework", dry_run_supported: true, confirmation_required: true },
    { action_id: "official_profile_restore", label: "Restore official combination", route: "opl-studio:official-profile-restore", payload_fields: ["intent"], owner: "one-person-lab-app", dry_run_supported: true, confirmation_required: true }
  ];
  source.agent_packages = {
    directory: { status: "current", entries },
    status_index: { packages: Object.fromEntries(entries.map(entry => [entry.package_id, {
      package_id: entry.package_id,
      status: entry.installed ? "available" : "not_installed",
      presence: entry.presence,
      dependency_readiness: { status: entry.installed ? "ready" : "unknown", checks: [] }
    }])) },
    sources: {
      surface_kind: "opl_software_sources_projection.v1", status: "available",
      entries: [{
        source_id: "acceptance-homebrew", display_name: "Homebrew 验收源", source_kind: "tap",
        source_ref: "https://example.com/acceptance-homebrew", visibility: "public", status: "public", enabled: true,
        inventory_status: "available", entry_count: 2, version_authority: "homebrew", installation_owner: "homebrew",
        native_items: [
          {
            item_id: "fixture-tool", name: "fixture-tool", display_name: "原生更新工具", kind: "formula",
            installed: true, installed_version: "1.0.0", available_version: "2.0.0", update_status: "available", revision: "fixture-tool-r1",
            available_actions: [{ action_id: "source_update", label: "Update", payload_fields: ["source_id", "item_id", "expected_revision"],
              payload: { source_id: "acceptance-homebrew", item_id: "fixture-tool", expected_revision: "fixture-tool-r1" }, status: "available", dry_run_supported: true, confirmation_required: true }]
          },
          {
            item_id: "fixture-unknown", name: "fixture-unknown", display_name: "未知安装工具", kind: "formula",
            installed: null, update_status: "unknown", revision: "fixture-unknown-r1", available_actions: []
          }
        ], available_actions: []
      }], authority_boundary: { owner: "one-person-lab", credential_values_exposed: false }
    }
  };
  source.application_management = { surface_kind: "opl_application_management_projection.v1", shared_resources: [] };
  return source;
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-plugin-manager-acceptance-"));
const cliRoot = path.join(tempRoot, "playwright");
const appServerLog = path.join(tempRoot, "app-server.jsonl");
const actionLog = [];
let stateReads = 0;
await mkdir(cliRoot, { recursive: true });
await mkdir(outputRoot, { recursive: true });
let host;

try {
  const state = await syntheticState();
  buildRenderer({ outDir: path.join(repositoryRoot, "dist", "webui"), htmlName: "index.html", jsName: "renderer.js" });
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fakeAppServer],
    cwd: tempRoot,
    env: { ...process.env, FAKE_APP_SERVER_INCLUDE_PROJECTLESS: "1", FAKE_APP_SERVER_LOG: appServerLog },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  host = await createWebUiHost({
    transport,
    opl: {
      readInitialize: async () => ({ system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } }, readback: { exitCode: 0 } }),
      readState: async profile => { stateReads++; return { profile, app_state: state, readback: { exitCode: 0 } }; },
      readFullDrilldown: async () => ({ detail: "full", drilldown: {}, readback: { exitCode: 0 } }),
      readContribution: async request => ({ packageId: request.packageId, ref: request.ref, result: {} }),
      executeAction: async request => {
        actionLog.push(request);
        if (!request.dryRun && request.payload?.confirmed === true) {
          const entry = state.agent_packages.directory.entries.find(item => item.package_id === request.payload.package_id);
          if (entry) entry.package_currentness = { status: "current" };
          return { actionId: request.actionId, status: "executed" };
        }
        return { actionId: request.actionId, status: "preview_ready" };
      }
    },
    dshHome: path.join(tempRoot, "dsh-home"),
    webRoot: path.join(repositoryRoot, "dist", "webui")
  });

  await cli(["open", "about:blank"], cliRoot);
  await cli(["goto", host.url], cliRoot);
  await cli(["resize", "1440", "900"], cliRoot);
  const ready = await evaluate(`async () => {
    const deadline = Date.now() + 10000;
    while (!document.querySelector('[data-testid="opl-studio-root"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 40));
    return Boolean(document.querySelector('[data-testid="opl-studio-root"]'));
  }`, cliRoot);
  assert.equal(ready, true, "renderer should mount within the bounded wait");

  await openApplicationManagement(cliRoot);
  const page = await evaluate(`() => {
    const app = document.querySelector('[data-testid="opl-app-management"]');
    const official = app?.querySelector('[data-plugin-panel]');
    const tablist = official?.querySelector('[data-plugin-header-part="tabs"]') ?? app?.querySelector('[data-testid="opl-app-management-tabs"]');
    const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')).map(item => item.textContent.trim()) : [];
    const groups = official ? Array.from(official.querySelectorAll('[data-plugin-owner-group]')).map(group => group.getAttribute('data-plugin-owner-group')) : [];
    const cards = official ? Array.from(official.querySelectorAll('[data-plugin-owner-package]')).map(card => card.getAttribute('data-plugin-owner-package')) : [];
    return { mounted: Boolean(app), officialPage: Boolean(official), tabs, groups, cards, overflow: document.documentElement.scrollWidth > innerWidth };
  }`, cliRoot);
  assert.equal(page.mounted, true);
  assert.equal(page.officialPage, true);
  assert.deepEqual(page.tabs, ["我的应用", "更新", "共享资源", "软件源"]);
  assert.ok(page.groups.length > 0, "official grouped card sections should render");
  assert.ok(page.cards.includes("acceptance-installed"), "installed Framework package should render in official card shell");
  assert.equal(page.overflow, false);

  const restore = await evaluate(`async () => {
    const button = document.querySelector('[data-testid="settings-agents-restore-official-profile"]');
    button?.click();
    const deadline = Date.now() + 5000;
    let dialog;
    while (!dialog && Date.now() < deadline) {
      dialog = document.querySelector('[data-testid="opl-settings-action-confirmation"]');
      if (!dialog) await new Promise(resolve => setTimeout(resolve, 25));
    }
    const result = { present: Boolean(button), confirmation: Boolean(dialog), title: dialog?.querySelector('h2')?.textContent?.trim() };
    Array.from(dialog?.querySelectorAll('button') ?? []).find(item => item.textContent.trim() === '取消')?.click();
    await new Promise(requestAnimationFrame);
    return result;
  }`, cliRoot);
  assert.deepEqual(restore, { present: true, confirmation: true, title: "恢复官方组合" });
  assert.ok(actionLog.some(request => request.actionId === "official_profile_restore" && request.dryRun === true && request.payload?.intent === "explicit_restore"), "restore entry must preview the App-owned restore action");
  assert.equal(actionLog.some(request => request.actionId === "official_profile_restore" && request.dryRun === false), false, "canceling restore must not execute it");

  const unknownState = await evaluate(`async () => {
    const card = document.querySelector('[data-plugin-owner-package="acceptance-homebrew:fixture-unknown"]');
    const summary = card?.textContent ?? '';
    card?.querySelector('button[aria-label], button')?.click();
    await new Promise(requestAnimationFrame);
    const detail = document.querySelector('[data-plugin-owner-detail="acceptance-homebrew:fixture-unknown"]');
    const facts = Array.from(detail?.querySelectorAll('dl > div') ?? []).map(row => ({ name: row.querySelector('dt')?.textContent?.trim(), value: row.querySelector('dd')?.textContent?.trim() }));
    const result = { present: Boolean(card), summary, localVersion: facts.find(row => row.name === '本机版本')?.value };
    detail?.querySelector('button[aria-label*="返回"]')?.click();
    await new Promise(requestAnimationFrame);
    return result;
  }`, cliRoot);
  assert.equal(unknownState.present, true);
  assert.ok(unknownState.summary.includes("待确认"));
  assert.equal(/已安装|未安装/.test(unknownState.summary), false, "unknown native installation must stay unknown");
  assert.equal(unknownState.localVersion, "待确认");

  const detail = await evaluate(`async () => {
    const card = document.querySelector('[data-plugin-owner-package="acceptance-installed"]');
    const open = card?.querySelector('button[aria-label], button');
    open?.click();
    await new Promise(requestAnimationFrame);
    const panel = document.querySelector('[data-plugin-panel]');
    const detail = panel?.querySelector('[data-plugin-owner-detail="acceptance-installed"]');
    return { open: Boolean(detail), back: Boolean(detail?.querySelector('button[aria-label*="返回"]')), name: detail?.querySelector('code')?.textContent?.trim() };
  }`, cliRoot);
  assert.equal(detail.open, true);
  assert.equal(detail.back, true);
  assert.equal(detail.name, "acceptance-installed");
  await evaluate(`() => { document.querySelector('[data-plugin-owner-detail="acceptance-installed"] button[aria-label*="返回"]')?.click(); return true; }`, cliRoot);
  await evaluate(`() => new Promise(resolve => requestAnimationFrame(() => resolve(!document.querySelector('[data-plugin-owner-detail="acceptance-installed"]'))))`, cliRoot);

  const stateReadsBeforeAction = stateReads;
  const ownerAction = await evaluate(`async () => {
    const card = document.querySelector('[data-plugin-owner-package="acceptance-installed"]');
    const action = Array.from(card?.querySelectorAll('button') ?? []).find(item => item.textContent.trim() === '更新' || item.textContent.trim() === 'Update');
    action?.click();
    const deadline = Date.now() + 5000;
    let confirm;
    while (!confirm && Date.now() < deadline) {
      confirm = document.querySelector('[data-testid="opl-settings-action-confirmation"] button.primary');
      if (!confirm) await new Promise(resolve => setTimeout(resolve, 25));
    }
    confirm?.click();
    while (document.querySelector('[data-testid="opl-settings-action-confirmation"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return { offered: Boolean(action), confirmation: Boolean(confirm) };
  }`, cliRoot);
  assert.equal(ownerAction.offered, true);
  assert.equal(ownerAction.confirmation, true);
  assert.ok(actionLog.some(request => request.dryRun === false && request.payload?.confirmed === true), "confirmed owner action must cross the App action bridge");
  assert.ok(stateReads > stateReadsBeforeAction, "an executed owner action must read owner state again");

  const accessGate = await evaluate(`async () => {
    const card = document.querySelector('[data-plugin-owner-package="acceptance-private"]');
    if (!card) return { present: false, gate: false };
    card.querySelector('button[aria-label], button')?.click();
    await new Promise(requestAnimationFrame);
    const detail = document.querySelector('[data-plugin-owner-detail="acceptance-private"]');
    return { present: true, gate: Boolean(detail?.querySelector('[data-testid="opl-package-access-gate"]')) };
  }`, cliRoot);
  assert.equal(accessGate.present, true);
  assert.equal(accessGate.gate, true, "signed-out authorized package must expose an owner access gate");
  await evaluate(`() => { document.querySelector('[data-plugin-owner-detail="acceptance-private"] button[aria-label*="返回"]')?.click(); return true; }`, cliRoot);

  const tabsInteraction = await evaluate(`async () => {
    const app = document.querySelector('[data-testid="opl-app-management"]');
    const list = () => app?.querySelector('[data-plugin-header-part="tabs"]') ?? app?.querySelector('[data-testid="opl-app-management-tabs"]');
    const labels = ['我的应用', '更新', '共享资源', '软件源'];
    const states = [];
    for (const label of labels) {
      const button = Array.from(list()?.querySelectorAll('[role="tab"]') ?? []).find(item => item.textContent.trim() === label);
      button?.click();
      await new Promise(requestAnimationFrame);
      states.push({ label, present: Boolean(button), selected: button?.getAttribute('aria-selected') === 'true' });
    }
    Array.from(list()?.querySelectorAll('[role="tab"]') ?? []).find(item => item.textContent.trim() === labels[0])?.click();
    return states;
  }`, cliRoot);
  assert.deepEqual(tabsInteraction, ["我的应用", "更新", "共享资源", "软件源"].map(label => ({ label, present: true, selected: true })));

  const updates = await evaluate(`async () => {
    const app = document.querySelector('[data-testid="opl-app-management"]');
    const tabs = () => Array.from(app?.querySelectorAll('[data-plugin-header-part="tabs"] [role="tab"]') ?? []);
    tabs().find(tab => tab.textContent.trim() === '更新')?.click();
    await new Promise(requestAnimationFrame);
    const row = app?.querySelector('[data-testid="opl-native-software-row"][data-item-id="fixture-tool"]');
    const unknown = app?.querySelector('[data-testid="opl-native-software-row"][data-item-id="fixture-unknown"]');
    const result = { nativeUpdate: Boolean(row), updateAction: Boolean(Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent.trim() === '更新')), text: row?.textContent, unknownListedAsUpdate: Boolean(unknown) };
    tabs().find(tab => tab.textContent.trim() === '我的应用')?.click();
    await new Promise(requestAnimationFrame);
    return result;
  }`, cliRoot);
  assert.equal(updates.nativeUpdate, true, "Homebrew updates must remain in the shared Updates tab");
  assert.equal(updates.updateAction, true);
  assert.ok(updates.text.includes("1.0.0") && updates.text.includes("2.0.0"));
  assert.equal(updates.unknownListedAsUpdate, false);

  const moreMenu = await evaluate(`async () => {
    const nav = document.querySelector('nav[aria-label="主页面"], nav[aria-label="Primary pages"]');
    const more = nav?.querySelector('button[aria-label="更多"], button[aria-label="More"]');
    more?.click();
    const deadline = Date.now() + 3000;
    while (more?.getAttribute('aria-expanded') !== 'true' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    await new Promise(requestAnimationFrame);
    return { present: Boolean(more), open: more?.getAttribute('aria-expanded') === 'true', items: Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent.trim()) };
  }`, cliRoot);
  assert.equal(moreMenu.present, true);
  assert.equal(moreMenu.open, true);
  assert.equal(moreMenu.items.some(label => /应用管理|管理应用与扩展|Application management|Manage apps and extensions/.test(label)), false, "pinned app management must not be duplicated in More");

  await cli(["press", "Escape"], cliRoot);
  const themeScreenshots = [];
  const themes = [];
  for (const theme of ["light", "dark"]) {
    await evaluate(`() => {
      const key = 'opl.studio.settings.v1';
      const current = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...current, locale: 'zh', theme: ${JSON.stringify(theme)} }));
      return true;
    }`, cliRoot);
    await cli(["goto", host.url], cliRoot);
    await openApplicationManagement(cliRoot);
    const themed = await evaluate(`async () => {
      const deadline = Date.now() + 10000;
      while (!document.querySelector('[data-testid="opl-app-management"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      return { app: Boolean(document.querySelector('[data-testid="opl-app-management"]')), theme: document.documentElement.dataset.dsThemeSource, locale: JSON.parse(localStorage.getItem('opl.studio.settings.v1') || '{}').locale };
    }`, cliRoot);
    assert.equal(themed.app, true);
    assert.equal(themed.theme, theme);
    assert.equal(themed.locale, "zh");
    assert.deepEqual(await evaluate(`() => ({
      tabs: Array.from(document.querySelectorAll('[data-plugin-owner-panel] [data-plugin-header-part="tabs"] [role="tab"]')).map(item => item.textContent.trim()),
      cards: Array.from(document.querySelectorAll('[data-plugin-owner-package]')).map(item => item.getAttribute('data-plugin-owner-package')),
      overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth
    })`, cliRoot), {
      tabs: ["我的应用", "更新", "共享资源", "软件源"],
      cards: ["acceptance-installed", "acceptance-private", "acceptance-homebrew:fixture-tool", "acceptance-homebrew:fixture-unknown"],
      overflow: false
    });
    await cli(["resize", "1440", "900"], cliRoot);
    const themeState = await evaluate(`() => ({ theme: document.documentElement.dataset.dsThemeSource, dark: document.body.hasAttribute('data-ds-dark-theme') })`, cliRoot);
    themes.push(themeState);
    assert.equal(themeState.theme, theme);
    assert.equal(themeState.dark, theme === "dark");
    await cli(["screenshot"], cliRoot);
    const target = path.join(outputRoot, `${theme}-1440x900.png`);
    await copyFile(await latestScreenshot(cliRoot), target);
    themeScreenshots.push(target);
  }

  await evaluate(`() => {
    const key = 'opl.studio.settings.v1';
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...current, locale: 'zh', theme: 'light' }));
    return true;
  }`, cliRoot);
  await cli(["goto", host.url], cliRoot);
  await openApplicationManagement(cliRoot);
  await cli(["resize", "400", "800"], cliRoot);
  const narrow = await evaluate(`() => ({ viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth, app: Boolean(document.querySelector('[data-testid="opl-app-management"]')) })`, cliRoot);
  assert.deepEqual(narrow.viewport, [400, 800]);
  assert.equal(narrow.overflow, false);
  assert.equal(narrow.app, true);

  await cli(["screenshot"], cliRoot);
  const narrowScreenshot = path.join(outputRoot, "light-400x800.png");
  await copyFile(await latestScreenshot(cliRoot), narrowScreenshot);

  const manifestPath = path.join(repositoryRoot, "src", "composition", "deepseekHarnessSourceManifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const receipt = {
    schema: "opl_studio_plugin_manager_ui_acceptance.v1", status: "passed", evidenceLayer: "local_rendered_candidate", installed: false,
    cohort: { rendererSha256: await digestFile(path.join(repositoryRoot, "dist", "webui", "renderer.js")), dshManifestSha256: await digestFile(manifestPath), dshUpstreamRef: manifest.upstream.ref },
    page, restore, unknownState, detail, ownerAction, accessGate, tabsInteraction, updates, moreMenu, themes, narrow, actionCount: actionLog.length, stateReads,
    screenshots: await Promise.all([...themeScreenshots, narrowScreenshot].map(async file => ({ path: path.relative(repositoryRoot, file), sha256: await digestFile(file) })))
  };
  await writeFile(path.join(outputRoot, "acceptance.json"), JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} finally {
  await host?.close?.();
  await rm(tempRoot, { recursive: true, force: true });
}

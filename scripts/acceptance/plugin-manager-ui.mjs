import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRenderer } from "../build-renderer.mjs";
import { CodexAppServerTransport } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";
import { createWebUiHost } from "../../src/host/http-host.mjs";

// Isolated UI acceptance for the DSH PluginManager page owner adapter. This
// script owns no package lifecycle; the synthetic projection and action log
// below only prove that the renderer keeps OPL actions behind the owner bridge.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fakeAppServer = path.join(repositoryRoot, "src", "host", "fixtures", "fake-app-server.mjs");
const fixturePath = path.join(repositoryRoot, "tests", "fixtures", "studio-vm-fixture", "state.json");
const outputRoot = path.join(repositoryRoot, "out", "acceptance", "plugin-manager-ui");
const session = `opl-plugin-manager-${process.pid}`;
const panelNavigation = 'nav[aria-label="主页面"], nav[aria-label="App pages"]';
const moreNavigation = 'button[aria-label="更多"], button[aria-label="More"]';
const softwareNavigation = 'button[aria-label="软件中心"], button[aria-label="Software Center"]';
const packageCards = ["acceptance-installed", "acceptance-private"];
const softwareTabs = ["installed", "updates", "activity"];

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
    const nav = () => document.querySelector(${JSON.stringify(panelNavigation)});
    const find = () => nav()?.querySelector(${JSON.stringify(softwareNavigation)});
    const more = () => nav()?.querySelector(${JSON.stringify(moreNavigation)});
    const waitFor = async (findElement) => {
      let value = findElement();
      while (!value && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
        value = findElement();
      }
      return value;
    };
    if (!await waitFor(() => find() ?? more())) return { button: false, app: false };
    if (!find()) {
      more()?.click();
      const pin = await waitFor(() => document.querySelector('[role="menuitem"][aria-label="固定软件中心"], [role="menuitem"][aria-label="Pin Software Center"]'));
      pin?.click();
    }
    const button = await waitFor(find);
    if (!button) return { button: false, app: false, sidebar: nav()?.textContent.trim() };
    button.click();
    const findApp = () => document.querySelector('[data-testid="opl-app-management"] [data-plugin-owner-package="acceptance-installed"]');
    while (!findApp() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return { button: true, app: Boolean(findApp()) };
  }`, cliRoot);
  assert.deepEqual(state, { button: true, app: true }, "global navigation should open Software Center and load its package cards");
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
    catalog_scope: "software", software_type: "agent", management_scope: "opl_packages", catalog_origin: "opl",
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
    installed_version: installed ? "1.0.0-fixture" : undefined,
    selected_version: installed ? "2.0.0-fixture" : undefined,
    package_currentness: installed ? "update_available" : "unknown",
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
    { action_id: "agent_package_update", label: "Update package", route: "opld app.action.execute", payload_fields: ["package_id"], owner: "OPL Framework", dry_run_supported: true, confirmation_required: true },
    { action_id: "agent_package_install", label: "Install package", route: "opld app.action.execute", payload_fields: ["package_id"], owner: "OPL Framework", dry_run_supported: true, confirmation_required: true },
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
        source_id: "public-registry:opl", provider_id: "opl_catalog", display_name: "OPL 软件目录",
        catalog_origin: "opl", status: "ready", enabled: true,
        available_actions: [{ action_id: "source_refresh", payload_fields: ["source_id"], dry_run_supported: false }]
      }, {
        source_id: "github-packages:acceptance", provider_id: "github_packages", display_name: "Acceptance GitHub",
        visibility: "authorized_only", status: "signed_out", enabled: true,
        available_actions: [{ action_id: "source_check", payload_fields: ["source_id"], dry_run_supported: false }]
      }], authority_boundary: { owner: "opl_framework", credential_values_exposed: false }
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
let browserOpened = false;

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
          if (entry) entry.package_currentness = "current";
          return { actionId: request.actionId, status: "executed" };
        }
        return { actionId: request.actionId, status: "preview_ready" };
      }
    },
    dshHome: path.join(tempRoot, "dsh-home"),
    webRoot: path.join(repositoryRoot, "dist", "webui")
  });

  await cli(["open", "about:blank"], cliRoot);
  browserOpened = true;
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
    const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')).map(item => item.id.replace('opl-plugin-owner-', '')) : [];
    const groups = official ? Array.from(official.querySelectorAll('[data-plugin-owner-group]')).map(group => group.getAttribute('data-plugin-owner-group')) : [];
    const cards = official ? Array.from(official.querySelectorAll('[data-plugin-owner-package]')).map(card => card.getAttribute('data-plugin-owner-package')) : [];
    return { mounted: Boolean(app), officialPage: Boolean(official), tabs, groups, cards, overflow: document.documentElement.scrollWidth > innerWidth };
  }`, cliRoot);
  assert.equal(page.mounted, true);
  assert.equal(page.officialPage, true);
  assert.deepEqual(page.tabs, softwareTabs);
  assert.ok(page.groups.length > 0, "official grouped card sections should render");
  assert.ok(page.cards.includes("acceptance-installed"), "installed Framework package should render in official card shell");
  assert.equal(page.overflow, false);

  const restore = await evaluate(`async () => {
    document.querySelector('details.opl-catalog-more > summary')?.click();
    const button = document.querySelector('details.opl-catalog-more[open] [data-testid="settings-agents-restore-official-profile"]');
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

  const detail = await evaluate(`async () => {
    const card = document.querySelector('[data-plugin-owner-package="acceptance-installed"]');
    const open = card?.querySelector('button[aria-describedby]');
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
    card.querySelector('button[aria-describedby]')?.click();
    await new Promise(requestAnimationFrame);
    const detail = document.querySelector('[data-plugin-owner-detail="acceptance-private"]');
    return { present: true, gate: Boolean(detail?.querySelector('[data-testid="opl-package-access-gate"]')) };
  }`, cliRoot);
  assert.equal(accessGate.present, true);
  assert.equal(accessGate.gate, true, "signed-out authorized package must expose an owner access gate");
  await evaluate(`() => { document.querySelector('[data-plugin-owner-detail="acceptance-private"] button[aria-label*="返回"]')?.click(); return true; }`, cliRoot);

  const tabsInteraction = await evaluate(`async () => {
    const states = [];
    for (const id of ['updates', 'activity', 'installed']) {
      const button = document.getElementById('opl-plugin-owner-' + id);
      button?.click();
      await new Promise(requestAnimationFrame);
      states.push({ id, selected: button?.getAttribute('aria-selected') === 'true' });
    }
    return states;
  }`, cliRoot);
  assert.deepEqual(tabsInteraction, ["updates", "activity", "installed"].map(id => ({ id, selected: true })));

  const sources = await evaluate(`async () => {
    const app = document.querySelector('[data-testid="opl-app-management"]');
    Array.from(app?.querySelectorAll('[data-plugin-toolbar] button') ?? []).find(button => button.textContent.trim() === '管理软件源')?.click();
    await new Promise(requestAnimationFrame);
    const catalog = app?.querySelector('[data-source-id="public-registry:opl"]');
    const github = app?.querySelector('[data-source-id="github-packages:acceptance"]');
    const refresh = Array.from(catalog?.querySelectorAll('button') ?? []).find(button => button.textContent.trim() === '更新目录');
    const check = Array.from(github?.querySelectorAll('button') ?? []).find(button => button.textContent.trim() === '检查访问');
    const selected = document.getElementById('opl-plugin-owner-sources')?.getAttribute('aria-selected') === 'true';
    const clickAndWait = async (button, row) => {
      button?.click();
      await new Promise(requestAnimationFrame);
      const deadline = Date.now() + 5000;
      while (row?.getAttribute('aria-busy') === 'true' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    await clickAndWait(refresh, catalog);
    await clickAndWait(check, github);
    document.getElementById('opl-plugin-owner-installed')?.click();
    await new Promise(requestAnimationFrame);
    return { selected, catalog: Boolean(catalog), refresh: Boolean(refresh), github: Boolean(github), check: Boolean(check) };
  }`, cliRoot);
  assert.deepEqual(sources, { selected: true, catalog: true, refresh: true, github: true, check: true });
  for (const [actionId, sourceId] of [["source_refresh", "public-registry:opl"], ["source_check", "github-packages:acceptance"]]) {
    assert.ok(actionLog.some(request => request.actionId === actionId && request.dryRun === false && request.payload?.source_id === sourceId), `${actionId} must reach the App action bridge for ${sourceId}`);
  }

  const moreMenu = await evaluate(`async () => {
    const nav = document.querySelector(${JSON.stringify(panelNavigation)});
    const more = nav?.querySelector(${JSON.stringify(moreNavigation)});
    more?.click();
    const deadline = Date.now() + 3000;
    while (more?.getAttribute('aria-expanded') !== 'true' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    await new Promise(requestAnimationFrame);
    return { present: Boolean(more), open: more?.getAttribute('aria-expanded') === 'true', items: Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent.trim()) };
  }`, cliRoot);
  assert.equal(moreMenu.present, true);
  assert.equal(moreMenu.open, true);
  assert.equal(moreMenu.items.some(label => /软件中心|Software Center/.test(label)), false, "pinned Software Center must not be duplicated in More");

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
      tabs: Array.from(document.querySelectorAll('[data-plugin-owner-panel] [data-plugin-header-part="tabs"] [role="tab"]')).map(item => item.id.replace('opl-plugin-owner-', '')),
      cards: Array.from(document.querySelectorAll('[data-plugin-owner-package]')).map(item => item.getAttribute('data-plugin-owner-package')).filter(id => id.startsWith('acceptance-')).sort(),
      overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth
    })`, cliRoot), {
      tabs: softwareTabs,
      cards: packageCards,
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

  const manifestPath = path.join(repositoryRoot, "packages", "dsh-adapters", "deepseekHarnessSourceManifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const receipt = {
    schema: "opl_studio_plugin_manager_ui_acceptance.v1", status: "passed", evidenceLayer: "local_rendered_candidate", installed: false,
    cohort: { rendererSha256: await digestFile(path.join(repositoryRoot, "dist", "webui", "renderer.js")), dshManifestSha256: await digestFile(manifestPath), dshUpstreamRef: manifest.upstream.ref },
    page, restore, detail, ownerAction, accessGate, tabsInteraction, sources, moreMenu, themes, narrow, actionCount: actionLog.length, stateReads,
    screenshots: await Promise.all([...themeScreenshots, narrowScreenshot].map(async file => ({ path: path.relative(repositoryRoot, file), sha256: await digestFile(file) })))
  };
  await writeFile(path.join(outputRoot, "acceptance.json"), JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} finally {
  if (browserOpened) await cli(["close"], cliRoot).catch(() => {});
  await host?.close?.();
  await rm(tempRoot, { recursive: true, force: true });
}

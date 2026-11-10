import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capturePageScreenshot, evaluatePage, evaluatePageStable, waitForPageReady } from "../desktop/cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(path.join(root, "src/composition/deepseekHarnessSourceManifest.json"), "utf8"));
const rendererBytes = await readFile(path.join(root, "dist/desktop/renderer.js"));
const rendererSha256 = createHash("sha256").update(rendererBytes).digest("hex");
if (process.env.OPL_NATIVE_UI_EXPECTED_RENDERER_SHA256) {
  assert.equal(rendererSha256, process.env.OPL_NATIVE_UI_EXPECTED_RENDERER_SHA256, "Native smoke renderer differs from the requested build");
}
const fixtureRoot = path.join(root, "tests/fixtures/studio-vm-fixture");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-native-ui-"));
const stateRoot = path.join(tempRoot, "state");
const profileRoot = path.join(tempRoot, "profile");
const screenshotRoot = path.join(root, "out/acceptance/native-electron-ui");
const cdpPort = Number(process.env.OPL_NATIVE_UI_CDP_PORT || "9337");
const electronPath = createRequire(import.meta.url)("electron");
const execFileAsync = promisify(execFile);
const fakeOpl = path.join(tempRoot, "fake-opl.mjs");
const lifecyclePath = path.join(tempRoot, "app-server-lifecycle.jsonl");
await writeFile(fakeOpl, "#!" + process.execPath + "\nimport fs from 'node:fs';\nconst args=process.argv.slice(2).join(' ');\nif (args.includes('system initialize')) process.stdout.write(JSON.stringify({system_initialize:{setup_flow:{is_first_run:false,phase:'ready',ready_to_launch:true},readiness:{launch_ready:true}}}));\nelse process.stdout.write(args.includes('app state') ? fs.readFileSync(" + JSON.stringify(path.join(fixtureRoot, "state.json")) + ", 'utf8') : '{}');\n", { mode: 0o700 });
const child = spawn(electronPath, ["desktop/main.mjs", "--disable-gpu", "--remote-debugging-port=" + cdpPort, "--remote-debugging-address=127.0.0.1"], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    OPL_NATIVE_WORKBENCH_READ_ONLY: "1",
    OPL_DESKTOP_ACCESSIBILITY_QUALIFICATION: "1",
    OPL_DESKTOP_SKIP_PREVIEW_HANDOFF: "1",
    OPL_DESKTOP_UPDATE_QUALIFICATION_STATE_ROOT: stateRoot,
    OPL_APP_OPL_BIN: fakeOpl,
    OPL_CODEX_BIN: process.execPath,
    CODEX_APP_SERVER_ARGS: path.join(root, "src/host/fixtures/fake-app-server.mjs"),
    OPL_NATIVE_WORKBENCH_CODEX_CWD: root,
    OPL_STUDIO_CODEX_CWD: root,
    OPL_STUDIO_MANAGED_UPDATES: "0",
    DSH_HOME: path.join(profileRoot, "dsh"),
    OPL_PROFILE_WORKSPACE: root,
    OPL_INSTALL_ROOT: profileRoot,
    OPL_STATE_DIR: path.join(stateRoot, "opl"),
    OPL_DATA_DIR: path.join(stateRoot, "data"),
    OPL_APP_DATA_HOME: path.join(stateRoot, "app-data"),
    OPL_APP_CACHE_HOME: path.join(stateRoot, "app-cache"),
    OPL_CODEX_DATA_HOME: path.join(stateRoot, "codex"),
    FAKE_WORKSPACE: root,
    FAKE_APP_SERVER_INCLUDE_PROJECTLESS: "1",
    FAKE_APP_SERVER_LIFECYCLE_LOG: lifecyclePath
  },
  stdio: ["ignore", "ignore", "pipe", "ipc"]
});

let stderr = "";
let exitSignal;
child.stderr.setEncoding("utf8");
child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-12000); });
child.once("exit", (_code, signal) => { exitSignal = signal || "exit"; });

async function captureNativeWindow(name) {
  const file = path.join(screenshotRoot, name + "-window.png");
  const script = "import AppKit; import CoreGraphics; import Foundation; let pid = Int32(" + child.pid + "); let rows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []; for row in rows { if (row[kCGWindowOwnerPID as String] as? Int32) == pid, (row[kCGWindowLayer as String] as? Int) == 0, let number = row[kCGWindowNumber as String] { print(number) } }";
  const { stdout: windowIds } = await execFileAsync("/usr/bin/swift", ["-e", script], { timeout: 30000 });
  const candidates = windowIds.trim().split(/\s+/).filter(value => /^\d+$/.test(value));
  assert.ok(candidates.length > 0, "No visible Quartz window belongs to the task-owned Electron PID");
  const errors = [];
  for (const windowId of candidates) {
    try {
      await execFileAsync("/usr/sbin/screencapture", ["-x", "-l", windowId, file]);
      const stat = await readFile(file);
      assert.ok(stat.byteLength > 1000, "Native screenshot capture returned an empty image");
      return file;
    } catch (error) { errors.push(error.message); }
  }
  throw new Error("Could not capture task-owned Electron window: " + errors.join("; "));
}

async function waitTheme(theme, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = await evaluatePage({ port: cdpPort, expression: "({ theme: document.documentElement.dataset.dsThemeSource, dark: document.body.hasAttribute('data-ds-dark-theme'), nativeDark: matchMedia('(prefers-color-scheme: dark)').matches })", timeoutMs: 3000 });
      if (state?.theme === theme && state.nativeDark === (theme === "dark")) return state;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for native theme: " + theme);
}

try {
  await mkdir(screenshotRoot, { recursive: true });
  const ready = await waitForPageReady({ port: cdpPort, timeoutMs: 60000 });
  assert.deepEqual(ready, { readyState: "complete", root: true, bridge: true });
  await evaluatePageStable({ port: cdpPort, expression: `(async () => {
    const key = 'opl.studio.settings.v1';
    const settings = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...settings, theme: 'system' }));
    const initialize = await window.oplStudio.readInitialize();
    if (initialize?.system_initialize?.setup_flow?.is_first_run !== false) throw new Error('isolated native smoke requires an existing-runtime fixture state');
    await window.oplStudio.readState('fast');
    return true;
  })()`, timeoutMs: 15000 });
  const initial = await evaluatePage({ port: cdpPort, expression: "(() => { const sidebar = document.querySelector('[data-slot=\"sidebar\"]')?.parentElement; const moreButton = document.querySelector('button[aria-label=\"更多\"], button[aria-label=\"More\"]'); return { platform: document.documentElement.dataset.platform, theme: document.documentElement.dataset.dsThemeSource, dark: document.body.hasAttribute('data-ds-dark-theme'), root: Boolean(document.querySelector('[data-testid=\"opl-studio-root\"]')), sidebar: Boolean(sidebar), sidebarBackground: sidebar ? getComputedStyle(sidebar).backgroundImage + ' | ' + getComputedStyle(sidebar).backgroundColor : null, bodyBackground: getComputedStyle(document.body).backgroundColor, more: Boolean(moreButton), moreLabel: moreButton?.getAttribute('aria-label'), viewport: [innerWidth, innerHeight] }; })()" });
  assert.equal(initial.platform, "darwin");
  assert.equal(initial.theme, "system");
  assert.equal(initial.root, true);
  assert.equal(initial.sidebar, true);
  assert.equal(initial.more, true);
  await writeFile(path.join(screenshotRoot, "system.png"), await capturePageScreenshot({ port: cdpPort }));
  const nativeScreenshots = [await captureNativeWindow("system")];

  const moreMenu = await evaluatePageStable({ port: cdpPort, expression: "(async () => { document.querySelector('button[aria-label=\"更多\"], button[aria-label=\"More\"]').click(); const deadline = Date.now() + 5000; while (!document.querySelector('[role=\"menuitem\"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25)); return Array.from(document.querySelectorAll('[role=\"menuitem\"]')).map(item => item.textContent.trim()); })()", timeoutMs: 8000 });
  assert.deepEqual(moreMenu, ["管理应用与扩展"]);
  await writeFile(path.join(screenshotRoot, "more.png"), await capturePageScreenshot({ port: cdpPort }));
  nativeScreenshots.push(await captureNativeWindow("more"));
  await evaluatePage({ port: cdpPort, expression: "document.querySelector('button[aria-label=\"更多\"], button[aria-label=\"More\"]').click()" });

  const themes = [];
  for (const theme of ["light", "dark"]) {
    await evaluatePage({ port: cdpPort, expression: "(() => { const key = 'opl.studio.settings.v1'; const settings = JSON.parse(localStorage.getItem(key) || '{}'); localStorage.setItem(key, JSON.stringify({ ...settings, theme: " + JSON.stringify(theme) + " })); location.reload(); return true; })()" });
    await new Promise(resolve => setTimeout(resolve, 500));
    await waitForPageReady({ port: cdpPort, timeoutMs: 30000 });
    const state = await waitTheme(theme);
    state.sidebarBackground = await evaluatePage({ port: cdpPort, expression: "(() => { const sidebar = document.querySelector('[data-slot=\"sidebar\"]')?.parentElement; return sidebar ? getComputedStyle(sidebar).backgroundImage + ' | ' + getComputedStyle(sidebar).backgroundColor : null; })()" });
    state.more = await evaluatePage({ port: cdpPort, expression: "Boolean(document.querySelector('button[aria-label=\"更多\"], button[aria-label=\"More\"]'))" });
    assert.equal(state.theme, theme);
    assert.equal(state.dark, theme === "dark");
    assert.equal(state.nativeDark, theme === "dark");
    assert.equal(state.more, true);
    themes.push(state);
    await writeFile(path.join(screenshotRoot, theme + ".png"), await capturePageScreenshot({ port: cdpPort }));
    nativeScreenshots.push(await captureNativeWindow(theme));
  }

  assert.equal(createHash("sha256").update(await readFile(path.join(root, "dist/desktop/renderer.js"))).digest("hex"), rendererSha256, "Renderer bytes changed during native acceptance");
  const receipt = { status: "native_electron_ui_rendered_passed", evidenceLayer: "local_unpacked_electron", rendererSha256, dshUpstreamRef: manifest.upstream.ref, screenshots: screenshotRoot, nativeScreenshots, initial, moreMenu, themes, stableAppTouched: false, installed: false };
  await writeFile(path.join(screenshotRoot, "acceptance.json"), JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} catch (error) {
  error.message += "\nElectron exit: " + (exitSignal || "running") + "\nElectron stderr:\n" + (stderr || "<empty>");
  throw error;
} finally {
  try { child.send({ type: "opl-desktop-smoke-quit" }); } catch { child.kill("SIGTERM"); }
  const exited = await Promise.race([
    new Promise(resolve => child.once("exit", () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), 8000))
  ]);
  if (!exited) child.kill("SIGKILL");
  const lifecyclePath = path.join(tempRoot, "app-server-lifecycle.jsonl");
  const lifecycle = await readFile(lifecyclePath, "utf8").catch(() => "");
  const appServerPids = [...lifecycle.matchAll(/"event":"start","pid":(\d+)/g)].map(match => Number(match[1]));
  for (const pid of appServerPids) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
  await Promise.all(appServerPids.map(async pid => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try { process.kill(pid, 0); } catch { return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    try { process.kill(pid, "SIGKILL"); } catch {}
  }));
  await rm(tempRoot, { recursive: true, force: true });
}

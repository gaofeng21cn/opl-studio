import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "desktop", "main.mjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop", "preload.cjs"), "utf8");
const logDirectoryOwner = fs.readFileSync(path.join(root, "desktop", "app-log-directory.mjs"), "utf8");
const settingsPanel = fs.readFileSync(path.join(root, "src", "workbench", "SettingsPanel.tsx"), "utf8");

test("Electron is a thin, isolated adapter over the shared host core", () => {
  assert.match(main, /createOplHostCore/);
  assert.match(main, /workspaceRoot:\s*desktopCodexWorkspaceRoot\(\)/);
  assert.match(main, /app\.getPath\("home"\)/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /ipcMain\.handle\("opl:invoke"/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("oplStudio"/);
  assert.match(preload, /ipcRenderer\.invoke\("opl:invoke"/);
  assert.match(preload, /readDomainDetailView: \(request\) => invoke\("readDomainDetailView", request\)/);
  assert.doesNotMatch(main, /AionCore|AionUI/);
});

test("desktop readiness reports the exact running package version", () => {
  assert.match(main, /type: "opl-desktop-ready",\s+version: app\.getVersion\(\)/);
});

test("native accessibility support is enabled only by the qualification lane", () => {
  assert.match(main, /process\.env\.OPL_DESKTOP_NATIVE_ACCESSIBILITY_QUALIFICATION === "1"/);
  assert.match(main, /nativeAccessibilityQualificationEnabled[\s\S]+app\.commandLine\.appendSwitch\("force-renderer-accessibility"\)[\s\S]+app\.whenReady\(\)/);
  assert.match(main, /process\.platform === "win32"[\s\S]+app\.commandLine\.appendSwitch\("enable-features", "UiaProvider"\)/);
  assert.match(main, /app\.setAccessibilitySupportEnabled\(true\)/);
});

test("Electron owns the App carrier log directory exposed in diagnostics", () => {
  assert.match(main, /app\.getPath\("logs"\)/);
  assert.match(main, /carrierDiagnostics:/);
  assert.match(main, /owner: "one-person-lab-app_desktop_host"/);
  assert.match(main, /application: \{ systemInfo: \{ logDir:/);
  assert.match(main, /setLogDirectorySupported: true/);
  assert.match(main, /await appLogDirectory\.restore\(\)/);
  assert.match(main, /setLogDirectory: \(request\) => appLogDirectory\.setLogDirectory\(request\)/);
  assert.match(preload, /setLogDirectory: \(request\) => invoke\("setLogDirectory", request\)/);
  assert.match(preload, /listThreadWorkspace: \(request\) => invoke\("listThreadWorkspace", request\)/);
  assert.match(preload, /readThreadWorkspaceFile: \(request\) => invoke\("readThreadWorkspaceFile", request\)/);
  assert.match(preload, /searchThreadWorkspace: \(request\) => invoke\("searchThreadWorkspace", request\)/);
  assert.match(logDirectoryOwner, /desktop_client_system_info: \{ logDir \}/);
  assert.match(logDirectoryOwner, /electronApp\.setAppLogsPath\(nextLogDir\)/);
  assert.match(settingsPanel, /const appLogDirectory = carrierDiagnostics\.application\?\.systemInfo\.logDir/);
  assert.match(settingsPanel, /detail=\{appLogDirectoryDetail\}/);
  assert.match(settingsPanel, /carrierDiagnostics\.setLogDirectorySupported/);
  assert.match(settingsPanel, /onClick=\{onChangeLogDirectory\}/);
  assert.match(settingsPanel, /projection\?\.localEnvironment\.logsDir/);
});

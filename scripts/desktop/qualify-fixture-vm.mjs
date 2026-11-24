#!/usr/bin/env node
/**
 * Installs the exact Studio DMG into a clean Tart VM, runs the packaged Host
 * against the synthetic App Server and Framework fixtures, and exercises the
 * product surfaces a reader can actually click.
 *
 * The fixtures replace only the Codex App Server and the Framework state
 * readback. Everything else - the installed bundle, the native preload bridge,
 * the packaged Host, the renderer and the slots - is the real candidate.
 * This receipt is candidate evidence; it is not App release admission.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as parseCliArgs } from "node:util";
import { CdpSession, capturePageScreenshot, waitForPageReady } from "./cdp.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureSource = path.join(repositoryRoot, "tests/fixtures/studio-vm-fixture");
const packageVersion = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).version;
const defaultSourceVm = process.env.OPL_STUDIO_FIXTURE_VM_SOURCE || "opl-first-run-no-clt-clean-base-26-5-18";
const defaultGuestUser = process.env.OPL_STUDIO_FIXTURE_VM_USER || "admin";
const defaultSshKey = process.env.OPL_STUDIO_FIXTURE_VM_SSH_KEY || path.join(os.homedir(), ".ssh", "opl_first_run_tart_ed25519");
const productName = "One Person Lab Preview";
const bundleId = "cn.onepersonlab.opl.studio.preview";
const guestFixtureRoot = "/tmp/opl-feature-fixtures";
const guestWorkspace = "/tmp/opl-fixture-workspace";
const guestApp = `/Applications/${productName}.app`;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function run(executable, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", input, maxBuffer: 32 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(executable)} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

const sshArgs = (options, ip, command) => [
  "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
  "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=8", "-i", options.sshKey, `${options.guestUser}@${ip}`, command
];

const guestRun = (options, ip, command, extra) => run("ssh", sshArgs(options, ip, command), extra);
const scpToGuest = (options, ip, source, target) => run("scp", [
  "-r", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
  "-o", "IdentitiesOnly=yes", "-i", options.sshKey, source, `${options.guestUser}@${ip}:${target}`
]);

async function waitForIp(vmName, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run("tart", ["ip", vmName], { allowFailure: true });
    const ip = result.stdout.trim();
    if (result.status === 0 && ip) return ip;
    await delay(2_000);
  }
  throw new Error(`timed out waiting for a Tart IP for ${vmName}`);
}

/** Accessible-name based helpers injected into the packaged renderer. */
const pageHelpers = `
window.__oplVm = (() => {
  const name = (element) => (element.getAttribute?.('aria-label') || element.getAttribute?.('title') || element.textContent || '').replace(/\\s+/g, ' ').trim();
  const clickable = (element) => element && (element.tagName === 'BUTTON' || element.getAttribute?.('role') === 'button' || element.tagName === 'A' || element.tagName === 'SUMMARY' || element.getAttribute?.('role') === 'tab' || element.getAttribute?.('role') === 'treeitem' || element.getAttribute?.('role') === 'option');
  const all = () => Array.from(document.querySelectorAll('button,[role=button],a,summary,[role=tab],[role=treeitem],[role=option]'));
  const match = (element, text, exact) => {
    const value = name(element);
    return exact ? value === text : value.includes(text);
  };
  const find = (text, options = {}) => {
    const scope = options.scope ? document.querySelector(options.scope) : document;
    if (!scope) return null;
    const candidates = Array.from(scope.querySelectorAll('button,[role=button],a,summary,[role=tab],[role=treeitem],[role=option]')).filter(clickable);
    const visible = candidates.filter((element) => element.getClientRects().length > 0);
    return visible.find((element) => match(element, text, options.exact)) ?? null;
  };
  return {
    name,
    find,
    click(text, options = {}) {
      const element = find(text, options);
      if (!element) return false;
      element.click();
      return true;
    },
    dialog() { return Array.from(document.querySelectorAll('[role=dialog]')).find((element) => element.getClientRects().length > 0) ?? null; },
    settingsOpen() { return !!this.dialog(); },
    async openSettings() {
      if (this.dialog()) return true;
      if (!this.click('设置', { exact: true })) return false;
      for (let i = 0; i < 60; i += 1) { if (this.dialog()) return true; await new Promise((r) => setTimeout(r, 100)); }
      return false;
    },
    async openSection(label) {
      if (!await this.openSettings()) return false;
      const scope = '[role=dialog]';
      if (!this.click(label, { scope, exact: true }) && !this.click(label, { scope })) return false;
      for (let i = 0; i < 40; i += 1) {
        const active = Array.from(document.querySelectorAll('[role=dialog] [aria-current],[role=dialog] [aria-selected=true]'));
        if (active.some((element) => name(element).includes(label))) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return true;
    },
    close() {
      const button = find('关闭', { exact: true });
      if (button) { button.click(); return true; }
      return false;
    },
    text(selector) { return (document.querySelector(selector)?.innerText ?? '').replace(/\\n{2,}/g, '\\n'); },
    featureRows() { return Array.from(document.querySelectorAll('[data-feature-id]')).map((element) => ({ id: element.dataset.featureId, state: element.dataset.state })); }
  };
})();
true;
`;

export function parseArgs(argv) {
  const options = {
    dmg: null,
    sourceVm: defaultSourceVm,
    vmName: `opl-studio-fixture-${process.pid}`,
    sshKey: defaultSshKey,
    guestUser: defaultGuestUser,
    cdpPort: 19322,
    outPath: path.join(repositoryRoot, "out/feature-vm-ui.json"),
    screenshotsDir: path.join(repositoryRoot, "out/feature-vm"),
    keepVm: false,
    attach: false,
    timeoutMs: 60_000
  };
  let parsed;
  try {
    parsed = parseCliArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        "keep-vm": { type: "boolean" },
        attach: { type: "boolean" },
        dmg: { type: "string" },
        "source-vm": { type: "string" },
        "vm-name": { type: "string" },
        "ssh-key": { type: "string" },
        "guest-user": { type: "string" },
        "cdp-port": { type: "string" },
        "timeout-ms": { type: "string" },
        out: { type: "string" },
        "screenshots-dir": { type: "string" }
      }
    });
  } catch (error) {
    const token = error.message.match(/'([^']+)'/)?.[1]?.split(" ")[0] ?? argv[0];
    if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw new Error(`${token} requires a value`);
    throw new Error(`unsupported argument: ${token}`);
  }
  const { values } = parsed;
  if (values["keep-vm"]) options.keepVm = true;
  if (values.attach) options.attach = true;
  const takeValue = (name) => {
    const value = values[name];
    if (value === undefined) return undefined;
    invariant(value && !value.startsWith("--"), `--${name} requires a value`);
    return value;
  };
  const dmg = takeValue("dmg");
  if (dmg !== undefined) options.dmg = path.resolve(dmg);
  const sourceVm = takeValue("source-vm");
  if (sourceVm !== undefined) options.sourceVm = sourceVm;
  const vmName = takeValue("vm-name");
  if (vmName !== undefined) options.vmName = vmName;
  const sshKey = takeValue("ssh-key");
  if (sshKey !== undefined) options.sshKey = path.resolve(sshKey);
  const guestUser = takeValue("guest-user");
  if (guestUser !== undefined) options.guestUser = guestUser;
  const cdpPort = takeValue("cdp-port");
  if (cdpPort !== undefined) options.cdpPort = Number(cdpPort);
  const timeoutMs = takeValue("timeout-ms");
  if (timeoutMs !== undefined) options.timeoutMs = Number(timeoutMs);
  const out = takeValue("out");
  if (out !== undefined) options.outPath = path.resolve(out);
  const screenshotsDir = takeValue("screenshots-dir");
  if (screenshotsDir !== undefined) options.screenshotsDir = path.resolve(screenshotsDir);
  invariant(Number.isInteger(options.cdpPort) && options.cdpPort > 1024, "--cdp-port must be a host port");
  if (!options.attach) invariant(options.dmg, "--dmg is required unless --attach is used");
  return options;
}

function guestLaunchCommand(logPath) {
  const prepare = [
    `mkdir -p ${shellQuote(guestWorkspace)}`,
    `printf '# VM fixture\\n' > ${shellQuote(`${guestWorkspace}/result.md`)}`
  ].join(" && ");
  const launch = [
    `OPL_APP_OPL_BIN=${shellQuote(`${guestFixtureRoot}/fake-opl`)}`,
    `OPL_CODEX_BIN=${shellQuote(`${guestFixtureRoot}/fake-codex`)}`,
    "OPL_STUDIO_MANAGED_UPDATES=0",
    `OPL_STUDIO_CODEX_CWD=${shellQuote(guestWorkspace)}`,
    `FAKE_WORKSPACE=${shellQuote(guestWorkspace)}`,
    "FAKE_APP_SERVER_INCLUDE_PROJECTLESS=1",
    `FAKE_APP_SERVER_LOG=${shellQuote(`${guestFixtureRoot}/app-server.jsonl`)}`,
    "nohup",
    shellQuote(`${guestApp}/Contents/MacOS/${productName}`),
    "--disable-gpu",
    "--remote-debugging-port=9222",
    "--remote-debugging-address=127.0.0.1",
    `>${shellQuote(logPath)} 2>&1 </dev/null &`
  ].join(" ");
  return `${prepare} && ${launch}`;
}

async function capture(session, options, name) {
  if (!options.screenshotsDir) return;
  await mkdir(options.screenshotsDir, { recursive: true });
  await writeFile(path.join(options.screenshotsDir, `${name}.png`), await capturePageScreenshot({ port: options.cdpPort, timeoutMs: options.timeoutMs }));
}

function checkRunner() {
  const checks = [];
  return {
    checks,
    async check(name, run) {
      try {
        const detail = await run();
        checks.push({ name, status: "passed", ...(detail === undefined ? {} : { detail }) });
      } catch (error) {
        checks.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
      process.stdout.write(`${name} ${checks.at(-1).status}\n`);
      return checks.at(-1);
    }
  };
}

async function runChecks(session, options, pageErrors) {
  const { checks, check } = checkRunner();
  await session.evaluate(pageHelpers);

  await check("native bridge and 27 explicit feature states", async () => {
    await session.evaluate("window.__oplVm.openSection('概览')");
    await session.evaluate("window.__oplVm.click('刷新状态', { exact: true })");
    await delay(600);
    const rows = await session.evaluate("window.__oplVm.featureRows()");
    invariant(rows.length === 27, `expected 27 feature rows, found ${rows.length}`);
    const scheduled = rows.find((row) => row.id === "B0-12");
    invariant(scheduled, "B0-12 feature row is missing");
    invariant(
      ["owner_action_required", "degraded", "available"].includes(scheduled.state),
      `B0-12 reported an unexpected state: ${scheduled.state}`
    );
    return rows;
  });

  await check("all 8 Settings routes render and return", async () => {
    for (const label of ["概览", "账户与模型", "连接与访问", "工作区", "智能体与能力", "运行与维护", "偏好", "关于"]) {
      const opened = await session.evaluate(`window.__oplVm.openSection(${JSON.stringify(label)})`);
      invariant(opened, `Settings section ${label} could not be opened`);
      const length = await session.evaluate("window.__oplVm.text('[role=dialog]').length");
      invariant(length > 80, `Settings section ${label} rendered too little content`);
    }
    await session.evaluate("window.__oplVm.close()");
    await session.waitFor("!window.__oplVm.settingsOpen()", { description: "Settings to close" });
    const composer = await session.evaluate("!!document.querySelector('[data-composer-input]')");
    invariant(composer === true, "composer did not return after closing Settings");
  });

  await check("MAS MAG RCA ready in installed renderer", async () => {
    await session.evaluate("window.__oplVm.openSection('智能体与能力')");
    const text = await session.waitFor(
      "(() => { const t = window.__oplVm.text('[role=dialog]'); return /(3|0) \\/ 3 可用/.test(t) ? t : null; })()",
      { description: "Agent package readiness to settle", timeoutMs: 30_000 }
    );
    for (const name of ["MAS", "MAG", "RCA"]) invariant(text.includes(name), `Agent directory is missing ${name}`);
    invariant(text.includes("3 / 3 可用"), `Agent directory did not report 3 / 3 available:\n${text}`);
    await capture(session, options, "agents");
    return text.slice(0, 600);
  });

  await check("Settings keyboard focus restoration", async () => {
    await session.evaluate("window.__oplVm.close()");
    await session.waitFor("!window.__oplVm.settingsOpen()", { description: "Settings to close" });
    await session.evaluate("window.__oplVm.openSettings()");
    await session.waitFor("window.__oplVm.settingsOpen()", { description: "Settings to open" });
    await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await session.waitFor("!window.__oplVm.settingsOpen()", { description: "Settings to close on Escape" });
    const label = await session.evaluate("document.activeElement?.getAttribute('aria-label') ?? ''");
    invariant(label === "设置", `focus was not restored to the Settings control: ${label}`);
  });

  await check("Runtime three producer fixture projection", async () => {
    await session.evaluate("window.__oplVm.click('运行状态', { exact: true })");
    await session.waitFor("!!document.querySelector('[data-testid=opl-runtime-overview-page]')", { description: "runtime overview" });
    const text = await session.evaluate("window.__oplVm.text('main')");
    for (const name of ["MAS", "MAG", "RCA"]) invariant(text.includes(name), `runtime overview is missing ${name}:\n${text.slice(0, 400)}`);
    await capture(session, options, "runtime");
    return text.slice(0, 600);
  });

  await check("canonical thread native CRUD bridge", async () => {
    return await session.evaluate(`(async () => {
      const bridge = window.oplStudio;
      const list = await bridge.listThreads({});
      const read = await bridge.readThread({ threadId: 'thread-source', includeTurns: true });
      const resume = await bridge.resumeThread({ threadId: 'thread-source' });
      const archive = await bridge.setArchived({ threadId: 'thread-idle', archived: true, confirmed: true, confirmationId: 'fixture-archive' });
      const restore = await bridge.setArchived({ threadId: 'thread-idle', archived: false, confirmed: true, confirmationId: 'fixture-restore' });
      if (read?.id !== 'thread-source') throw new Error('readThread did not return the canonical thread: ' + JSON.stringify(read)?.slice(0, 200));
      if (!Array.isArray(list?.data) || list.data.length === 0) throw new Error('listThreads returned no canonical threads');
      return { listed: list.data.length, read: read.id, resume: !!resume, archive: !!archive, restore: !!restore };
    })()`);
  });

  await check("workspace file list read search containment through native IPC", async () => {
    return await session.evaluate(`(async () => {
      const bridge = window.oplStudio;
      const list = await bridge.listThreadWorkspace({ threadId: 'thread-source' });
      const file = await bridge.readThreadWorkspaceFile({ threadId: 'thread-source', relativePath: 'result.md' });
      const search = await bridge.searchThreadWorkspace({ threadId: 'thread-source', query: 'result' });
      let rejected = false;
      try { await bridge.readThreadWorkspaceFile({ threadId: 'thread-source', relativePath: '../../etc/passwd' }); }
      catch { rejected = true; }
      if (!rejected) throw new Error('path escape was accepted');
      return { listed: JSON.stringify(list ?? {}).length > 0, read: JSON.stringify(file ?? {}).length > 0, search: JSON.stringify(search ?? {}).length > 0, escapeRejected: rejected };
    })()`);
  });

  await check("missing Git reports unavailable on clean VM", async () => {
    const result = await session.evaluate("window.oplStudio.readThreadWorkspaceGit({ threadId: 'thread-source' })");
    invariant(result?.status === "unavailable", `Git status was ${JSON.stringify(result?.status)}`);
    return result;
  });

  await check("permission profiles and models through native IPC", async () => {
    const result = await session.evaluate(`(async () => ({
      permissions: await window.oplStudio.readCodexPermissionProfiles(),
      models: await window.oplStudio.readCodexModels()
    }))()`);
    const serialized = JSON.stringify(result);
    invariant(serialized.includes("read-only"), "permission profiles did not include read-only");
    invariant(serialized.includes("gpt-test"), "models did not include the fixture model");
    return result;
  });

  await check("rendered canonical thread selection and child Agent", async () => {
    await session.evaluate("window.__oplVm.click('新建任务', { exact: true })");
    await session.evaluate(`(() => {
      const collapsed = Array.from(document.querySelectorAll('[role=treeitem][aria-expanded=false]'));
      collapsed.forEach((element) => element.click());
      return collapsed.length;
    })()`);
    await delay(400);
    const selected = await session.evaluate("window.__oplVm.click('Thread thread-source')");
    invariant(selected === true, "the canonical thread row was not clickable in the task list");
    await session.waitFor(
      "Array.from(document.querySelectorAll('main strong')).some((element) => element.textContent === 'Thread thread-source')",
      { description: "thread-source to render" }
    );
    const subagents = await session.evaluate("document.querySelectorAll('[data-testid=opl-subagents-panel]').length");
    invariant(subagents > 0, "the subagent panel did not render for the selected thread");
  });

  await check("new task composer real event completion and canonical readback", async () => {
    await session.evaluate("window.__oplVm.click('新建任务', { exact: true })");
    await session.waitFor("!!document.querySelector('[data-composer-input]')", { description: "composer" });
    await session.evaluate("(() => { const input = document.querySelector('[data-composer-input]'); input.focus(); return document.activeElement === input; })()");
    await session.send("Input.insertText", { text: "VM fixture conversation" });
    await session.waitFor(
      "window.__oplVm.text('[data-composer-input]').includes('VM fixture conversation')",
      { description: "the composer to accept the typed goal" }
    );
    await session.evaluate("window.__oplVm.click('发送', { exact: true })");
    await session.waitFor("document.body.innerText.includes('completed turn-created-1')", { description: "fixture turn completion", timeoutMs: 30_000 });
    await capture(session, options, "conversation");
    const readback = await session.evaluate("window.oplStudio.readThread({ threadId: 'thread-created-1', includeTurns: true })");
    invariant(JSON.stringify(readback).includes("completed turn-created-1"), "canonical readback is missing the completed turn");
    return { createdThread: readback?.id ?? null };
  });

  await check("native attachment classification and cleanup", async () => {
    await session.waitFor("!!document.querySelector('input[type=file]')", { description: "composer file input" });
    await session.setFileInput("input[type=file]", [`${guestFixtureRoot}/fixture.txt`]);
    const attached = await session.waitFor(
      "window.__oplVm.text('main').includes('fixture.txt')",
      { description: "the composer to show the selected attachment" }
    );
    invariant(attached === true, "the composer never displayed the selected attachment");
    const removed = await session.evaluate("window.__oplVm.click('fixture.txt')");
    invariant(removed === true, "no control was available to clear the attachment");
    await session.waitFor("!window.__oplVm.text('main').includes('fixture.txt')", { description: "the attachment to be cleared" });
    return { attached: true, removed: true };
  });

  await check("native update status owner", async () => {
    const status = await session.evaluate("window.oplStudio.readNativeAppUpdateStatus()");
    invariant(JSON.stringify(status).includes(packageVersion), `native updater status does not report ${packageVersion}`);
    return status;
  });

  await check("no renderer exception", async () => {
    invariant(pageErrors.length === 0, `renderer exceptions: ${pageErrors.join(" | ")}`);
  });

  return checks;
}

async function qualifyFixtureVm(options) {
  invariant(options.attach || process.platform === "darwin", "Studio fixture VM qualification requires a macOS host");
  if (!options.attach) {
    await stat(options.dmg);
    await stat(options.sshKey);
    await stat(path.join(fixtureSource, "fake-app-server.mjs"));
  }
  const guestDmg = `/tmp/opl-studio-fixture-${process.pid}.dmg`;
  const guestLog = `/tmp/opl-feature-fixtures/app.log`;
  let tartProcess;
  let tunnel;
  let ip = null;
  let session = null;
  const receipt = {
    schema: "opl_studio_fixture_vm_acceptance.v1",
    sourceCommit: run("git", ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim() || null,
    appVersion: packageVersion,
    carrier: "macos_tart_installed_dmg",
    runtime: "fake App Server and synthetic Framework projections",
    activeShellAdopted: false,
    releaseReady: false,
    checks: []
  };
  try {
    if (!options.attach) {
      run("tart", ["clone", options.sourceVm, options.vmName]);
      tartProcess = spawn("tart", ["run", "--no-graphics", options.vmName], { stdio: "ignore" });
      ip = await waitForIp(options.vmName);
      receipt.vm = { source: options.sourceVm, clone: options.vmName, ip, started: true };
      scpToGuest(options, ip, options.dmg, guestDmg);
      const installOutput = guestRun(options, ip, [
        "set -e",
        `test ! -e ${shellQuote(guestApp)}`,
        `mkdir -p /tmp/opl-studio-fixture-mount`,
        `hdiutil attach -nobrowse -readonly -mountpoint /tmp/opl-studio-fixture-mount ${shellQuote(guestDmg)} >/dev/null`,
        `ditto "/tmp/opl-studio-fixture-mount/${productName}.app" ${shellQuote(guestApp)}`,
        "hdiutil detach /tmp/opl-studio-fixture-mount >/dev/null",
        `printf '{"version":"' && plutil -extract CFBundleShortVersionString raw -o - ${shellQuote(`${guestApp}/Contents/Info.plist`)} && printf '","productName":"' && plutil -extract CFBundleDisplayName raw -o - ${shellQuote(`${guestApp}/Contents/Info.plist`)} && printf '","bundleId":"' && plutil -extract CFBundleIdentifier raw -o - ${shellQuote(`${guestApp}/Contents/Info.plist`)} && printf '"}'`
      ].join(" && "));
      const identity = JSON.parse(installOutput.stdout.replace(/\r?\n/g, ""));
      receipt.install = {
        passed: identity.productName === productName && identity.bundleId === bundleId && identity.version === packageVersion,
        version: identity.version, bundleId: identity.bundleId, app: guestApp
      };
      invariant(receipt.install.passed, `installed identity mismatch: ${JSON.stringify(identity)}`);

      guestRun(options, ip, `mkdir -p ${shellQuote(guestFixtureRoot)} ${shellQuote(guestWorkspace)}`);
      scpToGuest(options, ip, `${fixtureSource}/.`, `${guestFixtureRoot}/`);
      guestRun(options, ip, [
        `chmod +x ${shellQuote(`${guestFixtureRoot}/fake-opl`)} ${shellQuote(`${guestFixtureRoot}/fake-codex`)}`,
        `printf 'fixture bytes' > ${shellQuote(`${guestFixtureRoot}/fixture.txt`)}`,
        `rm -f ${shellQuote(`${guestFixtureRoot}/app.log`)} ${shellQuote(`${guestFixtureRoot}/app-server.jsonl`)}`
      ].join(" && "));
      guestRun(options, ip, guestLaunchCommand(guestLog));
      tunnel = spawn("ssh", [
        "-N", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
        "-o", "IdentitiesOnly=yes", "-i", options.sshKey,
        "-L", `${options.cdpPort}:127.0.0.1:9222`, `${options.guestUser}@${ip}`
      ], { stdio: "ignore" });
    }
    await waitForPageReady({ port: options.cdpPort, timeoutMs: options.timeoutMs });
    session = await CdpSession.connect(options.cdpPort, options.timeoutMs);
    await session.send("Runtime.enable");
    await session.send("Log.enable").catch(() => undefined);
    const runtimeExceptions = [];
    session.onExceptionThrown((params) => {
      runtimeExceptions.push(params?.exceptionDetails?.exception?.description ?? "unknown exception");
    });
    receipt.checks = await runChecks(session, options, runtimeExceptions);
    receipt.pageErrors = runtimeExceptions;
  } catch (error) {
    receipt.failure = { detail: error instanceof Error ? error.message : String(error) };
    if (ip) receipt.guestLogTail = guestRun(options, ip, `tail -80 ${shellQuote(guestLog)}`, { allowFailure: true }).stdout;
  } finally {
    if (session) session.close();
    if (tunnel && tunnel.exitCode === null) tunnel.kill("SIGTERM");
    if (!options.keepVm && tartProcess && tartProcess.exitCode === null) tartProcess.kill("SIGTERM");
    if (!options.attach && !options.keepVm) {
      run("tart", ["stop", options.vmName], { allowFailure: true });
      run("tart", ["delete", options.vmName], { allowFailure: true });
    }
  }
  const productChecks = receipt.checks.filter((entry) => !entry.name.startsWith("__"));
  const passed = !receipt.failure && productChecks.length > 0 && productChecks.every((entry) => entry.status === "passed");
  receipt.status = passed ? "passed" : "partial";
  receipt.summary = {
    total: productChecks.length,
    passed: productChecks.filter((entry) => entry.status === "passed").length,
    failed: productChecks.filter((entry) => entry.status === "failed").length
  };
  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const receipt = await qualifyFixtureVm(parseArgs(process.argv.slice(2)));
  process.stdout.write(`\n${JSON.stringify(receipt.summary ?? {}, null, 2)}\n`);
  if (receipt.status !== "passed") process.exitCode = 2;
}

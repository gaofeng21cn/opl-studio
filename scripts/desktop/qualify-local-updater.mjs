import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const productName = "One Person Lab Preview";
const fakeAppServer = path.join(repositoryRoot, "scripts", "webui-host", "fixtures", "fake-app-server.mjs");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function nextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  invariant(match, `local updater qualification requires a numeric semver package version, observed ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

async function run(executable, args, label) {
  const child = spawn(executable, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"]
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? `signal ${signal}` : code));
  });
  invariant(exitCode === 0, `${label} failed with ${exitCode}`);
}

async function buildApp({ output, version, bundleIdentifier, zip }) {
  const builder = path.join(repositoryRoot, "node_modules", ".bin", "electron-builder");
  const architecture = process.arch;
  invariant(architecture === "arm64" || architecture === "x64", `unsupported macOS architecture ${architecture}`);
  const args = [
    ...(zip ? ["--mac", "zip"] : ["--dir", "--mac"]),
    `--${architecture}`,
    "--publish",
    "never",
    "--config",
    path.join(repositoryRoot, "electron-builder.yml"),
    `--config.directories.output=${output}`,
    `--config.extraMetadata.version=${version}`,
    `--config.appId=${bundleIdentifier}`
  ];
  await run(builder, args, `${zip ? "updater ZIP" : "directory App"} build`);
}

function plistValue(plistPath, key, { allowFailure = false } = {}) {
  const result = spawnSync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plistPath], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`plutil failed for ${key}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function createFeedServer(root) {
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      invariant(request.method === "GET" || request.method === "HEAD", "unsupported feed request method");
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      requests.push({ method: request.method, pathname: requestUrl.pathname });
      const name = decodeURIComponent(requestUrl.pathname.slice(1));
      invariant(name && name === path.basename(name) && !name.includes(".."), "invalid feed artifact path");
      const file = path.join(root, name);
      const bytes = await readFile(file);
      const contentType = name.endsWith(".yml") ? "text/yaml; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, {
        "content-type": contentType,
        "content-length": bytes.length,
        "cache-control": "no-store"
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end(error?.message ?? String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  invariant(address && typeof address === "object", "loopback updater feed did not bind a TCP port");
  return {
    server,
    requests,
    url: `http://127.0.0.1:${address.port}/`
  };
}

function launchApp({ appPath, feedUrl, stateRoot, homeRoot }) {
  const executable = path.join(appPath, "Contents", "MacOS", productName);
  const child = spawn(executable, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, ".codex"),
      OPL_CODEX_BIN: process.execPath,
      CODEX_APP_SERVER_ARGS: fakeAppServer,
      OPL_APP_OPL_BIN: "/usr/bin/true",
      OPL_NATIVE_WORKBENCH_CODEX_CWD: repositoryRoot,
      OPL_NATIVE_WORKBENCH_READ_ONLY: "1",
      OPL_STUDIO_AION_MIGRATION: "0",
      OPL_DESKTOP_UPDATE_QUALIFICATION_FEED_URL: feedUrl,
      OPL_DESKTOP_UPDATE_QUALIFICATION_AUTOMATIC: "1",
      OPL_DESKTOP_UPDATE_QUALIFICATION_STATE_ROOT: stateRoot
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  const messages = [];
  let output = "";
  child.on("message", (message) => messages.push(message));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { output += chunk; });
  return { child, messages, readOutput: () => output.slice(-8_000) };
}

async function waitForReady(running) {
  return waitFor(
    () => running.messages.find((message) => message?.type === "opl-desktop-ready" && message.visible),
    30_000,
    "packaged App readiness"
  );
}

async function invokeUpdater(running, operation, timeoutMs) {
  const startIndex = running.messages.length;
  running.child.send({ type: "opl-desktop-update-qualification", operation });
  const response = await waitFor(
    () => running.messages.slice(startIndex).find((message) =>
      message?.type === "opl-desktop-update-qualification-result" && message.operation === operation
    ),
    timeoutMs,
    `updater ${operation} response`
  );
  invariant(!response.error, `updater ${operation} failed: ${response.error}`);
  return response.result;
}

async function waitForExit(child, timeoutMs, label) {
  await waitFor(() => child.exitCode !== null || child.signalCode !== null, timeoutMs, label);
}

async function stopApp(running) {
  if (!running || running.child.exitCode !== null || running.child.signalCode !== null) return;
  try { running.child.send({ type: "opl-desktop-smoke-quit" }); } catch {}
  try {
    await waitForExit(running.child, 15_000, "packaged App exit");
  } catch {
    running.child.kill("SIGKILL");
    await waitForExit(running.child, 5_000, "forced packaged App exit");
  }
}

export async function qualifyLocalUpdater() {
  invariant(process.platform === "darwin", "local packaged updater qualification requires macOS");
  const pkg = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const baseVersion = pkg.version;
  const targetVersion = nextPatchVersion(baseVersion);
  const runRoot = await mkdtemp(path.join(os.tmpdir(), "opl-desktop-updater-qualification-"));
  const bundleIdentifier = `cn.onepersonlab.opl.studio.preview.updaterqualification.run${process.pid}`;
  const baseOutput = path.join(runRoot, "base-output");
  const targetOutput = path.join(runRoot, "target-feed");
  const installRoot = path.join(runRoot, "install");
  const installedApp = path.join(installRoot, `${productName}.app`);
  const homeRoot = path.join(runRoot, "home");
  const electronStateRoot = path.join(runRoot, "electron-state");
  const globalShipItCache = path.join(os.homedir(), "Library", "Caches", `${bundleIdentifier}.ShipIt`);
  const receiptPath = path.join(repositoryRoot, "out", "macos-desktop-updater-qualification.json");
  let feed;
  let running;
  let relaunched;
  try {
    await mkdir(baseOutput, { recursive: true });
    await mkdir(targetOutput, { recursive: true });
    await mkdir(installRoot, { recursive: true });
    await mkdir(homeRoot, { recursive: true });
    await mkdir(electronStateRoot, { recursive: true });
    await run(process.execPath, [path.join(repositoryRoot, "scripts", "build-desktop.mjs")], "desktop build");
    await buildApp({ output: baseOutput, version: baseVersion, bundleIdentifier, zip: true });
    await buildApp({ output: targetOutput, version: targetVersion, bundleIdentifier, zip: true });

    const sourceApp = path.join(baseOutput, `mac-${process.arch}`, `${productName}.app`);
    invariant((await stat(sourceApp)).isDirectory(), "base App bundle is missing");
    await cp(sourceApp, installedApp, { recursive: true, verbatimSymlinks: true });
    const plist = path.join(installedApp, "Contents", "Info.plist");
    invariant(plistValue(plist, "CFBundleIdentifier") === bundleIdentifier, "base App qualification identity mismatch");
    invariant(plistValue(plist, "CFBundleShortVersionString") === baseVersion, "base App version mismatch");

    const metadata = parse(await readFile(path.join(targetOutput, "latest-mac.yml"), "utf8"));
    invariant(metadata?.version === targetVersion, "target updater metadata version mismatch");
    invariant(typeof metadata?.path === "string" && metadata.path.endsWith(".zip"), "target updater ZIP metadata is missing");
    invariant((await stat(path.join(targetOutput, metadata.path))).isFile(), "target updater ZIP is missing");

    feed = await createFeedServer(targetOutput);
    running = launchApp({ appPath: installedApp, feedUrl: feed.url, stateRoot: electronStateRoot, homeRoot });
    const initialWindow = await waitForReady(running);
    const initialStatus = await invokeUpdater(running, "status", 10_000);
    invariant(initialStatus.currentVersion === baseVersion, "running base App reported the wrong version");
    const checked = await invokeUpdater(running, "check", 30_000);
    invariant(
      ["available", "downloading", "downloaded"].includes(checked.state) && checked.targetVersion === targetVersion,
      `packaged App did not discover the target update: state=${JSON.stringify(checked)} requests=${JSON.stringify(feed.requests)} output=${JSON.stringify(running.readOutput())}`
    );
    const applied = await waitFor(
      () => running.messages.find((message) => message.type === "opl-desktop-update-state" && message.state?.state === "downloaded")?.state,
      120_000, "silent update download"
    );
    invariant(applied.state === "downloaded" && applied.restartRequired, "packaged App did not download the target update");

    const restartStartIndex = running.messages.length;
    running.child.send({ type: "opl-desktop-smoke-quit" });
    await waitForExit(running.child, 90_000, "base App exit for update installation");
    const restartResponse = running.messages.slice(restartStartIndex).find((message) =>
      message?.type === "opl-desktop-update-qualification-result" && message.operation === "restart"
    );
    if (restartResponse) {
      invariant(!restartResponse.error && restartResponse.result?.accepted, "packaged App rejected update restart");
    }
    const installedVersion = await waitFor(
      () => plistValue(plist, "CFBundleShortVersionString", { allowFailure: true }) === targetVersion ? targetVersion : null,
      90_000,
      "Squirrel.Mac App replacement"
    );

    relaunched = launchApp({ appPath: installedApp, feedUrl: feed.url, stateRoot: electronStateRoot, homeRoot });
    const relaunchedWindow = await waitForReady(relaunched);
    const relaunchedStatus = await invokeUpdater(relaunched, "status", 10_000);
    invariant(relaunchedStatus.currentVersion === targetVersion, "relaunched App did not report the installed target version");
    await stopApp(relaunched);

    const receipt = {
      schema: "opl_macos_desktop_updater_qualification.v1",
      status: "passed",
      carrier: "electron_desktop",
      updater: "Squirrel.Mac via electron-updater",
      activation: "silent_download_then_normal_quit",
      architecture: process.arch,
      qualificationBundleIdentifier: bundleIdentifier,
      baseVersion,
      targetVersion,
      initialWindow,
      initialStatus,
      checked,
      applied,
      restartAccepted: restartResponse?.result?.accepted ?? "process_exited_and_update_installed",
      installedVersion,
      relaunchedWindow,
      relaunchedStatus,
      isolation: {
        loopbackFeed: true,
        temporaryHome: true,
        temporaryElectronState: true,
        temporaryInstall: true,
        productionBundleIdentityUsed: false
      }
    };
    await mkdir(path.dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally {
    await stopApp(relaunched);
    await stopApp(running);
    if (feed) await new Promise((resolve) => feed.server.close(resolve));
    await rm(runRoot, { recursive: true, force: true });
    await rm(globalShipItCache, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const receipt = await qualifyLocalUpdater();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

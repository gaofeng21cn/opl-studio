import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePage, waitForPageReady } from "./cdp.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const studioVersion = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).version;
const gatewayFileNames = ["credentials.json", "account.json", "installation.json"];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function gatewayRoot() {
  return process.env.OPL_GATEWAY_STATE_ROOT?.trim()
    || path.join(os.homedir(), "Library", "Application Support", "OPL", "state", "gateway");
}

function resolveExecutable(name, candidates) {
  const configured = name === "opl" ? process.env.OPL_APP_OPL_BIN : process.env.OPL_CODEX_BIN;
  if (configured?.trim()) return configured.trim();
  return candidates.find((candidate) => {
    try { accessSync(candidate, constants.X_OK); return true; } catch { return false; }
  });
}

async function snapshotFile(filePath) {
  try {
    const details = await stat(filePath);
    const bytes = await readFile(filePath);
    return {
      path: filePath,
      exists: true,
      regular: details.isFile(),
      symlink: false,
      mode: details.mode & 0o777,
      size: details.size,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } catch (error) {
    return { path: filePath, exists: false, error: error?.code ?? String(error) };
  }
}

async function snapshotGatewayFiles(root = gatewayRoot()) {
  return Object.fromEntries(await Promise.all(
    gatewayFileNames.map(async (name) => [name, await snapshotFile(path.join(root, name))])
  ));
}

function parseJsonOutput(stdout) {
  const start = stdout.search(/[\[{]/);
  invariant(start >= 0, "OPL state command returned no JSON");
  return JSON.parse(stdout.slice(start));
}

function gatewayProjection(state) {
  const outer = state?.app_state ?? state;
  const root = outer?.app_state ?? outer;
  return root?.settings_control_center?.app_settings_read_model?.opl_gateway_account ?? null;
}

function sanitizeGatewayProjection(projection) {
  if (!projection || typeof projection !== "object") return null;
  return {
    surfaceKind: projection.surface_kind ?? null,
    status: projection.status ?? null,
    connectionMode: projection.connection_mode ?? null,
    accountCardVisible: projection.account_card_visible === true,
    accountStatus: projection.account?.status ?? null,
    managedKeyStatus: projection.managed_key?.status ?? null,
    managedKeyOwnership: projection.managed_key?.ownership ?? null,
    deviceShortIdPresent: typeof projection.installation?.short_id === "string" && projection.installation.short_id.length > 0,
    freshness: {
      stale: projection.freshness?.stale === true,
      lastErrorCode: projection.freshness?.last_error_code ?? null
    }
  };
}

function runOplState() {
  const executable = resolveExecutable("opl", [
    "/opt/homebrew/bin/opl",
    "/usr/local/bin/opl",
    path.join(os.homedir(), ".local", "bin", "opl"),
    path.join(os.homedir(), "Library", "Application Support", "OPL", "framework", "bin", "opl")
  ]);
  if (!executable) return { available: false, reason: "opl_executable_not_found" };
  const result = spawnSync(executable, ["app", "state", "--profile", "fast", "--json"], {
    encoding: "utf8",
    env: { ...process.env, OPL_APP_OPL_BIN: executable },
    maxBuffer: 16 * 1024 * 1024
  });
  try {
    const state = parseJsonOutput(result.stdout || result.stderr);
    return {
      available: result.status === 0 || Boolean(state?.app_state),
      executable,
      exitCode: result.status,
      projection: sanitizeGatewayProjection(gatewayProjection(state))
    };
  } catch (error) {
    return {
      available: false,
      executable,
      exitCode: result.status,
      reason: "opl_state_json_unreadable",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== "ESRCH"; }
}

async function waitForExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await delay(100);
  }
  child.kill("SIGKILL");
}

async function launchAndRead({ appPath, port }) {
  const executable = path.join(appPath, "Contents", "MacOS", path.basename(appPath, ".app"));
  const child = spawn(executable, ["--disable-gpu", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-8_000); });
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-8_000); });
  try {
    await waitForPageReady({ port, timeoutMs: 30_000 });
    const deadline = Date.now() + 60_000;
    let page;
    while (Date.now() < deadline) {
      page = await evaluatePage({
        port,
        expression: `(async()=>{
          const state=await window.oplStudio.readState("fast");
          const settings=[...document.querySelectorAll("button")].find((button)=>button.innerText.trim()==="设置");
          settings?.click();
          await new Promise((resolve)=>setTimeout(resolve,250));
          const account=[...document.querySelectorAll("button")].find((button)=>button.innerText.trim()==="账户与模型");
          account?.click();
          let gatewayCard=false;
          for(let attempt=0;attempt<20 && !gatewayCard;attempt+=1){
            await new Promise((resolve)=>setTimeout(resolve,250));
            gatewayCard=!!document.querySelector('[data-testid="opl-settings-gateway-username"]');
          }
          const accountText=document.querySelector('[data-testid="opl-settings-panel"]')?.innerText||"";
          const gatewayVisible=gatewayCard || (accountText.includes("账户") && accountText.includes("已连接") && accountText.includes("设备访问"));
          const about=[...document.querySelectorAll("button")].find((button)=>button.innerText.trim()==="关于");
          about?.click();
          await new Promise((resolve)=>setTimeout(resolve,250));
          const aboutText=document.querySelector('[data-testid="opl-settings-panel"]')?.innerText||"";
          return {readyState:document.readyState,root:!!document.getElementById("root"),bridge:!!window.oplStudio,state,ui:{settingsPanel:!!document.querySelector('[data-testid="opl-settings-panel"]'),gatewayCard:gatewayVisible,accountText,versionVisible:aboutText.includes(${JSON.stringify(studioVersion)})}};
        })()`
      });
      if (page?.state?.readback?.exitCode === 0 && gatewayProjection(page.state)) break;
      await delay(1_000);
    }
    return { page, output };
  } finally {
    if (processExists(child.pid)) {
      child.kill("SIGTERM");
      await waitForExit(child, 5_000);
    }
  }
}

function sanitizePageState(value) {
  return {
    readyState: value?.readyState ?? null,
    root: value?.root === true,
    bridge: value?.bridge === true,
    gateway: sanitizeGatewayProjection(gatewayProjection(value?.state)),
    stateReadbackExitCode: value?.state?.readback?.exitCode ?? value?.state?.readback?.status ?? null,
    stateReadbackTimedOut: value?.state?.readback?.timedOut === true,
    ui: {
      settingsPanel: value?.ui?.settingsPanel === true,
      gatewayAccountCard: value?.ui?.gatewayCard === true,
      accountTextPresent: typeof value?.ui?.accountText === "string" && value.ui.accountText.length > 0,
      versionVisible: value?.ui?.versionVisible === true
    }
  };
}

export async function diagnoseGatewayCredentialPersistence({
  appPath = "/Applications/One Person Lab Preview.app",
  port = 9234,
  outPath = path.join(repositoryRoot, "out", "gateway-credential-persistence-diagnostic.json"),
  launch = true
} = {}) {
  const beforeFiles = await snapshotGatewayFiles();
  const beforeOwner = runOplState();
  let page = null;
  let launchError = null;
  if (launch) {
    try {
      page = await launchAndRead({ appPath, port });
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error);
    }
  }
  const afterFiles = await snapshotGatewayFiles();
  const afterOwner = runOplState();
  const fileComparisons = Object.fromEntries(gatewayFileNames.map((name) => {
    const before = beforeFiles[name];
    const after = afterFiles[name];
    return [name, {
      beforeExists: before.exists === true,
      afterExists: after.exists === true,
      unchanged: before.exists === true && after.exists === true
        && before.sha256 === after.sha256
        && before.mode === after.mode
        && before.size === after.size,
      mode0600Before: before.mode === 0o600,
      mode0600After: after.mode === 0o600
    }];
  }));
  const filesStable = Object.values(fileComparisons).every((comparison) => comparison.unchanged && comparison.mode0600After);
  const ownerConnected = [beforeOwner.projection, afterOwner.projection].every((projection) => projection?.status === "connected" && projection?.connectionMode === "account");
  const pageGateway = sanitizeGatewayProjection(gatewayProjection(page?.page?.state));
  const pageMatchesOwner = pageGateway?.status === afterOwner.projection?.status
    && pageGateway?.connectionMode === afterOwner.projection?.connectionMode;
  const uiPassed = launch
    ? page?.page?.ui?.settingsPanel === true
      && page?.page?.ui?.gatewayCard === true
      && page?.page?.ui?.versionVisible === true
    : true;
  const status = filesStable && ownerConnected && (launch ? pageMatchesOwner && uiPassed : true) ? "passed" : "partial";
  const receipt = {
    schema: "opl_gateway_credential_persistence_diagnostic.v1",
    status,
    owner: "opl_framework",
    app: { path: appPath, launched: launch, page: page ? sanitizePageState(page.page) : null, launchError },
    ownerState: { before: beforeOwner, after: afterOwner, pageMatchesOwner },
    files: { root: gatewayRoot(), comparisons: fileComparisons },
    falseReadyBoundary: { releaseReady: false, activeShellAdopted: false, cleanVmReady: false }
  };
  await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const receipt = await diagnoseGatewayCredentialPersistence({
    appPath: process.env.OPL_STUDIO_APP_PATH || "/Applications/One Person Lab Preview.app",
    port: Number(process.env.OPL_STUDIO_CDP_PORT || "9234"),
    launch: !process.argv.includes("--no-launch")
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status !== "passed") process.exitCode = 2;
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { capturePageScreenshot, evaluatePage, evaluatePageStable, waitForPageReady } from "./cdp.mjs";
import {
  PREVIEW_PRODUCT,
  loadPreviewSmokeInputs,
  parsePreviewSmokeArgs,
  redactSecrets,
  runPreviewSmoke,
  verifyPreviewIdentity
} from "./preview-smoke.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const studioVersion = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).version;
const defaultSourceVm = process.env.OPL_STUDIO_CLEAN_VM_SOURCE || "opl-first-run-no-clt-clean-base-26-5-18";
const defaultGuestUser = process.env.OPL_STUDIO_CLEAN_VM_USER || "admin";
const defaultSshKey = process.env.OPL_STUDIO_CLEAN_VM_SSH_KEY || path.join(os.homedir(), ".ssh", "opl_first_run_tart_ed25519");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const FULL_OFFLINE_NETWORK_POLICY = 'Tart host-only network (--net-host); Electron sandbox unchanged';

export function buildVmRunArgs(vmName, offlineNetwork = false) {
  return ['run', '--no-graphics', ...(offlineNetwork ? ['--net-host'] : []), vmName];
}

export function buildGuestDmgAdmissionCommand(guestDmg) {
  const dmg = shellQuote(guestDmg);
  return `/usr/bin/xattr -w com.apple.quarantine '0083;00000000;OPL-Release-Qualification;' ${dmg} && /usr/sbin/spctl --assess --type open --context context:primary-signature --verbose=2 ${dmg}`;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseInstalledIdentityOutput(value) {
  return JSON.parse(String(value).replace(/\r?\n/g, ""));
}

// Runs inside the disposable guest against the packaged Framework public CLI.
// Keep this function self-contained so its exact source can be sent to the guest.
export async function collectTemporalServiceSupervisorProof({ runtime, hooks = {} }) {
  const { spawnSync } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const label = "ai.opl.family-runtime.temporal-service";
  const env = { ...process.env, OPL_FULL_RUNTIME_HOME: runtime, OPL_SKIP_SKILL_SYNC: "1",
    PATH: [runtime + "/bin", runtime + "/node/bin", runtime + "/uv/bin", process.env.PATH].join(":") };
  // An explicit address would turn a managed service into an external provider.
  delete env.OPL_TEMPORAL_ADDRESS;
  const command = hooks.command ?? ((executable, args, { allowFailure = false } = {}) => {
    const r = spawnSync(executable, args, { encoding: "utf8", env, timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
    if (r.error || (!allowFailure && r.status !== 0)) throw new Error(r.stderr || r.error?.message || `${executable} failed`);
    return { args, status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr };
  });
  const opl = hooks.opl ?? ((args) => JSON.parse(command(runtime + "/bin/opl", [...args, "--json"]).stdout));
  const home = hooks.home ?? os.homedir();
  const uid = hooks.uid ?? process.getuid();
  const domain = `gui/${uid}`;
  const plistPath = `${home}/Library/LaunchAgents/${label}.plist`;
  const databasePath = `${home}/Library/Application Support/OPL/state/family-runtime/temporal-server/temporal.sqlite`;
  const readPlist = hooks.readPlist ?? (() => JSON.parse(command("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath]).stdout));
  const database = hooks.database ?? (async () => {
    const info = await fs.stat(databasePath);
    const file = await fs.open(databasePath, "r");
    try {
      const header = Buffer.alloc(16); await file.read(header, 0, 16, 0);
      return { identity: `${info.dev}:${info.ino}`, size: info.size, valid: header.toString() === "SQLite format 3\0" };
    } finally { await file.close(); }
  });
  const sleep = hooks.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const readback = () => {
    const value = opl(["family-runtime", "service", "status", "--provider", "temporal"]);
    const status = value.family_runtime_service;
    if (!status || typeof status !== "object") throw new Error("Framework Temporal status is missing");
    return { service_ready: status.service_status === "running", server_reachable: status.server_reachable, supervisor: status.supervisor };
  };
  const ready = async (previousPid = null) => {
    const deadline = Date.now() + 90000;
    do {
      const value = readback(); const s = value.supervisor;
      if (value.service_ready && value.server_reachable && s?.ready === true && s.required === true
        && s.configuration_current === true && s.process_state === "running"
        && Number.isSafeInteger(s.pid) && s.pid > 0 && s.pid !== previousPid) return value;
      await sleep(1000);
    } while (Date.now() < deadline);
    throw new Error("Temporal supervisor did not become ready with a fresh PID");
  };
  const start = opl(["app", "action", "execute", "--action", "provider_service_start"]).app_action_execution;
  if (start?.action_id !== "provider_service_start" || start.dry_run !== false) throw new Error("Temporal start action did not execute");
  const initial = await ready();
  const plist = readPlist();
  if (plist.Label !== label || plist.RunAtLoad !== true || plist.KeepAlive !== true
    || !plist.ProgramArguments?.includes(databasePath)) throw new Error("Temporal launchd configuration is invalid");
  const first = await database();
  if (!first.valid || !first.identity) throw new Error("Temporal persistent database is invalid");
  command("/bin/kill", ["-TERM", String(initial.supervisor.pid)]);
  const recovered = await ready(initial.supervisor.pid);
  const afterRecovery = await database();
  const restart = opl(["app", "action", "execute", "--action", "provider_service_restart"]).app_action_execution;
  if (restart?.action_id !== "provider_service_restart" || restart.dry_run !== false) throw new Error("Temporal restart action did not execute");
  const restarted = await ready(recovered.supervisor.pid);
  const afterRestart = await database();
  const bootout = command("/bin/launchctl", ["bootout", `${domain}/${label}`]);
  // bootout can return before launchd releases the job and its process. Prove
  // both have disappeared before requesting a new registration.
  const unloadDeadline = Date.now() + 30000;
  let unloaded = false;
  do {
    const job = command("/bin/launchctl", ["print", `${domain}/${label}`], { allowFailure: true });
    const processState = command("/bin/kill", ["-0", String(restarted.supervisor.pid)], { allowFailure: true });
    if (job.status !== 0 && processState.status !== 0) { unloaded = true; break; }
    await sleep(500);
  } while (Date.now() < unloadDeadline);
  if (!unloaded) throw new Error("Temporal launchd job did not unload after bootout");
  const bootstrapAttempts = [];
  let bootstrap;
  for (let attempt = 0; attempt < 3; attempt++) {
    bootstrap = command("/bin/launchctl", ["bootstrap", domain, plistPath], { allowFailure: true });
    bootstrapAttempts.push(bootstrap);
    if (bootstrap.status === 0) break;
    const state = command("/bin/launchctl", ["print", `${domain}/${label}`], { allowFailure: true });
    if (bootstrap.status !== 5 || state.status === 0) break;
    await sleep(1000 * (attempt + 1));
  }
  if (bootstrap.status !== 0) throw new Error(`Temporal session bootstrap was rejected: ${JSON.stringify({ bootstrapAttempts })}`);
  const reloaded = await ready(restarted.supervisor.pid);
  const afterReload = await database();
  const same = (value) => value.valid === true && value.identity === first.identity;
  if (![afterRecovery, afterRestart, afterReload].every(same)) throw new Error("Temporal lifecycle replaced its persistent database");
  return {
    schema: "opl_temporal_service_supervisor_proof.v1", status: "passed", runtime_profile: "full", applicable: true, required: true,
    supervisor_label: label, start_action: start, restart_action: restart,
    plist: { path: plistPath, label: plist.Label, program_arguments: plist.ProgramArguments,
      run_at_load: plist.RunAtLoad, keep_alive: plist.KeepAlive, database_path: databasePath },
    initial_readback: initial,
    keep_alive_recovery: { termination: { pid: initial.supervisor.pid, signal: "SIGTERM", status: "sent" }, readback: recovered },
    restart_readback: restarted, session_reload: { bootout, unloaded, bootstrap, bootstrap_attempts: bootstrapAttempts, readback: reloaded },
    persistent_database: { path: databasePath, sqlite_header_valid: first.valid, initial_size_bytes: first.size,
      file_identity: first.identity, same_file_after_keep_alive_recovery: same(afterRecovery),
      same_file_after_restart: same(afterRestart), same_file_after_session_reload: same(afterReload) }
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export async function prepareRunnerTrustBundle(directory, getCertificates = tls.getCACertificates) {
  const system = getCertificates("system");
  if (system.length === 0) return null;
  const certificates = [...new Set([...getCertificates("default"), ...system])];
  const contents = certificates.join("\n");
  const file = path.join(directory, "runner-system-ca.pem");
  await writeFile(file, contents, { mode: 0o600 });
  return {
    file,
    source: "runner_node_system_and_default_trust",
    certificateCount: certificates.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
    tlsVerificationDisabled: false,
    scope: "transient_guest_process_environment"
  };
}

// Framework already supports `gh api` as its read-only release metadata
// transport. Supply verified public responses, never runner credentials, to
// guests sharing a rate-limited anonymous GitHub egress. Archive downloads and
// digest/version verification still execute through the real guest installer.
export async function preparePublicReleaseMetadata(directory, frameworkArchive, fetchRelease = (endpoint) => {
  const result = spawnSync("gh", ["api", endpoint], { encoding: "utf8", timeout: 60_000, maxBuffer: 24 * 1024 * 1024 });
  invariant(result.status === 0, `Public dependency metadata read failed: ${endpoint}`);
  return JSON.parse(result.stdout);
}) {
  const policy = JSON.parse(run("tar", ["-xOf", frameworkArchive, "one-person-lab/contracts/opl-framework/dependency-release-sources.json"]).stdout);
  const releases = Object.create(null);
  for (const source of Object.values(policy.sources ?? {})) {
    if (source.kind !== "github-release") continue;
    invariant(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository ?? ""), "Invalid public dependency repository");
    const endpoint = `repos/${source.repository}/releases/latest`;
    const release = await fetchRelease(endpoint);
    // GitHub can redirect a repository to its canonical owner (for example,
    // facebook/zstd -> meta/zstd) while keeping the requested API endpoint.
    // Validate the returned release as an official GitHub release without
    // pinning the response to the pre-redirect repository path.
    invariant(release?.draft === false && release?.prerelease === false && typeof release?.tag_name === "string"
      && /^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/[1-9][0-9]*$/.test(String(release.url ?? "")), `Invalid stable public dependency metadata: ${endpoint}`);
    releases[endpoint] = release;
  }
  const contents = JSON.stringify({ schema: "opl_clean_vm_public_release_metadata.v1", releases });
  const metadataFile = path.join(directory, "public-release-metadata.json");
  const readerFile = path.join(directory, "public-release-metadata.mjs");
  await writeFile(metadataFile, contents, { mode: 0o600 });
  await writeFile(readerFile, `import fs from "node:fs";
const [method, endpoint, ...extra] = process.argv.slice(2);
const { releases } = JSON.parse(fs.readFileSync(new URL("./public-release-metadata.json", import.meta.url), "utf8"));
if (method !== "api" || extra.length || !Object.hasOwn(releases, endpoint)) process.exit(1);
process.stdout.write(JSON.stringify(releases[endpoint]));
`, { mode: 0o600 });
  return { metadataFile, readerFile, sha256: createHash("sha256").update(contents).digest("hex"),
    endpoints: Object.keys(releases), source: "runner_read_only_public_github_release_metadata", credentialsCopiedToGuest: false,
    guestArchiveDownloadAndDigestVerification: true };
}

export function parseCurrentFirstInstallAttempt(text, appProcessId) {
  try {
    const attempt = JSON.parse(text);
    return attempt.schema === "opl_official_profile_first_install_terminal.v1" && attempt.app_process_id === appProcessId ? attempt : null;
  } catch { return null; }
}

export function buildGuestLaunchCommand({
  appExecutable,
  logPath,
  codexBinary = null,
  frameworkSourceArchive = null,
  frameworkRef = null,
  caBundle = null,
  publicMetadataBin = null,
  allowActions = false
}) {
  return [
    publicMetadataBin ? `PATH=${shellQuote(publicMetadataBin)}:"$PATH"` : null,
    caBundle ? `NODE_EXTRA_CA_CERTS=${shellQuote(caBundle)}` : null,
    caBundle ? `SSL_CERT_FILE=${shellQuote(caBundle)}` : null,
    codexBinary ? `OPL_CODEX_BIN=${shellQuote(codexBinary)}` : null,
    frameworkSourceArchive ? `OPL_SOURCE_ARCHIVE_URL=${shellQuote(`file://${frameworkSourceArchive}`)}` : null,
    frameworkRef ? `OPL_FRAMEWORK_SOURCE_COMMIT=${shellQuote(frameworkRef)}` : null,
    allowActions ? "OPL_NATIVE_WORKBENCH_READ_ONLY=0" : null,
    "nohup",
    shellQuote(appExecutable),
    "--disable-gpu",
    "--remote-debugging-port=9222",
    "--remote-debugging-address=127.0.0.1",
    `>${shellQuote(logPath)}`,
    "2>&1",
    "& echo $!"
  ].filter(Boolean).join(" ");
}

export function parseArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanOptions = {
    sourceVm: defaultSourceVm,
    dmg: path.join(repositoryRoot, "out", `one-person-lab-preview-${studioVersion}-mac-arm64.dmg`),
    guestUser: defaultGuestUser,
    sshKey: defaultSshKey,
    vmName: `opl-studio-clean-${stamp}`,
    outPath: path.join(repositoryRoot, "out", "studio-clean-vm-qualification.json"),
    keepVm: false,
    skipClone: false,
    attach: false,
    allowActions: false,
    codexPlatformPackageTarball: null,
    codexVersion: null,
    frameworkSourceArchive: null,
    frameworkRef: null
  };
  const smokeArgv = [];
  const takeValue = (arg, index) => {
    const value = argv[index + 1];
    invariant(value, `missing value for ${arg}`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep-vm") { cleanOptions.keepVm = true; continue; }
    if (arg === "--skip-clone") { cleanOptions.skipClone = true; continue; }
    if (arg === "--attach") { cleanOptions.attach = true; continue; }
    if (arg === "--allow-actions") { cleanOptions.allowActions = true; continue; }
    if (arg === "--source-vm") { cleanOptions.sourceVm = takeValue(arg, index); index += 1; continue; }
    if (arg === "--dmg") { cleanOptions.dmg = path.resolve(takeValue(arg, index)); index += 1; continue; }
    if (arg === "--guest-user") { cleanOptions.guestUser = takeValue(arg, index); index += 1; continue; }
    if (arg === "--ssh-key") { cleanOptions.sshKey = path.resolve(takeValue(arg, index)); index += 1; continue; }
    if (arg === "--vm-name") { cleanOptions.vmName = takeValue(arg, index); index += 1; continue; }
    if (arg === "--out") { cleanOptions.outPath = path.resolve(takeValue(arg, index)); index += 1; continue; }
    if (arg === "--codex-platform-package-tarball") {
      cleanOptions.codexPlatformPackageTarball = path.resolve(takeValue(arg, index));
      index += 1;
      continue;
    }
    if (arg === "--codex-version") {
      cleanOptions.codexVersion = takeValue(arg, index).trim();
      invariant(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(cleanOptions.codexVersion), "--codex-version must be a package version");
      index += 1;
      continue;
    }
    if (arg === "--framework-source-archive") {
      cleanOptions.frameworkSourceArchive = path.resolve(takeValue(arg, index));
      index += 1;
      continue;
    }
    if (arg === "--framework-ref") {
      cleanOptions.frameworkRef = takeValue(arg, index).trim();
      invariant(/^[0-9a-f]{40}$/.test(cleanOptions.frameworkRef), "--framework-ref must be an exact lowercase 40-character SHA");
      index += 1;
      continue;
    }
    if (["--require-gateway-setup", "--require-codex-turn"].includes(arg)) { smokeArgv.push(arg); continue; }
    if (["--carrier", "--product-name", "--bundle-id", "--cdp-port", "--runtime-profiles", "--gateway-credentials-file", "--codex-turn-hook-file", "--codex-turn-prompt", "--timeout-ms", "--app-path", "--screenshots-dir"].includes(arg)) {
      const value = takeValue(arg, index);
      index += 1;
      smokeArgv.push(arg, value);
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  const smokeOptions = parsePreviewSmokeArgs(smokeArgv, {
    env: {
      ...process.env,
      OPL_STUDIO_CDP_PORT: process.env.OPL_STUDIO_CDP_PORT || String(19222 + (process.pid % 500))
    }
  });
  invariant(
    Boolean(cleanOptions.codexPlatformPackageTarball) === Boolean(cleanOptions.codexVersion),
    "--codex-platform-package-tarball and --codex-version must be provided together"
  );
  invariant(
    Boolean(cleanOptions.frameworkSourceArchive) === Boolean(cleanOptions.frameworkRef),
    "--framework-source-archive and --framework-ref must be provided together"
  );
  invariant(!cleanOptions.attach || !cleanOptions.allowActions, "--allow-actions cannot be used with --attach");
  invariant(!cleanOptions.attach || !cleanOptions.frameworkSourceArchive, "Framework source preparation cannot be used with --attach");
  return {
    ...cleanOptions,
    ...smokeOptions,
    outPath: smokeOptions.outPath ?? cleanOptions.outPath
  };
}

function run(executable, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(executable)} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function sshArgs(options, ip, command) {
  return ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=8", "-i", options.sshKey, `${options.guestUser}@${ip}`, command];
}

function guestRun(options, ip, command, { allowFailure = false } = {}) {
  return run("ssh", sshArgs(options, ip, command), { allowFailure });
}

function scpToGuest(options, ip, source, target) {
  return run("scp", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-i", options.sshKey, source, `${options.guestUser}@${ip}:${target}`]);
}

export async function waitForVmIp(vmName, { vmProcess, timeoutMs = 120_000, pollMs = 2_000,
  readIp = () => run("tart", ["ip", vmName], { allowFailure: true }) } = {}) {
  let diagnostics = "";
  let spawnError;
  vmProcess?.stderr?.on("data", (chunk) => { diagnostics = (diagnostics + String(chunk)).slice(-4096); });
  vmProcess?.once("error", (error) => { spawnError = error; });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (spawnError || (vmProcess && (vmProcess.exitCode !== null || vmProcess.signalCode !== null))) {
      throw new Error(`Tart failed to start ${vmName}: ${spawnError?.message || diagnostics.trim() || `exit=${vmProcess.exitCode}, signal=${vmProcess.signalCode}`}`);
    }
    const result = readIp();
    const ip = result.stdout.trim();
    if (result.status === 0 && ip) return ip;
    await delay(pollMs);
  }
  throw new Error(`timed out waiting for Tart IP for ${vmName}${diagnostics.trim() ? `: ${diagnostics.trim()}` : ""}`);
}

export async function qualifyCleanVm(options) {
  invariant(options.attach || process.platform === "darwin", "Studio clean VM qualification requires macOS host");
  invariant(Number.isInteger(options.cdpPort) && options.cdpPort > 1024, "CDP port must be a valid host port");
  if (!options.attach) {
    await stat(options.dmg);
    await stat(options.sshKey);
    if (options.codexPlatformPackageTarball) await stat(options.codexPlatformPackageTarball);
    if (options.frameworkSourceArchive) await stat(options.frameworkSourceArchive);
  }
  const runRoot = await mkdtemp(path.join(os.tmpdir(), "opl-studio-clean-vm-"));
  const productName = options.productName || PREVIEW_PRODUCT.productName;
  const bundleId = options.bundleId || PREVIEW_PRODUCT.bundleId;
  const fullRuntime = options.runtimeProfiles?.includes("full") === true;
  const externalCodex = !fullRuntime && options.codexPlatformPackageTarball;
  const guestDmg = `/tmp/opl-studio-clean-${process.pid}.dmg`;
  const guestCodexTarball = `/tmp/opl-studio-clean-${process.pid}-codex.tgz`;
  const guestCodexRoot = `/tmp/opl-studio-clean-${process.pid}-codex`;
  const guestCodexBinary = `${guestCodexRoot}/package/vendor/aarch64-apple-darwin/bin/codex`;
  const guestFrameworkArchive = `/tmp/opl-studio-clean-${process.pid}-framework.tar.gz`;
  const guestCaBundle = `/tmp/opl-studio-clean-${process.pid}-system-ca.pem`;
  const guestMetadataRoot = `/tmp/opl-studio-clean-${process.pid}-public-metadata`;
  const guestApp = `/Applications/${productName}.app`;
  const guestLog = `/tmp/opl-studio-clean-${process.pid}.log`;
  let tartProcess;
  let tunnel;
  let ip = null;
  let guestAppProcessId = null;
  let smokeInputs = { credentials: null, turnRequest: null };
  const phaseTimeoutMs = Math.min(
    Number.isFinite(options.phaseTimeoutMs) && options.phaseTimeoutMs > 0 ? options.phaseTimeoutMs : 120_000,
    options.timeoutMs
  );
  const progressEvents = [];
  const progress = (event) => {
    const value = { ...event, at: event?.at ?? new Date().toISOString() };
    progressEvents.push(value);
    try { options.progress?.(value); } catch {}
    process.stderr.write(`[opl-studio-clean-vm] ${JSON.stringify(value)}\n`);
  };
  const checks = {
    codex: options.codexPlatformPackageTarball
      ? {
        status: options.attach ? "skipped" : "pending",
        reason: options.attach ? "attach_mode_does_not_prepare_guest_codex" : null,
        platform: "darwin-arm64",
        package: "@openai/codex-darwin-arm64",
        expectedVersion: options.codexVersion,
        source: path.basename(options.codexPlatformPackageTarball),
        binary: "<guest-temp>/package/vendor/aarch64-apple-darwin/bin/codex",
        injectedVia: "OPL_CODEX_BIN",
        bundleIncluded: false
      }
      : {
        status: "skipped",
        reason: "external_codex_not_provided",
        platform: null,
        package: null,
        expectedVersion: null,
        source: null,
        binary: null,
        injectedVia: null,
        bundleIncluded: false
      },
    framework: options.frameworkSourceArchive
      ? {
        status: "pending",
        expectedRef: options.frameworkRef,
        archive: path.basename(options.frameworkSourceArchive),
        archiveSha256: sha256File(options.frameworkSourceArchive),
        source: "exact_runner_checkout_archive",
        guestInjection: "OPL_SOURCE_ARCHIVE_URL_and_OPL_FRAMEWORK_SOURCE_COMMIT",
        bundleIncluded: false
      }
      : {
        status: "skipped",
        reason: "packaged_full_runtime_or_external_framework_not_provided",
        expectedRef: null,
        bundleIncluded: false
      }
  };
  try {
    if (!options.attach) {
      progress({ phase: "clone_vm", status: "started", vm_name: options.vmName });
      if (!options.skipClone) run("tart", ["clone", options.sourceVm, options.vmName]);
      progress({ phase: "start_vm", status: "started", vm_name: options.vmName });
      tartProcess = spawn("tart", buildVmRunArgs(options.vmName, fullRuntime), { stdio: ["ignore", "ignore", "pipe"] });
      ip = await waitForVmIp(options.vmName, { vmProcess: tartProcess });
      progress({ phase: "wait_for_ip", status: "passed", vm_name: options.vmName, guest_ip: ip });
      checks.vm = { source: options.sourceVm, clone: options.vmName, ip, started: true };

      scpToGuest(options, ip, options.dmg, guestDmg);
      if (fullRuntime && options.requireGatekeeper) {
        // Consume the stapled DMG ticket as a downloaded disk image would.
        // Quarantining only the copied App omits the carrier's offline ticket.
        guestRun(options, ip, buildGuestDmgAdmissionCommand(guestDmg));
        checks.offlineDmgAdmission = { status: 'passed', network: 'host_only', quarantinePreserved: true };
      }
      const install = guestRun(options, ip, [
        "set -e",
        `test ! -e ${JSON.stringify(guestApp)}`,
        `mkdir -p /tmp/opl-studio-clean-${process.pid}/mount`,
        `hdiutil attach -nobrowse -readonly -mountpoint /tmp/opl-studio-clean-${process.pid}/mount ${JSON.stringify(guestDmg)} >/dev/null`,
        `ditto "/tmp/opl-studio-clean-${process.pid}/mount/${productName}.app" ${JSON.stringify(guestApp)}`,
        `hdiutil detach /tmp/opl-studio-clean-${process.pid}/mount >/dev/null`,
        `printf '{"version":"' && plutil -extract CFBundleShortVersionString raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} && printf '\",\"productName\":\"' && (plutil -extract CFBundleDisplayName raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} || plutil -extract CFBundleName raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} ) && printf '\",\"bundleId\":\"' && plutil -extract CFBundleIdentifier raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} && printf '\"}'`
      ].join(" && "));
      let installIdentity;
      try { installIdentity = parseInstalledIdentityOutput(install.stdout); } catch { installIdentity = null; }
      checks.install = {
        passed: installIdentity?.productName === productName && installIdentity?.bundleId === bundleId,
        version: installIdentity?.version ?? null,
        app: guestApp,
        identity: installIdentity
      };
      invariant(checks.install.passed, `installed Preview identity mismatch: ${JSON.stringify(installIdentity)}`);
      if (typeof options.verifyInstalledApp === "function") {
        checks.distribution = await options.verifyInstalledApp({
          guestRun: (command) => guestRun(options, ip, command),
          guestApp,
          identity: installIdentity
        });
      }

      if (fullRuntime) {
        const resource = `${guestApp}/Contents/Resources/opl-studio-full-runtime`;
        const manifest = `${resource}/manifest/full-package-manifest.json`;
        const frameworkRef = guestRun(options, ip, [
          "set -eu",
          `test -x ${shellQuote(`${resource}/runtime/current/bin/opl`)}`,
          `test "$(plutil -extract carrier.carrier_id raw -o - ${shellQuote(manifest)})" = opl-studio`,
          `test "$(plutil -extract carrier.runtime_resource_dir raw -o - ${shellQuote(manifest)})" = opl-studio-full-runtime`,
          `plutil -extract resolved_refs.opl_framework.resolved_commit raw -o - ${shellQuote(manifest)}`
        ].join(" && ")).stdout.trim();
        invariant(!options.frameworkRef || frameworkRef === options.frameworkRef, "Packaged Full Framework differs from the frozen source");
        checks.framework = { ...checks.framework, status: "prepared", expectedRef: frameworkRef,
          source: "packaged_full_runtime", guestInjection: null, bundleIncluded: true,
          packagedFullManifestValidated: true, archiveCopiedToGuest: false };
      } else if (options.frameworkSourceArchive) {
        scpToGuest(options, ip, options.frameworkSourceArchive, guestFrameworkArchive);
        const packagedManifest = `${guestApp}/Contents/Resources/opl-framework-bootstrap/manifest.json`;
        const packagedInstaller = `${guestApp}/Contents/Resources/opl-framework-bootstrap/opl-install.sh`;
        guestRun(options, ip, [
          "set -eu",
          `test -f ${shellQuote(packagedManifest)}`,
          `test -f ${shellQuote(packagedInstaller)}`,
          `test -f ${shellQuote(guestFrameworkArchive)}`,
          `test "$(plutil -extract framework_ref raw -o - ${shellQuote(packagedManifest)})" = ${shellQuote(options.frameworkRef)}`,
          `test "$(plutil -extract installer_sha256 raw -o - ${shellQuote(packagedManifest)})" = "$(shasum -a 256 ${shellQuote(packagedInstaller)} | awk '{print $1}')"`,
          `test "$(plutil -extract installer_size_bytes raw -o - ${shellQuote(packagedManifest)})" = "$(stat -f %z ${shellQuote(packagedInstaller)})"`,
          `test "$(shasum -a 256 ${shellQuote(guestFrameworkArchive)} | awk '{print $1}')" = ${shellQuote(checks.framework.archiveSha256)}`
        ].join(" && "));
        checks.framework = {
          ...checks.framework,
          status: "prepared",
          packagedInstallerManifestValidated: true,
          archiveCopiedToGuest: true
        };
      }

      if (externalCodex) {
        scpToGuest(options, ip, options.codexPlatformPackageTarball, guestCodexTarball);
        const expectedVersion = `codex-cli ${options.codexVersion}`;
        const verifyCodex = guestRun(options, ip, [
          "set -eu",
          `rm -rf ${shellQuote(guestCodexRoot)}`,
          `mkdir -p ${shellQuote(guestCodexRoot)}`,
          `tar -xzf ${shellQuote(guestCodexTarball)} -C ${shellQuote(guestCodexRoot)}`,
          `codex_bin=${shellQuote(guestCodexBinary)}`,
          'test -x "$codex_bin"',
          'actual_version="$($codex_bin --version)"',
          `test "$actual_version" = ${shellQuote(expectedVersion)}`,
          'printf "%s" "$actual_version"'
        ].join(" && "));
        const actualVersion = verifyCodex.stdout.trim();
        checks.codex = {
          ...checks.codex,
          status: actualVersion === expectedVersion ? "passed" : "partial",
          verifiedVersion: actualVersion,
          preparation: "scp_tarball_tar_extract_guest_temp",
          binaryExecutable: true
        };
        invariant(actualVersion === expectedVersion, `external Codex version mismatch: expected ${expectedVersion}, got ${actualVersion || "<empty>"}`);
      }

      const trust = await prepareRunnerTrustBundle(runRoot);
      if (trust) {
        scpToGuest(options, ip, trust.file, guestCaBundle);
        guestRun(options, ip, `test "$(shasum -a 256 ${shellQuote(guestCaBundle)} | awk '{print $1}')" = ${shellQuote(trust.sha256)}`);
        const { file, ...receipt } = trust;
        checks.trust = { ...receipt, guestCopyVerified: true };
      }
      let metadata;
      if (!fullRuntime && options.frameworkSourceArchive) {
        progress({ phase: "public-dependency-metadata", status: "started" });
        metadata = await preparePublicReleaseMetadata(runRoot, options.frameworkSourceArchive);
        guestRun(options, ip, `mkdir -p ${shellQuote(guestMetadataRoot)}`);
        scpToGuest(options, ip, metadata.metadataFile, `${guestMetadataRoot}/public-release-metadata.json`);
        scpToGuest(options, ip, metadata.readerFile, `${guestMetadataRoot}/public-release-metadata.mjs`);
        const shim = path.join(runRoot, "gh");
        await writeFile(shim, `#!/bin/sh\nexec node ${shellQuote(`${guestMetadataRoot}/public-release-metadata.mjs`)} "$@"\n`, { mode: 0o700 });
        scpToGuest(options, ip, shim, `${guestMetadataRoot}/gh`);
        guestRun(options, ip, `test "$(shasum -a 256 ${shellQuote(`${guestMetadataRoot}/public-release-metadata.json`)} | awk '{print $1}')" = ${shellQuote(metadata.sha256)} && chmod 755 ${shellQuote(`${guestMetadataRoot}/gh`)}`);
        const { metadataFile, readerFile, ...receipt } = metadata;
        checks.publicDependencyMetadata = { ...receipt, guestCopyVerified: true };
        progress({ phase: "public-dependency-metadata", status: "passed", endpoints: metadata.endpoints });
      }
      const launchOptions = {
        appExecutable: `${guestApp}/Contents/MacOS/${productName}`,
        logPath: guestLog,
        codexBinary: externalCodex ? guestCodexBinary : null,
        frameworkSourceArchive: !fullRuntime && options.frameworkSourceArchive ? guestFrameworkArchive : null,
        frameworkRef: fullRuntime ? null : options.frameworkRef,
        caBundle: trust ? guestCaBundle : null,
        publicMetadataBin: metadata ? guestMetadataRoot : null,
        allowActions: options.allowActions
      };
      const launch = buildGuestLaunchCommand(launchOptions);
      progress({ phase: "guest-launch", status: "started" });
      guestAppProcessId = Number(guestRun(options, ip, launch).stdout.trim());
      invariant(Number.isSafeInteger(guestAppProcessId) && guestAppProcessId > 0, "Guest App launch did not return its process ID");
      tunnel = spawn("ssh", ["-N", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-i", options.sshKey, "-L", `${options.cdpPort}:127.0.0.1:9222`, `${options.guestUser}@${ip}`], { stdio: "ignore" });
      if (fullRuntime) {
        progress({ phase: "full-offline-first-launch", status: "started" });
        await waitForPageReady({ port: options.cdpPort, timeoutMs: 120_000 });
        const protocol = await evaluatePageStable({ port: options.cdpPort, timeoutMs: 120_000,
          expression: "(async()=>{const threads=await window.oplStudio.listThreads({limit:1});return {threadListValid:Array.isArray(threads?.data),simulated:threads?.simulated===true};})()" });
        invariant(protocol?.threadListValid === true && protocol.simulated === false, "Full offline App Server handshake failed");
        const version = guestRun(options, ip, '"$HOME/Library/Application Support/OPL/runtime/current/bin/codex" --version').stdout.trim();
        invariant(!options.codexVersion || version === `codex-cli ${options.codexVersion}`, "Full offline Codex differs from its resolved release identity");
        checks.codex = { status: "passed", expectedVersion: options.codexVersion, verifiedVersion: version,
          source: "packaged_full_offline_seed", bundleIncluded: true, injectedVia: null,
          offlineFirstLaunch: { status: "passed", networkPolicy: FULL_OFFLINE_NETWORK_POLICY,
            gatewayConfigured: false, protocolCalls: ["thread/list"], generationRequested: false } };
        progress({ phase: "full-offline-first-launch", status: "passed", version });
        // Continue the existing online Gateway qualification with the same
        // installed bytes and owner state after proving the clean offline start.
        // Restart the same VM with normal networking for online acceptance.
        // Applying sandbox-exec to Electron prevents its child sandboxes from
        // initializing; isolate networking at the VM boundary instead.
        tunnel.kill('SIGTERM');
        run('tart', ['stop', options.vmName]);
        if (tartProcess.exitCode === null) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Offline Tart process did not stop')), 30_000);
            tartProcess.once('exit', () => { clearTimeout(timer); resolve(); });
          });
        }
        progress({ phase: 'start_vm_online', status: 'started', vm_name: options.vmName });
        tartProcess = spawn('tart', buildVmRunArgs(options.vmName), { stdio: ['ignore', 'ignore', 'pipe'] });
        ip = await waitForVmIp(options.vmName, { vmProcess: tartProcess });
        checks.vm.onlineRelaunch = { ip, sameInstalledDisk: true };
        // DHCP can report a retained lease before SSH is accepting connections.
        const sshDeadline = Date.now() + 60_000;
        while (guestRun(options, ip, 'true', { allowFailure: true }).status !== 0) {
          if (Date.now() >= sshDeadline) throw new Error('Online VM SSH did not become ready');
          await delay(1000);
        }
        tunnel = spawn('ssh', ['-N', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'IdentitiesOnly=yes', '-i', options.sshKey, '-L', `${options.cdpPort}:127.0.0.1:9222`, `${options.guestUser}@${ip}`], { stdio: 'ignore' });
        guestAppProcessId = Number(guestRun(options, ip, buildGuestLaunchCommand(launchOptions)).stdout.trim());
        invariant(Number.isSafeInteger(guestAppProcessId) && guestAppProcessId > 0, "Guest online relaunch did not return its process ID");
      }
    }
    progress({ phase: "page-ready", status: "started" });
    await waitForPageReady({ port: options.cdpPort, timeoutMs: 45_000 });
    progress({ phase: "page-ready", status: "passed" });
    smokeInputs = await loadPreviewSmokeInputs(options);
    const identity = options.attach
      ? (options.appPath
        ? await verifyPreviewIdentity({ appPath: options.appPath, productName: options.productName, bundleId: options.bundleId })
        : {
          status: "unavailable",
          reason: "app_path_not_provided",
          expected: { productName: options.productName, bundleId: options.bundleId },
          actual: { productName: null, bundleId: null }
        })
      : {
        status: checks.install?.passed === true ? "passed" : "partial",
        expected: { productName: options.productName, bundleId: options.bundleId },
        actual: checks.install?.identity ?? null,
        app: guestApp
      };
    const smoke = await (options.runSmoke ?? runPreviewSmoke)({
      readFirstInstallAttempt: async () => {
        if (!ip || !guestAppProcessId) return null;
        const output = guestRun(options, ip, 'cat "$HOME/Library/Application Support/OPL/state/.official-profile-first-install-attempt.json"', { allowFailure: true });
        return parseCurrentFirstInstallAttempt(output.stdout, guestAppProcessId);
      },
      evaluate: (expression, timeoutMs = phaseTimeoutMs) => evaluatePageStable({ port: options.cdpPort, expression, timeoutMs }),
      waitForReady: () => waitForPageReady({ port: options.cdpPort, timeoutMs: phaseTimeoutMs }),
      options: {
        ...options,
        captureScreenshot: options.screenshotsDir
          ? async (name) => {
            await mkdir(options.screenshotsDir, { recursive: true });
            await writeFile(path.join(options.screenshotsDir, `${name}.png`), await capturePageScreenshot({ port: options.cdpPort, timeoutMs: options.timeoutMs }));
          }
          : null
      },
      credentials: smokeInputs.credentials,
      turnRequest: smokeInputs.turnRequest,
      identity,
      progress
    });
    checks.smoke = smoke;
    progress({ phase: "smoke", status: smoke.status, phaseTimeoutMs, blockers: smoke.blockers });
    checks.startup = smoke.checks.startup;
    checks.runtime = smoke.checks.runtime;
    if (!fullRuntime && options.frameworkSourceArchive && ip) {
      const identityResult = guestRun(options, ip, "cat \"$HOME/.opl/one-person-lab/.opl-framework-installed-source-identity.json\"");
      const installedIdentity = JSON.parse(identityResult.stdout);
      const identityPassed = installedIdentity?.schema === "opl_framework_installed_source_identity.v1"
        && installedIdentity.framework_sha === options.frameworkRef
        && installedIdentity.install_mode === "archive";
      checks.framework = {
        ...checks.framework,
        status: identityPassed ? "passed" : "partial",
        installedIdentity
      };
      invariant(identityPassed, "Studio Standard Framework bootstrap did not install the exact injected Framework archive");
    }
    if (fullRuntime && checks.framework.packagedFullManifestValidated && smoke.checks.runtime?.full?.status === 'passed') {
      checks.framework.status = 'passed';
    }
    if (fullRuntime && ip && smoke.status === "passed") {
      const guestDriver = `/tmp/opl-framework-temporal-driver-${process.pid}.mjs`;
      const localDriver = path.join(runRoot, "temporal-driver.mjs");
      const runtime = `${guestApp}/Contents/Resources/opl-studio-full-runtime/runtime/current`;
      await writeFile(localDriver, `${collectTemporalServiceSupervisorProof.toString()}\nprocess.stdout.write(JSON.stringify(await collectTemporalServiceSupervisorProof({runtime:${JSON.stringify(runtime)}})));\n`);
      scpToGuest(options, ip, localDriver, guestDriver);
      progress({ phase: "full-temporal-lifecycle", status: "started" });
      const result = guestRun(options, ip, `${shellQuote(runtime + "/node/bin/node")} ${shellQuote(guestDriver)}`);
      checks.temporal_service_supervisor_proof = JSON.parse(result.stdout);
      invariant(checks.temporal_service_supervisor_proof.status === "passed", "Full Temporal lifecycle did not pass");
      progress({ phase: "full-temporal-lifecycle", status: "passed" });
    }
    checks.gateway = smoke.checks.gateway;
    checks.update = {
      status: await evaluatePage({ port: options.cdpPort, expression: "window.oplStudio.readNativeAppUpdateStatus()", timeoutMs: options.timeoutMs }),
      publicFeedChecked: false,
      reason: "clean_vm_harness_does_not_mutate_or_require_public_release"
    };
  } catch (error) {
    progress({ phase: "clean-vm", status: "failed", error: redactSecrets(error instanceof Error ? error.message : String(error), [smokeInputs?.credentials?.email, smokeInputs?.credentials?.password].filter(Boolean)) });
    const secretValues = [smokeInputs?.credentials?.email, smokeInputs?.credentials?.password, smokeInputs?.turnRequest?.prompt].filter(Boolean);
    checks.failure = { detail: redactSecrets(error instanceof Error ? error.message : String(error), secretValues) };
    if (ip) checks.guestLog = redactSecrets(guestRun(options, ip, `tail -120 ${guestLog}`, { allowFailure: true }).stdout, secretValues);
  } finally {
    if (ip && (checks.failure || checks.smoke?.status !== "passed")) {
      const secretValues = [smokeInputs?.credentials?.email, smokeInputs?.credentials?.password, smokeInputs?.turnRequest?.prompt].filter(Boolean);
      try {
        checks.guestLog = redactSecrets(guestRun(options, ip, `tail -120 ${shellQuote(guestLog)}`, { allowFailure: true }).stdout, secretValues);
        const attempt = guestRun(options, ip, 'cat "$HOME/Library/Application Support/OPL/state/.official-profile-first-install-attempt.json"', { allowFailure: true });
        if (attempt.stdout.trim()) checks.officialProfileAttempt = JSON.parse(redactSecrets(attempt.stdout, secretValues));
      } catch {
        checks.officialProfileDiagnosticsUnavailable = true;
      }
    }
    if (tunnel && tunnel.exitCode === null) tunnel.kill("SIGTERM");
    if (!options.keepVm && tartProcess && tartProcess.exitCode === null) tartProcess.kill("SIGTERM");
    if (!options.attach && !options.keepVm) run("tart", ["stop", options.vmName], { allowFailure: true });
    if (!options.attach && !options.keepVm) run("tart", ["delete", options.vmName], { allowFailure: true });
    await rm(runRoot, { recursive: true, force: true });
  }
  const frameworkPassed = !options.frameworkSourceArchive || checks.framework?.status === "passed";
  const status = checks.failure ? "partial" : checks.smoke?.status === "passed" && frameworkPassed ? "passed" : "partial";
  const receipt = {
    schema: "opl_studio_macos_clean_vm_qualification.v1",
    status,
    candidate: "opl-studio",
    carrier: options.carrier,
    package: { dmg: options.dmg, bundleIdentifier: bundleId, productName },
    checks,
    phaseTimeoutMs,
    progressEvents,
    cleanVmReady: false,
    releaseReady: false,
    activeShellAdopted: false,
    blockers: [
      ...(checks.failure ? ["clean_vm_execution_incomplete"] : []),
      ...(checks.smoke?.blockers ?? []),
      "App_owner_clean_VM_release_admission_is_separate_from_Studio_candidate_qualification"
    ]
  };
  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const receipt = await qualifyCleanVm(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status !== "passed") process.exitCode = 2;
}

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const COMPLETE_MARKER = ".official-profile-first-install-complete";
const ATTEMPT_MARKER = ".official-profile-first-install-attempt.json";
const INTENT_MARKER = ".official-profile-first-install-intent.json";
const inFlight = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function invariant(condition, message) { if (!condition) throw new Error(message); }
function exists(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function regular(file) { const info = fs.lstatSync(file); invariant(info.isFile() && !info.isSymbolicLink(), `Official Profile resource or receipt is not a regular file: ${path.basename(file)}`); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function privateJson(file, value, flag = "wx") { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag }); }
function safeMessage(error, env, { maxLines = 1, maxLength = 1024 } = {}) {
  let message = error instanceof Error ? error.message : String(error);
  for (const [key, value] of Object.entries(env)) if (/token|secret|password|credential|api.?key|cookie/i.test(key) && typeof value === "string" && value.length >= 4) message = message.replaceAll(value, "[REDACTED]");
  return message.replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[REDACTED]").replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, "[REDACTED_URL]").split(/\r?\n/).slice(0, maxLines).join("\n").slice(0, maxLength);
}

export { safeMessage as safeDesktopErrorMessage };

function frameworkCoreReady(result) {
  const exitCode = result?.readback?.exitCode ?? result?.readback?.status;
  return exitCode === 0;
}

export function officialProfileStateDirectory({ homeDir = os.homedir(), env = process.env } = {}) {
  if (env.OPL_STATE_DIR?.trim()) return path.resolve(env.OPL_STATE_DIR);
  const data = env.OPL_DATA_DIR?.trim();
  return data ? path.join(path.resolve(data), "opl", "state") : path.join(homeDir, "Library", "Application Support", "OPL", "state");
}

/** Capture before bootstrap creates owner state. Existing users never become first installs. */
export function captureOfficialProfileAdmission({ homeDir = os.homedir(), env = process.env, persistIntent = true } = {}) {
  const stateDir = officialProfileStateDirectory({ homeDir, env });
  const completePath = path.join(stateDir, COMPLETE_MARKER);
  const attemptPath = path.join(stateDir, ATTEMPT_MARKER);
  const intentPath = path.join(stateDir, INTENT_MARKER);
  const existingRuntime = Boolean(env.OPL_APP_OPL_BIN || env.OPL_COMMAND || env.OPL_FRAMEWORK_PACKAGE_ROOT)
    || [
      path.join(homeDir, ".opl", "one-person-lab"),
      path.join(homeDir, "Library", "Application Support", "OPL", "runtime", "current"),
      path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime", "current")
    ].some(exists);
  let reason = null;
  if (exists(completePath)) { regular(completePath); reason = "first_install_already_completed"; }
  else if (exists(attemptPath)) { regular(attemptPath); reason = "previous_attempt_requires_explicit_retry"; }
  else if (exists(intentPath)) {
    regular(intentPath);
    const intent = JSON.parse(fs.readFileSync(intentPath, "utf8"));
    invariant(intent.schema === "opl_studio_official_profile_first_install_intent.v1" && intent.intent === "first_install", "Official Profile pending first-install intent is invalid");
  }
  else if (existingRuntime || exists(stateDir)) reason = "existing_owner_runtime_or_preferences_preserved";
  if (reason === null && persistIntent && !exists(intentPath)) {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    try { privateJson(intentPath, { schema: "opl_studio_official_profile_first_install_intent.v1", intent: "first_install", captured_before_runtime_bootstrap: true, recorded_at: new Date().toISOString() }); }
    catch (error) { if (error.code !== "EEXIST") throw error; regular(intentPath); }
  }
  return Object.freeze({ schema: "opl_studio_official_profile_admission.v1", eligible: reason === null, reason, stateDir, completePath, attemptPath, intentPath, capturedAt: new Date().toISOString() });
}

/** Migrate a valid pre-bootstrap intent captured at the default home path into a later OPL_DATA_DIR target. */
export function syncPreBootstrapOfficialProfileIntent({ preBootstrapHomeDir = os.homedir(), env = process.env } = {}) {
  const targetStateDir = officialProfileStateDirectory({ homeDir: preBootstrapHomeDir, env });
  const preBootstrapStateDir = officialProfileStateDirectory({ homeDir: preBootstrapHomeDir, env: {} });
  if (path.resolve(targetStateDir) === path.resolve(preBootstrapStateDir)) return false;
  if ([COMPLETE_MARKER, ATTEMPT_MARKER, INTENT_MARKER].some((marker) => exists(path.join(targetStateDir, marker)))) return false;
  const sourceIntentPath = path.join(preBootstrapStateDir, INTENT_MARKER);
  if (!exists(sourceIntentPath)) return false;
  regular(sourceIntentPath);
  const parsed = JSON.parse(fs.readFileSync(sourceIntentPath, "utf8"));
  invariant(parsed.schema === "opl_studio_official_profile_first_install_intent.v1" && parsed.intent === "first_install", "Official Profile pending first-install intent is invalid");
  fs.mkdirSync(targetStateDir, { recursive: true, mode: 0o700 });
  const targetIntentPath = path.join(targetStateDir, INTENT_MARKER);
  try {
    privateJson(targetIntentPath, parsed);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return false;
  }
}

export function readOfficialProfileResources(resourcesPath) {
  const root = path.join(resourcesPath, "opl-official-profile");
  const manifestPath = path.join(root, "manifest.json");
  const helperPath = path.join(root, "official-profile-package-apply.ts");
  const profilePath = path.join(root, "app-product-profile.json");
  for (const file of [manifestPath, helperPath, profilePath]) regular(file);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  invariant(manifest.schema === "opl_app_official_profile_resources.v1" && manifest.authority === "one-person-lab-app", "Official Profile resources have no App-owned identity");
  const helperBytes = fs.readFileSync(helperPath);
  const profileBytes = fs.readFileSync(profilePath);
  invariant(manifest.helper_sha256 === digest(helperBytes) && manifest.profile_sha256 === digest(profileBytes), "Official Profile resource digest mismatch");
  const profile = JSON.parse(profileBytes).official_profile;
  invariant(profile?.authority === "one-person-lab-app" && profile.apply_on?.includes("first_install") && profile.never_apply_on?.includes("app_update"), "Official Profile first-install policy is invalid");
  const roots = profile.desired_root_package_ids;
  invariant(Array.isArray(roots) && roots.length > 0 && roots.every((id) => typeof id === "string" && /^[a-z0-9][a-z0-9_.-]*$/.test(id)) && new Set(roots).size === roots.length, "Official Profile roots are invalid");
  return { helperPath, rootPackageIds: roots, restoreAllowed: profile.apply_on.includes("explicit_restore"), profileSha256: manifest.profile_sha256, helperSha256: manifest.helper_sha256 };
}

export function buildOfficialProfileCommand({ resources, env = process.env, nodeCommand = "node", timeoutMs = 900_000 }) {
  const opl = env.OPL_APP_OPL_BIN || env.OPL_COMMAND || "opl";
  invariant(typeof opl === "string" && opl.trim(), "Framework executable is required");
  return { command: nodeCommand, args: ["--experimental-strip-types", resources.helperPath, "--intent", "first_install", "--opl-bin", opl, ...resources.rootPackageIds.flatMap((id) => ["--root-package-id", id])], env, timeoutMs };
}

/** Explicit restoration uses App intent and the same Framework-projected actions as first install. */
export async function restoreOfficialProfile({ resourcesPath, env = process.env, dryRun = true, execute = executeHelper, nodeCommand = "node" }) {
  const resources = readOfficialProfileResources(resourcesPath);
  invariant(resources.restoreAllowed, "Official Profile does not allow explicit restoration");
  const stateDir = officialProfileStateDirectory({ env });
  invariant(!inFlight.has(path.join(stateDir, ATTEMPT_MARKER)), "Official Profile installation is still running; wait for it to finish");
  const key = path.join(stateDir, "official-profile-explicit-restore");
  invariant(!inFlight.has(key), "Official Profile restoration is already running");
  const spec = buildOfficialProfileCommand({ resources, env, nodeCommand });
  spec.args[spec.args.indexOf("first_install")] = "explicit_restore";
  if (dryRun) spec.args.push("--dry-run");
  const task = (async () => {
    const result = await execute(spec);
    invariant(!result.timedOut, "Official Profile restoration timed out; inspect the current package status before retrying");
    let raw;
    try { raw = JSON.parse(result.stdout).official_profile_package_apply; } catch {}
    invariant(raw?.surface_kind === "opl_app_official_profile_package_apply.v1" && raw.intent === "explicit_restore" && raw.dry_run === dryRun, "Official Profile restore did not return the requested receipt");
    invariant(JSON.stringify(raw.root_package_ids) === JSON.stringify(resources.rootPackageIds), "Official Profile restore returned different roots");
    const items = Array.isArray(raw.items) ? raw.items : [];
    invariant(items.length === resources.rootPackageIds.length && items.every((item, index) => item.package_id === resources.rootPackageIds[index]), "Official Profile restore returned incomplete Package results");
    const passed = result.status === 0 && raw.status === (dryRun ? "validated" : "completed")
      && items.every(item => (dryRun ? ["validated", "already_present"] : ["installed", "reconciled", "already_present"]).includes(item.status));
    return { status: passed ? (dryRun ? "validated" : "completed") : "failed", intent: "explicit_restore", dry_run: dryRun,
      root_package_ids: resources.rootPackageIds, package_results: items.map(item => ({ package_id: item.package_id, status: item.status,
        ...(item.error ? { error: { message: safeMessage(item.error.message ?? "Package restoration failed", env) } } : {}) })),
      automatic_reapply_allowed: false };
  })();
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}

function executeHelper(spec) {
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { env: spec.env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let overflow = false;
    let timedOut = false;
    const terminate = () => { try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 8 * 1024 * 1024) { overflow = true; terminate(); } });
    // Only the App-owned bounded progress envelope may reach the renderer.
    let pending = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop().slice(-64_000);
      for (const line of lines) {
        if (!line.startsWith('OPL_PROFILE_PROGRESS ')) continue;
        try {
          const event = JSON.parse(line.slice(21));
          if (event.schema === 'opl_official_profile_install_progress.v1'
            && spec.rootPackageIds.includes(event.package_id) && ['installing', 'ready', 'attention'].includes(event.status)) {
            spec.onProgress?.({ stage: 'preparing_packages', status: 'running', packageId: event.package_id,
              packageStatus: event.status, rootPackageIds: spec.rootPackageIds,
              packageResults: Array.isArray(event.package_results) ? event.package_results.filter(item => spec.rootPackageIds.includes(item.package_id)).map(item => ({ package_id: item.package_id, status: item.status })) : [] });
          }
        } catch { /* Other stderr is never renderer content. */ }
      }
    });
    const timer = setTimeout(() => { timedOut = true; terminate(); }, spec.timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); resolve({ status: -1, errorCode: error.code ?? "helper_spawn_failed", stdout: "", timedOut: false }); });
    child.once("close", (status) => { clearTimeout(timer); resolve({ status, stdout: overflow ? "" : stdout, timedOut, errorCode: overflow ? "helper_output_too_large" : null }); });
  });
}

export function summarizeOfficialProfileResult(result, resources, env = process.env) {
  let raw;
  try { raw = JSON.parse(result.stdout).official_profile_package_apply; } catch {}
  invariant(!result.timedOut, "Official Profile owner actions timed out; explicit retry is required");
  invariant(raw?.surface_kind === "opl_app_official_profile_package_apply.v1" && raw.intent === "first_install" && raw.dry_run === false, "Official Profile helper did not return an execution receipt");
  invariant(JSON.stringify(raw.root_package_ids) === JSON.stringify(resources.rootPackageIds), "Official Profile helper receipt targets different roots");
  const items = Array.isArray(raw.items) ? raw.items : [];
  invariant(items.length === resources.rootPackageIds.length && items.every((item, index) => item.package_id === resources.rootPackageIds[index]), "Official Profile helper receipt has missing or reordered Package results");
  const failed = items.filter((item) => item.status === "failed");
  const passed = result.status === 0 && raw.status === "completed" && failed.length === 0 && items.every((item) => ["already_present", "reconciled", "installed"].includes(item.status));
  return {
    schema: "opl_official_profile_first_install_terminal.v1", status: passed ? "completed" : "failed", intent: "first_install",
    app_process_id: process.pid, recorded_at: new Date().toISOString(), profile_sha256: resources.profileSha256, helper_sha256: resources.helperSha256,
    root_package_ids: resources.rootPackageIds, package_results: items.map((item) => ({ package_id: item.package_id, status: item.status, changed: item.changed === true, ...(item.status === "failed" ? { error: { code: typeof item.error?.code === "string" ? item.error.code.slice(0, 128) : "package_apply_failed", message: safeMessage(item.error?.message ?? "Package application failed", env) } } : {}) })),
    owner: "one-person-lab-app", package_lifecycle_authority: false, automatic_reapply_allowed: false
  };
}

export function startOfficialProfileFirstInstall({ admission, resourcesPath, env = process.env, readInitialize, execute = executeHelper, nodeCommand = "node", timeoutMs = 900_000, readinessTimeoutMs = 120_000, logEvent = () => {}, onProgress = () => {}, explicitRetry = false } = {}) {
  invariant(admission?.schema === "opl_studio_official_profile_admission.v1", "Capture Official Profile admission before runtime bootstrap");
  invariant(typeof readInitialize === "function", "Framework initialize readback is required");
  if (exists(admission.completePath)) { regular(admission.completePath); return Promise.resolve({ status: "skipped", reason: "first_install_already_completed" }); }
  if (!admission.eligible && !(explicitRetry && admission.reason === "previous_attempt_requires_explicit_retry")) {
    if (admission.reason === 'previous_attempt_requires_explicit_retry') {
      regular(admission.attemptPath);
      const previous = JSON.parse(fs.readFileSync(admission.attemptPath, 'utf8'));
      onProgress({ stage: 'preparing_packages', status: previous.status === 'failed' ? 'failed' : 'unconfirmed' });
    }
    return Promise.resolve({ status: 'skipped', reason: admission.reason });
  }
  if (inFlight.has(admission.attemptPath)) return inFlight.get(admission.attemptPath);
  const task = (async () => {
    let ownsAttempt = false;
    try {
      // Onboarding may legitimately need user login or workspace selection.
      // A readiness read cannot claim the one-shot package apply attempt.
      const deadline = Date.now() + readinessTimeoutMs;
      let ready = false;
      do {
        const result = await readInitialize();
        if (frameworkCoreReady(result)) { ready = true; break; }
        if (readinessTimeoutMs <= 0 || Date.now() >= deadline) break;
        await delay(Math.min(1000, Math.max(0, deadline - Date.now())));
      } while (Date.now() < deadline);
      if (!ready) return { status: "deferred", reason: "framework_core_not_ready", packageActionsStarted: false };
      const resources = readOfficialProfileResources(resourcesPath);
      fs.mkdirSync(admission.stateDir, { recursive: true, mode: 0o700 });
      if (explicitRetry && exists(admission.attemptPath)) {
        regular(admission.attemptPath);
        const previous = JSON.parse(fs.readFileSync(admission.attemptPath, "utf8"));
        invariant(previous.status === "failed", "An incomplete or running first-install attempt requires reconciliation before retry");
        fs.renameSync(admission.attemptPath, `${admission.attemptPath}.previous-${Date.now()}`);
      }
      try { privateJson(admission.attemptPath, { schema: "opl_official_profile_first_install_terminal.v1", status: "running", intent: "first_install", app_process_id: process.pid, recorded_at: new Date().toISOString() }); ownsAttempt = true; }
      catch (error) { if (error.code === "EEXIST") return { status: "skipped", reason: "first_install_attempt_already_owned" }; throw error; }
      onProgress({ stage: 'preparing_packages', status: 'running', rootPackageIds: resources.rootPackageIds, packageResults: [] });
      const result = await execute({ ...buildOfficialProfileCommand({ resources, env, nodeCommand, timeoutMs }), rootPackageIds: resources.rootPackageIds, onProgress });
      const receipt = summarizeOfficialProfileResult(result, resources, env);
      privateJson(admission.attemptPath, receipt, "w");
      if (receipt.status === "completed") {
        try { privateJson(admission.completePath, receipt); }
        catch (error) { if (error.code !== "EEXIST") throw error; regular(admission.completePath); }
      }
      onProgress({ stage: 'preparing_packages', status: receipt.status, rootPackageIds: receipt.root_package_ids, packageResults: receipt.package_results ?? [] });
      logEvent(receipt);
      return receipt;
    } catch (error) {
      const receipt = { schema: "opl_official_profile_first_install_terminal.v1", status: "failed", intent: "first_install", app_process_id: process.pid, recorded_at: new Date().toISOString(), error: { message: safeMessage(error, env) }, automatic_reapply_allowed: false, package_lifecycle_authority: false };
      if (ownsAttempt) privateJson(admission.attemptPath, receipt, "w");
      if (ownsAttempt) onProgress({ stage: 'preparing_packages', status: 'failed' });
      logEvent(receipt);
      return receipt;
    }
  })();
  inFlight.set(admission.attemptPath, task);
  task.finally(() => { if (inFlight.get(admission.attemptPath) === task) inFlight.delete(admission.attemptPath); }).catch(() => {});
  return task;
}

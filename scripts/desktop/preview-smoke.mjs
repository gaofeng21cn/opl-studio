import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluatePage, waitForPageReady } from "./cdp.mjs";

export const PREVIEW_PRODUCT = Object.freeze({
  productName: "One Person Lab Preview",
  bundleId: "cn.onepersonlab.opl.studio.preview"
});

const DEFAULT_RUNTIME_PROFILES = ["standard", "full"];
const DEFAULT_TIMEOUT_MS = 45_000;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRuntimeProfile(value) {
  if (value === "standard" || value === "fast") return "standard";
  if (value === "full") return "full";
  throw new Error(`unsupported runtime profile: ${value}`);
}

function profileBridgeValue(profile) {
  return profile === "standard" ? "fast" : "full";
}

export function redactSecrets(value, secretValues = []) {
  let text = String(value ?? "");
  for (const secret of secretValues) {
    if (typeof secret === "string" && secret.length > 0) text = text.split(secret).join("[REDACTED]");
  }
  return text;
}

export function sanitizeError(error, secretValues = []) {
  return redactSecrets(error instanceof Error ? error.message : String(error), secretValues);
}

function readSecretValue(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} is required`);
  return value;
}

function validateCredentials(value) {
  invariant(isRecord(value), "Gateway credentials file must contain a JSON object");
  const email = typeof value.email === "string" ? value.email.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  invariant(email, "Gateway credentials email is required");
  invariant(password, "Gateway credentials password is required");
  return { email, password };
}

function validateTurn(value) {
  if (typeof value === "string") return { prompt: readSecretValue(value, "Codex turn prompt") };
  invariant(isRecord(value), "Codex turn hook file must contain a JSON object");
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  invariant(prompt, "Codex turn prompt is required");
  const request = { prompt };
  for (const field of ["cwd", "model", "reasoningEffort"]) {
    if (typeof value[field] === "string" && value[field].trim()) request[field] = value[field].trim();
  }
  if (typeof value.permissions === "string" && value.permissions.trim()) request.permissions = value.permissions.trim();
  return request;
}

export function parseRuntimeProfiles(value) {
  const entries = Array.isArray(value) ? value : String(value ?? "").split(",");
  const profiles = entries
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .map(normalizeRuntimeProfile);
  return [...new Set(profiles)];
}

export function parsePreviewSmokeArgs(argv, { env = process.env } = {}) {
  const options = {
    carrier: env.OPL_STUDIO_SMOKE_CARRIER?.trim() || "electron_desktop",
    productName: env.OPL_STUDIO_PREVIEW_PRODUCT_NAME?.trim() || PREVIEW_PRODUCT.productName,
    bundleId: env.OPL_STUDIO_PREVIEW_BUNDLE_ID?.trim() || PREVIEW_PRODUCT.bundleId,
    cdpPort: Number(env.OPL_STUDIO_CDP_PORT || "9222"),
    runtimeProfiles: parseRuntimeProfiles(env.OPL_STUDIO_RUNTIME_PROFILES || DEFAULT_RUNTIME_PROFILES),
    gatewayCredentialsFile: env.OPL_STUDIO_GATEWAY_CREDENTIALS_FILE?.trim() || null,
    codexTurnHookFile: env.OPL_STUDIO_CODEX_TURN_HOOK_FILE?.trim() || null,
    codexTurnPrompt: env.OPL_STUDIO_CODEX_TURN_PROMPT || null,
    timeoutMs: Number(env.OPL_STUDIO_SMOKE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS)),
    outPath: env.OPL_STUDIO_SMOKE_OUT?.trim() || null,
    appPath: env.OPL_STUDIO_APP_PATH?.trim() || null,
    requireGatewaySetup: env.OPL_STUDIO_REQUIRE_GATEWAY_SETUP === "1",
    requireCodexTurn: env.OPL_STUDIO_REQUIRE_CODEX_TURN === "1"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--require-gateway-setup") { options.requireGatewaySetup = true; continue; }
    if (arg === "--require-codex-turn") { options.requireCodexTurn = true; continue; }
    const value = argv[++index];
    invariant(value, `missing value for ${arg}`);
    if (arg === "--carrier") options.carrier = value;
    else if (arg === "--product-name") options.productName = value;
    else if (arg === "--bundle-id") options.bundleId = value;
    else if (arg === "--cdp-port") options.cdpPort = Number(value);
    else if (arg === "--runtime-profiles") options.runtimeProfiles = parseRuntimeProfiles(value);
    else if (arg === "--gateway-credentials-file") options.gatewayCredentialsFile = path.resolve(value);
    else if (arg === "--codex-turn-hook-file") options.codexTurnHookFile = path.resolve(value);
    else if (arg === "--codex-turn-prompt") options.codexTurnPrompt = value;
    else if (arg === "--timeout-ms") options.timeoutMs = Number(value);
    else if (arg === "--out") options.outPath = path.resolve(value);
    else if (arg === "--app-path") options.appPath = path.resolve(value);
    else throw new Error(`unsupported argument: ${arg}`);
  }
  invariant(options.carrier.trim(), "carrier is required");
  invariant(options.productName.trim(), "product name is required");
  invariant(options.bundleId.trim(), "bundle id is required");
  invariant(Number.isInteger(options.cdpPort) && options.cdpPort > 1024, "CDP port must be a valid host port");
  invariant(Number.isFinite(options.timeoutMs) && options.timeoutMs > 0, "smoke timeout must be positive");
  invariant(options.runtimeProfiles.length > 0, "at least one runtime profile is required");
  return options;
}

export async function readGatewayCredentials({ file, env = process.env } = {}) {
  const filePath = file?.trim();
  if (filePath) return validateCredentials(JSON.parse(await readFile(filePath, "utf8")));
  const email = env.OPL_STUDIO_GATEWAY_EMAIL;
  const password = env.OPL_STUDIO_GATEWAY_PASSWORD;
  if (email !== undefined || password !== undefined) return validateCredentials({ email, password });
  return null;
}

export async function readCodexTurnHook({ file, prompt, env = process.env } = {}) {
  const filePath = file?.trim();
  if (filePath) return validateTurn(JSON.parse(await readFile(filePath, "utf8")));
  const value = prompt ?? env.OPL_STUDIO_CODEX_TURN_PROMPT;
  return value ? validateTurn(value) : null;
}

function gatewayProjection(state) {
  const outer = state?.app_state ?? state;
  const root = outer?.app_state ?? outer;
  return root?.settings_control_center?.app_settings_read_model?.opl_gateway_account ?? null;
}

export function sanitizeGatewayProjection(state) {
  const projection = gatewayProjection(state);
  if (!isRecord(projection)) return null;
  return {
    surfaceKind: projection.surface_kind ?? null,
    status: projection.status ?? null,
    connectionMode: projection.connection_mode ?? null,
    accountCardVisible: projection.account_card_visible === true,
    accountStatus: projection.account?.status ?? null,
    managedKeyStatus: projection.managed_key?.status ?? null,
    freshnessStale: projection.freshness?.stale === true
  };
}

function readbackSummary(state, secretValues) {
  const readback = state?.readback ?? {};
  const stderr = typeof readback.stderr === "string" ? redactSecrets(readback.stderr.slice(0, 2_000), secretValues) : "";
  return {
    profile: state?.profile ?? null,
    exitCode: readback.exitCode ?? readback.status ?? null,
    timedOut: readback.timedOut === true,
    stderr,
    readbackStderr: stderr
  };
}

async function runUiInteractions({ evaluate, timeoutMs }) {
  return evaluate(`(async()=>{
    const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
    const click=(selector)=>{const node=document.querySelector(selector); if(!node) return false; node.click(); return true;};
    const clickButton=(label)=>{const node=[...document.querySelectorAll("button")].find((button)=>button.innerText.trim()===label || button.getAttribute("aria-label")===label); if(!node) return false; node.click(); return true;};
    const waitFor=(selector,ms=${timeoutMs})=>new Promise((resolve)=>{const deadline=Date.now()+ms; const tick=()=>{if(document.querySelector(selector)) return resolve(true); if(Date.now()>=deadline) return resolve(false); setTimeout(tick,100);}; tick();});
    const result={
      root:!!document.getElementById("root"),
      studioRoot:!!document.querySelector('[data-testid="opl-studio-root"]'),
      startupReadiness:!!document.querySelector('[data-testid="opl-startup-readiness"]'),
      sessionHeader:!!document.querySelector('[data-testid="opl-session-header"]'),
      composerRunState:!!document.querySelector('[data-testid="opl-composer-run-state"]'),
      settings:{opened:false,panel:false,account:false,about:false},
      runtime:{opened:false,panel:false},
      inspector:{opened:false,tabs:false,closed:false},
    };
    result.settings.opened=clickButton("设置")||clickButton("Settings");
    if(result.settings.opened){
      result.settings.panel=await waitFor('[data-testid="opl-settings-panel"]');
      const accountClicked=clickButton("账户与模型")||clickButton("Account & Models");
      result.settings.account=accountClicked && await waitFor('[data-testid="opl-settings-panel"] [data-section="account"]');
      const preferencesClicked=clickButton("偏好")||clickButton("Preferences");
      if(preferencesClicked) await waitFor('[data-testid="opl-settings-panel"] [data-section="preferences"]');
      const aboutClicked=clickButton("关于")||clickButton("About");
      result.settings.about=aboutClicked && await waitFor('[data-testid="settings-page-about"]');
    }
    const closeSettings=[...document.querySelectorAll("button")].find((button)=>button.innerText.trim()==="关闭"||button.innerText.trim()==="Close"||button.getAttribute("aria-label")==="关闭"||button.getAttribute("aria-label")==="Close");
    closeSettings?.click();
    await sleep(100);
    const runtimeButton=[...document.querySelectorAll("button")].find((button)=>button.getAttribute("aria-label")==="运行状态"||button.getAttribute("aria-label")==="Run status"||button.innerText.trim()==="运行状态"||button.innerText.trim()==="Run status");
    runtimeButton?.click();
    result.runtime.opened=!!runtimeButton;
    result.runtime.panel=await waitFor('[data-testid="opl-runtime-overview-page"]',Math.min(${timeoutMs},5000));
    const chatButton=clickButton("新建任务")||clickButton("New task")||clickButton("新建会话")||clickButton("New session");
    result.runtime.returnedToConversation=chatButton && await waitFor('[data-testid="opl-context-inspector-trigger"]');
    result.inspector.opened=click('[data-testid="opl-context-inspector-trigger"]');
    if(result.inspector.opened){
      result.inspector.tabs=await waitFor('[data-testid="opl-context-inspector"] [data-testid="opl-context-tabs"]');
      const tab=document.querySelector('[data-testid="opl-context-tabs"] button');
      tab?.click();
      const close=document.querySelector('[data-testid="opl-context-inspector"] button[aria-label="关闭详情"], [data-testid="opl-context-inspector"] button[aria-label="Close details"]');
      close?.click();
      await sleep(100);
      result.inspector.closed=!document.querySelector('[data-testid="opl-context-inspector"]');
    }
    return result;
  })()`);
}

async function waitForGatewayState({ evaluate, timeoutMs }) {
  return evaluate(`(async()=>{const deadline=Date.now()+${timeoutMs}; let state=null; let projection=null; while(Date.now()<deadline){state=await window.oplStudio.readState("fast"); const p=${gatewayProjection.toString()}(state); projection=p?{surfaceKind:p.surface_kind??null,status:p.status??null,connectionMode:p.connection_mode??null,accountCardVisible:p.account_card_visible===true,accountStatus:p.account?.status??null,managedKeyStatus:p.managed_key?.status??null,freshnessStale:p.freshness?.stale===true}:null; if(projection?.surfaceKind==="opl_gateway_account_read_model.v1"&&projection.connectionMode==="account"&&projection.status==="connected"&&projection.accountStatus==="active"&&projection.managedKeyStatus==="active"&&projection.freshnessStale!==true) return {state,projection}; await new Promise((resolve)=>setTimeout(resolve,500));} return {state,projection};})()`);
}

async function runGatewayHook({ evaluate, credentials, timeoutMs }) {
  if (!credentials) return { status: "skipped", reason: "credentials_not_provided" };
  const result = await evaluate(`(async()=>{const response=await window.oplStudio.loginGatewayAccount(${JSON.stringify(credentials)}); return {ok:response?.ok===true,stateRefreshRequired:response?.stateRefreshRequired===true,errorCode:response?.ok===true?null:(response?.errorCode||"gateway_account_failed")};})()`);
  const readback = result?.ok === true ? await waitForGatewayState({ evaluate, timeoutMs }) : null;
  const projection = readback?.projection;
  const passed = Boolean(
    result?.ok === true
    && projection?.surfaceKind === "opl_gateway_account_read_model.v1"
    && projection?.connectionMode === "account"
    && projection?.status === "connected"
    && projection?.accountStatus === "active"
    && projection?.managedKeyStatus === "active"
    && projection?.freshnessStale !== true
  );
  return {
    status: passed ? "passed" : "partial",
    ok: result?.ok === true,
    stateRefreshRequired: result?.stateRefreshRequired === true,
    errorCode: result?.errorCode ?? null,
    projection: projection ?? sanitizeGatewayProjection(readback?.state),
    credentialsProvided: true
  };
}

async function runCodexTurnHook({ evaluate, request }) {
  if (!request) return { status: "skipped", reason: "turn_hook_not_provided" };
  const result = await evaluate(`(async()=>{const reply=await window.oplStudio.sendMessage(${JSON.stringify(request)}); return {threadId:typeof reply?.threadId==="string"?reply.threadId:null,turnId:typeof reply?.turnId==="string"?reply.turnId:null,completed:reply?.completed?.turn?.status||null,finalMessagePresent:typeof reply?.finalMessage==="string"&&reply.finalMessage.length>0,simulated:reply?.simulated===true};})()`);
  const passed = Boolean(
    result?.threadId
    && result?.turnId
    && result?.completed === "completed"
    && result?.finalMessagePresent === true
    && result?.simulated !== true
  );
  return {
    status: passed ? "passed" : "partial",
    threadId: result?.threadId ?? null,
    turnId: result?.turnId ?? null,
    completed: result?.completed ?? null,
    finalMessagePresent: result?.finalMessagePresent === true,
    simulated: result?.simulated === true
  };
}

export async function runPreviewSmoke({
  evaluate,
  waitForReady,
  options = {},
  credentials = null,
  turnRequest = null,
  identity = null
} = {}) {
  invariant(typeof evaluate === "function", "preview smoke requires an evaluate function");
  const smokeOptions = {
    carrier: options.carrier || "unknown",
    productName: options.productName || PREVIEW_PRODUCT.productName,
    bundleId: options.bundleId || PREVIEW_PRODUCT.bundleId,
    runtimeProfiles: options.runtimeProfiles?.length ? options.runtimeProfiles : DEFAULT_RUNTIME_PROFILES,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    requireGatewaySetup: options.requireGatewaySetup === true,
    requireCodexTurn: options.requireCodexTurn === true
  };
  const secretValues = [credentials?.email, credentials?.password, turnRequest?.prompt].filter(Boolean);
  const checks = { identity: identity ?? { status: "unavailable", reason: "carrier_did_not_supply_identity" } };
  try {
    const ready = typeof waitForReady === "function" ? await waitForReady() : await evaluate("({readyState:document.readyState,root:!!document.getElementById('root'),bridge:!!window.oplStudio})");
    checks.startup = {
      status: ready?.readyState === "complete" && ready?.root === true && ready?.bridge === true ? "passed" : "partial",
      readyState: ready?.readyState ?? null,
      root: ready?.root === true,
      bridge: ready?.bridge === true
    };
    const initial = await evaluate(`(async()=>{const state=await window.oplStudio.readState("fast"); const startupErrors=(document.body?.innerText||"").split(/\\n+/).map((line)=>line.trim()).filter((line)=>/无法连接|AppServerTransportError|spawn (?:codex|opl) ENOENT|Error invoking remote method/.test(line)).slice(0,8); return {state,bridgeKeys:Object.keys(window.oplStudio).sort(),startupErrors};})()`);
    checks.startup.appServerErrors = Array.isArray(initial?.startupErrors)
      ? initial.startupErrors.map((error) => redactSecrets(error, secretValues))
      : [];
    checks.bridge = {
      status: initial?.bridgeKeys?.includes("readState") && initial?.bridgeKeys?.includes("sendMessage") ? "passed" : "partial",
      methods: Array.isArray(initial?.bridgeKeys) ? initial.bridgeKeys.filter((key) => ["readState", "sendMessage", "loginGatewayAccount", "readNativeAppUpdateStatus"].includes(key)) : []
    };
    checks.runtime = {};
    for (const profile of smokeOptions.runtimeProfiles.map(normalizeRuntimeProfile)) {
      const bridgeProfile = profileBridgeValue(profile);
      const state = await evaluate(`window.oplStudio.readState(${JSON.stringify(bridgeProfile)})`);
      checks.runtime[profile] = {
        ...readbackSummary(state, secretValues),
        bridgeProfile,
        status: state?.readback?.exitCode === 0 || state?.readback?.status === 0 ? "passed" : "partial"
      };
    }
    checks.ui = await runUiInteractions({ evaluate, timeoutMs: smokeOptions.timeoutMs });
    checks.gateway = await runGatewayHook({ evaluate, credentials, timeoutMs: smokeOptions.timeoutMs });
    checks.codexTurn = await runCodexTurnHook({ evaluate, request: turnRequest });
  } catch (error) {
    checks.failure = { detail: sanitizeError(error, secretValues) };
  }
  const requiredRuntimePassed = smokeOptions.runtimeProfiles.every((profile) => checks.runtime?.[normalizeRuntimeProfile(profile)]?.status === "passed");
  const identityPassed = checks.identity?.status === "passed";
  const uiPassed = checks.ui?.root === true
    && checks.ui?.studioRoot === true
    && checks.ui?.sessionHeader === true
    && checks.ui?.composerRunState === true
    && checks.ui?.settings?.opened === true
    && checks.ui?.settings?.panel === true
    && checks.ui?.settings?.account === true
    && checks.ui?.settings?.about === true
    && checks.ui?.runtime?.opened === true
    && checks.ui?.runtime?.panel === true
    && checks.ui?.runtime?.returnedToConversation === true
    && checks.ui?.inspector?.opened === true
    && checks.ui?.inspector?.tabs === true
    && checks.ui?.inspector?.closed === true;
  const gatewayPassed = checks.gateway?.status === "passed"
    || (!smokeOptions.requireGatewaySetup && checks.gateway?.status === "skipped");
  const turnPassed = checks.codexTurn?.status === "passed"
    || (!smokeOptions.requireCodexTurn && checks.codexTurn?.status === "skipped");
  const status = !checks.failure && identityPassed && checks.startup?.status === "passed" && checks.bridge?.status === "passed" && requiredRuntimePassed && uiPassed && gatewayPassed && turnPassed ? "passed" : "partial";
  return {
    schema: "opl_studio_preview_smoke.v1",
    status,
    carrier: smokeOptions.carrier,
    package: { productName: smokeOptions.productName, bundleId: smokeOptions.bundleId },
    checks,
    hooks: {
      gatewaySetup: checks.gateway?.status ?? "unavailable",
      codexTurn: checks.codexTurn?.status ?? "unavailable"
    },
    blockers: [
      ...(checks.failure ? ["preview_smoke_execution_incomplete"] : []),
      ...(!identityPassed ? ["preview_product_identity_not_proven"] : []),
      ...(checks.startup?.status !== "passed" ? ["renderer_startup_or_bridge_not_proven"] : []),
      ...(!requiredRuntimePassed ? ["required_runtime_profile_readback_not_proven"] : []),
      ...(!requiredRuntimePassed ? ["OPL_Framework_runtime_readback_not_proven_in_clean_VM"] : []),
      ...(!uiPassed ? ["minimum_preview_ui_interaction_not_proven"] : []),
      ...(checks.gateway?.status === "partial" ? ["Gateway_owner_projection_not_read_back_as_clean_setup_state"] : []),
      ...(smokeOptions.requireGatewaySetup && checks.gateway?.status !== "passed" ? ["required_gateway_setup_hook_not_passed"] : []),
      ...(smokeOptions.requireCodexTurn && checks.codexTurn?.status !== "passed" ? ["required_codex_turn_hook_not_passed"] : [])
    ]
  };
}

export async function loadPreviewSmokeInputs(options = {}, { env = process.env } = {}) {
  const credentials = await readGatewayCredentials({ file: options.gatewayCredentialsFile, env });
  const turnRequest = await readCodexTurnHook({ file: options.codexTurnHookFile, prompt: options.codexTurnPrompt, env });
  return { credentials, turnRequest };
}

export async function verifyPreviewIdentity({ appPath, productName = PREVIEW_PRODUCT.productName, bundleId = PREVIEW_PRODUCT.bundleId } = {}) {
  invariant(appPath, "app path is required for identity verification");
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  try {
    await stat(plistPath);
    const readPlist = (key) => {
      const result = spawnSync("plutil", ["-extract", key, "raw", "-o", "-", plistPath], { encoding: "utf8" });
      return result.status === 0 ? result.stdout.trim() : null;
    };
    const actualProductName = readPlist("CFBundleDisplayName") || readPlist("CFBundleName");
    const actualBundleId = readPlist("CFBundleIdentifier");
    return {
      status: actualProductName === productName && actualBundleId === bundleId ? "passed" : "partial",
      expected: { productName, bundleId },
      actual: { productName: actualProductName, bundleId: actualBundleId },
      plist: plistPath
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: "app_identity_unreadable",
      detail: sanitizeError(error),
      expected: { productName, bundleId },
      actual: { productName: null, bundleId: null },
      plist: plistPath
    };
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parsePreviewSmokeArgs(process.argv.slice(2));
  const inputs = await loadPreviewSmokeInputs(options);
  const identity = options.appPath
    ? await verifyPreviewIdentity({ appPath: options.appPath, productName: options.productName, bundleId: options.bundleId })
    : { status: "unavailable", reason: "app_path_not_provided" };
  const receipt = await runPreviewSmoke({
    evaluate: (expression) => evaluatePage({ port: options.cdpPort, expression, timeoutMs: options.timeoutMs }),
    waitForReady: () => waitForPageReady({ port: options.cdpPort, timeoutMs: options.timeoutMs }),
    options,
    credentials: inputs.credentials,
    turnRequest: inputs.turnRequest,
    identity
  });
  const output = { ...receipt, package: { ...receipt.package, appPath: options.appPath } };
  if (options.outPath) {
    await mkdir(path.dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, `${JSON.stringify(output, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status !== "passed") process.exitCode = 2;
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectFrameworkReadiness, runPreviewSmoke } from "./preview-smoke.mjs";

export const STABLE_PRODUCT = Object.freeze({ productName: "One Person Lab", bundleId: "cn.onepersonlab.opl" });

function invariant(condition, message) { if (!condition) throw new Error(message); }

/** First-install downloads and setup precede the ordinary bridge-call budget. */
export async function runDesktopHostReadiness({ evaluate, readFirstInstallAttempt, timeoutMs = 600_000 }) {
  const deadline = Date.now() + timeoutMs;
  let result;
  do {
    const remaining = result ? Math.max(1, deadline - Date.now()) : timeoutMs;
    result = await evaluate(`(async()=>{
      const state=await window.oplStudio.readState("fast");
      let code=null;try{code=JSON.parse(state?.readback?.stderr||"{}").error?.code;}catch{}
      return {exitCode:state?.readback?.exitCode,bootstrapStatus:state?.carrierDiagnostics?.frameworkBootstrapStatus,errorCode:typeof code==='string'&&/^[a-z_]{1,80}$/.test(code)?code:null};
    })()`, remaining);
    invariant(result?.bootstrapStatus === "available", `Desktop Framework bootstrap failed: ${result?.bootstrapStatus ?? "unavailable"}`);
    if (result?.exitCode === 0) return { ...result, status: "passed", timeoutMs };
    const attempt = typeof readFirstInstallAttempt === "function" ? await readFirstInstallAttempt() : null;
    if (result?.exitCode !== 1 || attempt?.status !== "running" || Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);
  invariant(result?.exitCode === 0, `Desktop Framework initial readback failed: ${result?.exitCode ?? "unavailable"}${result?.errorCode ? ` (${result.errorCode})` : ""}`);
  return { ...result, status: "passed", timeoutMs };
}

/** The account used by release qualification has no generation allowance. */
export async function runCodexReadiness({ evaluate }) {
  const result = await evaluate(`(async()=>{
    const models=await window.oplStudio.readCodexModels();
    const threads=await window.oplStudio.listThreads({limit:1});
    return {modelListValid:Array.isArray(models?.data),threadListValid:Array.isArray(threads?.data),modelCount:Array.isArray(models?.data)?models.data.length:null,simulated:models?.simulated===true||threads?.simulated===true};
  })()`);
  return {
    ...result,
    status: result?.modelListValid === true && result?.threadListValid === true && result?.simulated === false ? "passed" : "failed",
    protocolCalls: ["model/list", "thread/list"],
    generationRequested: false
  };
}

export async function runRuntimeRefresh({ evaluate, timeoutMs }) {
  const result = await evaluate(`(async()=>{
    const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
    const deadline=Date.now()+${Number(timeoutMs)};
    const close=[...document.querySelectorAll('button')].find((node)=>['关闭','Close'].includes(node.getAttribute('aria-label'))||['关闭','Close'].includes(node.innerText.trim()));
    if(document.querySelector('[data-testid="opl-settings-panel"]')) close?.click();
    const open=[...document.querySelectorAll('button')].find((node)=>['运行状态','Run status'].includes(node.getAttribute('aria-label'))||['运行状态','Run status'].includes(node.innerText.trim()));
    open?.click();
    const panel=()=>document.querySelector('[data-testid="opl-runtime-overview-page"]');
    while(!panel()&&Date.now()<deadline) await delay(50);
    const button=()=>panel()?.querySelector('button[aria-label="刷新运行状态"],button[aria-label="Refresh runtime status"]');
    while(button()?.disabled&&Date.now()<deadline) await delay(50);
    if(!panel()||!button()||button().disabled) return {panelReady:!!panel(),buttonReadyBefore:false,clicked:false,busyObserved:false,buttonReadyAfter:false};
    let busy=false;
    const observer=new MutationObserver((records)=>{if(records.some((record)=>record.target===button()&&record.attributeName==='disabled')) busy=true;});
    observer.observe(panel(),{subtree:true,attributes:true,attributeFilter:['disabled']});
    button().click();
    await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    while(Date.now()<deadline){busy=busy||button()?.disabled===true;if(busy&&button()&&!button().disabled) break;await delay(50);}
    observer.disconnect();
    return {panelReady:!!panel(),buttonReadyBefore:true,clicked:true,busyObserved:busy,buttonReadyAfter:!!button()&&!button().disabled,errorVisible:!!panel()?.querySelector('[role="alert"]')};
  })()`);
  return { ...result, status: result?.panelReady === true && result?.buttonReadyBefore === true && result?.clicked === true && result?.busyObserved === true && result?.buttonReadyAfter === true && result?.errorVisible === false ? "passed" : "failed" };
}

export async function runFrameworkReadiness({ evaluate, readFirstInstallAttempt, projection = null, expectedRootPackageIds = [], requireRootPackages = false, timeoutMs = 120_000 }) {
  let observed = projection ?? projectFrameworkReadiness(await evaluate("window.oplStudio.readState('fast')"), expectedRootPackageIds);
  let attempt = typeof readFirstInstallAttempt === "function" ? await readFirstInstallAttempt() : null;
  const missingRoots = () => expectedRootPackageIds.filter((id) => !observed.packages?.some((entry) => entry.id === id && entry.present === true && entry.installed === true));
  const hostReady = () => observed.initializeExitCode === 0
    && observed.stateExitCode === 0
    && observed.launchReady === true
    && observed.packageDirectoryPresent === true;
  // Standard is a host: optional Profile installation stays visible as
  // diagnostics, without delaying its readiness. Full verifies its selected seed.
  if (requireRootPackages && hostReady() && missingRoots().length > 0 && attempt?.status !== "failed") {
    const deadline = Date.now() + timeoutMs;
    do {
      observed = projectFrameworkReadiness(await evaluate("window.oplStudio.readState('fast')"), expectedRootPackageIds);
      attempt = typeof readFirstInstallAttempt === "function" ? await readFirstInstallAttempt() : null;
      if (!hostReady() || missingRoots().length === 0 || attempt?.status === "failed") break;
      const delay = Math.min(1000, deadline - Date.now());
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    } while (Date.now() < deadline);
  }
  const missingRootPackageIds = missingRoots();
  return {
    ...observed,
    expectedRootPackageIds,
    requireRootPackages,
    missingRootPackageIds,
    firstInstallStatus: attempt?.status ?? null,
    status: hostReady() && (!requireRootPackages || (missingRootPackageIds.length === 0 && attempt?.status !== "failed")) ? "passed" : "failed"
  };
}

export async function runStableSmoke(context) {
  invariant(!context.turnRequest && !context.options?.requireCodexTurn && !context.options?.codexTurnPrompt && !context.options?.codexTurnHookFile,
    "Stable clean VM qualification forbids model generation and turn hooks");
  const phaseTimeoutMs = Math.min(
    Number.isFinite(context.options?.phaseTimeoutMs) && context.options.phaseTimeoutMs > 0 ? context.options.phaseTimeoutMs : 120_000,
    context.options?.timeoutMs ?? 120_000
  );
  const progress = typeof context.progress === "function" ? context.progress : () => {};
  const evaluatePhase = (expression) => context.evaluate(expression, phaseTimeoutMs);
  // Installer density does not select the diagnostic state profile. Stable
  // first launch reads the same owner projection as the production renderer.
  const options = { ...context.options, ...STABLE_PRODUCT, runtimeStateProfile: "fast", requireGatewaySetup: true, requireCodexTurn: false, phaseTimeoutMs, progress };
  progress({ phase: "stable-smoke", status: "started", at: new Date().toISOString(), phaseTimeoutMs });
  invariant(context.credentials, "Stable clean VM qualification requires the dedicated Gateway account");
  const bootstrapTimeoutMs = Math.min(600_000, context.options?.timeoutMs ?? 600_000);
  progress({ phase: "desktop-host-readiness", status: "started", at: new Date().toISOString(), timeoutMs: bootstrapTimeoutMs });
  const desktopHostReadiness = await runDesktopHostReadiness({ evaluate: context.evaluate, readFirstInstallAttempt: context.readFirstInstallAttempt, timeoutMs: bootstrapTimeoutMs });
  progress({ phase: "desktop-host-readiness", status: "passed", at: new Date().toISOString(), timeoutMs: bootstrapTimeoutMs });
  const preview = await runPreviewSmoke({ ...context, evaluate: evaluatePhase, options, turnRequest: null });
  const frameworkReadinessTimeoutMs = Math.min(900_000, context.options?.timeoutMs ?? 900_000);
  progress({ phase: "framework-readiness", status: "started", at: new Date().toISOString(), phaseTimeoutMs: frameworkReadinessTimeoutMs });
  const frameworkReadiness = await runFrameworkReadiness({
    evaluate: evaluatePhase,
    readFirstInstallAttempt: context.readFirstInstallAttempt,
    projection: preview.checks.runtime?.standard?.frameworkProjection ?? preview.checks.runtime?.full?.frameworkProjection,
    expectedRootPackageIds: context.options?.expectedRootPackageIds,
    requireRootPackages: Object.hasOwn(preview.checks.runtime ?? {}, "full"),
    timeoutMs: frameworkReadinessTimeoutMs
  });
  progress({ phase: "framework-readiness", status: frameworkReadiness.status, at: new Date().toISOString(), missing: frameworkReadiness.missingRootPackageIds });
  const checks = { ...preview.checks };
  checks.desktopHostReadiness = desktopHostReadiness;
  checks.frameworkReadiness = frameworkReadiness;
  if (preview.status === "passed" && frameworkReadiness.status === "passed") {
    progress({ phase: "codex-readiness", status: "started", at: new Date().toISOString(), phaseTimeoutMs });
    checks.codexReadiness = await runCodexReadiness({ evaluate: evaluatePhase });
    progress({ phase: "codex-readiness", status: checks.codexReadiness.status, at: new Date().toISOString() });
    progress({ phase: "runtime-refresh", status: "started", at: new Date().toISOString(), phaseTimeoutMs });
    checks.runtimeRefresh = await runRuntimeRefresh({ evaluate: evaluatePhase, timeoutMs: phaseTimeoutMs });
    progress({ phase: "runtime-refresh", status: checks.runtimeRefresh.status, at: new Date().toISOString() });
  }
  const status = preview.status === "passed" && checks.codexReadiness?.status === "passed" && checks.frameworkReadiness?.status === "passed" && checks.runtimeRefresh?.status === "passed" ? "passed" : "failed";
  return {
    ...preview, schema: "opl_studio_stable_smoke.v1", status, checks,
    generationRequested: false,
    blockers: [...preview.blockers,
      ...(checks.codexReadiness?.status === "passed" ? [] : ["codex_protocol_readiness_not_proven"]),
      ...(checks.frameworkReadiness?.status === "passed" ? [] : ["framework_host_or_selected_full_seed_not_proven"]),
      ...(checks.runtimeRefresh?.status === "passed" ? [] : ["production_runtime_refresh_not_proven"])]
  };
}

export function validateStableRuntimeEvidence(summary) {
  invariant(summary?.schema === "opl_studio_stable_smoke.v1" && summary.status === "passed", "Expected passed Studio Stable smoke evidence");
  invariant(summary.package?.productName === STABLE_PRODUCT.productName && summary.package?.bundleId === STABLE_PRODUCT.bundleId, "Stable product identity differs");
  invariant(summary.generationRequested === false && summary.checks?.codexTurn?.status === "skipped", "Stable evidence contains a generation attempt");
  const ready = summary.checks?.codexReadiness;
  invariant(ready?.status === "passed" && ready.generationRequested === false && ready.modelListValid === true && ready.threadListValid === true && ready.simulated === false, "Codex protocol readiness is not proven");
  const refresh = summary.checks?.runtimeRefresh;
  invariant(refresh?.status === "passed" && refresh.panelReady === true && refresh.buttonReadyBefore === true && refresh.clicked === true && refresh.busyObserved === true && refresh.buttonReadyAfter === true && refresh.errorVisible === false, "Production Runtime UI refresh is not proven");
  invariant(summary.checks?.gateway?.status === "passed", "Dedicated Gateway login and model-access readiness are not proven");
  const framework = summary.checks?.frameworkReadiness;
  const requireRootPackages = Object.hasOwn(summary.checks?.runtime ?? {}, "full");
  invariant(framework?.status === "passed" && framework.launchReady === true && framework.packageDirectoryPresent === true
    && framework.requireRootPackages === requireRootPackages
    && (!requireRootPackages || (framework.missingRootPackageIds?.length === 0 && framework.firstInstallStatus !== "failed")), "Framework host readiness or selected Full seed is not proven");
  return { schema: "opl_settings_runtime_refresh_evidence_verification.v1", status: "passed", shell: "opl-studio", production_default_targets_required: true, synthetic_target_injection_allowed: false, generation_requested: false, runtime_surface: "opl-runtime-overview-page" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  invariant(process.argv[2] === "--validate-runtime-evidence" && process.argv.length === 4, "Usage: stable-smoke.mjs --validate-runtime-evidence <smoke-summary.json>");
  process.stdout.write(`${JSON.stringify(validateStableRuntimeEvidence(JSON.parse(await readFile(process.argv[3], "utf8"))), null, 2)}\n`);
}

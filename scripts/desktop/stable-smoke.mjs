import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPreviewSmoke } from "./preview-smoke.mjs";

export const STABLE_PRODUCT = Object.freeze({ productName: "One Person Lab", bundleId: "cn.onepersonlab.opl" });

function invariant(condition, message) { if (!condition) throw new Error(message); }

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

export async function runFrameworkReadiness({ evaluate, expectedRootPackageIds = [], timeoutMs = 120_000 }) {
  const result = await evaluate(`(async()=>{
    const expected=${JSON.stringify(expectedRootPackageIds)};
    const deadline=Date.now()+${Number(timeoutMs)};
    let result;
    do {
    const initialize=await window.oplStudio.readInitialize();
    const state=await window.oplStudio.readState('fast');
    const outer=state?.app_state??state;const root=outer?.app_state??outer;
    const packages=root?.agent_packages;
    const entries=packages?.directory?.entries;
    result={
      initializeExitCode:initialize?.readback?.exitCode??initialize?.readback?.status??null,
      stateExitCode:state?.readback?.exitCode??state?.readback?.status??null,
      launchReady:initialize?.system_initialize?.setup_flow?.ready_to_launch===true,
      packageDirectoryPresent:Array.isArray(entries),
      packageSource:packages?.source??null,
      packages:Array.isArray(entries)?entries.map((entry)=>({id:entry.package_id??null,present:entry.installed===true||entry.presence?.present===true,installed:entry.installed===true||entry.presence?.installed===true,role:entry.package_role??null})):[]
    };
    if(result.initializeExitCode===0&&result.stateExitCode===0&&result.launchReady&&result.packageDirectoryPresent&&expected.every((id)=>result.packages.some((entry)=>entry.id===id&&entry.installed&&entry.present))) return result;
    await new Promise((resolve)=>setTimeout(resolve,1000));
    } while(Date.now()<deadline);
    return result;
  })()`);
  const missing = expectedRootPackageIds.filter((id) => !result?.packages?.some((entry) => entry.id === id && entry.present === true && entry.installed === true));
  return {
    ...result, expectedRootPackageIds, missingRootPackageIds: missing,
    status: result?.initializeExitCode === 0 && result?.stateExitCode === 0 && result?.launchReady === true && result?.packageDirectoryPresent === true && missing.length === 0 ? "passed" : "failed"
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
  const options = { ...context.options, ...STABLE_PRODUCT, requireGatewaySetup: true, requireCodexTurn: false, phaseTimeoutMs, progress };
  progress({ phase: "stable-smoke", status: "started", at: new Date().toISOString(), phaseTimeoutMs });
  invariant(context.credentials, "Stable clean VM qualification requires the dedicated Gateway account");
  // Read the Framework projection before the Gateway mutation. The Gateway
  // model-access action can restart the Host transport; validating readiness
  // first keeps the two owner readbacks independent and leaves a bounded
  // diagnostic if either transport is unhealthy.
  progress({ phase: "framework-readiness", status: "started", at: new Date().toISOString(), phaseTimeoutMs });
  const frameworkReadiness = await runFrameworkReadiness({ evaluate: evaluatePhase, expectedRootPackageIds: context.options?.expectedRootPackageIds, timeoutMs: phaseTimeoutMs });
  progress({ phase: "framework-readiness", status: frameworkReadiness.status, at: new Date().toISOString(), missing: frameworkReadiness.missingRootPackageIds });
  const preview = await runPreviewSmoke({ ...context, evaluate: evaluatePhase, options, turnRequest: null });
  const checks = { ...preview.checks };
  checks.frameworkReadiness = frameworkReadiness;
  if (preview.status === "passed") {
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
      ...(checks.frameworkReadiness?.status === "passed" ? [] : ["framework_launch_and_official_profile_projection_not_proven"]),
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
  invariant(summary.checks?.frameworkReadiness?.status === "passed" && summary.checks.frameworkReadiness.launchReady === true && summary.checks.frameworkReadiness.packageDirectoryPresent === true && summary.checks.frameworkReadiness.missingRootPackageIds?.length === 0, "Framework launch and Official Profile package projection are not proven");
  return { schema: "opl_settings_runtime_refresh_evidence_verification.v1", status: "passed", shell: "opl-studio", production_default_targets_required: true, synthetic_target_injection_allowed: false, generation_requested: false, runtime_surface: "opl-runtime-overview-page" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  invariant(process.argv[2] === "--validate-runtime-evidence" && process.argv.length === 4, "Usage: stable-smoke.mjs --validate-runtime-evidence <smoke-summary.json>");
  process.stdout.write(`${JSON.stringify(validateStableRuntimeEvidence(JSON.parse(await readFile(process.argv[3], "utf8"))), null, 2)}\n`);
}

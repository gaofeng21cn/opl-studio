import assert from "node:assert/strict";
import test from "node:test";
import {
  PREVIEW_PRODUCT,
  parsePreviewSmokeArgs,
  parseRuntimeProfiles,
  projectGatewayState,
  redactSecrets,
  runGatewayHook,
  runPreviewSmoke
} from "../../scripts/desktop/preview-smoke.mjs";
import { collectTemporalServiceSupervisorProof, parseCurrentFirstInstallAttempt, parseInstalledIdentityOutput, preparePublicReleaseMetadata } from "../../scripts/desktop/qualify-clean-vm.mjs";
import { runDesktopHostReadiness, runStableSmoke } from "../../scripts/desktop/stable-smoke.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("Guest public metadata transport reads exact Framework sources and rejects other API calls", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-metadata-test-"));
  try {
    const source = path.join(root, "one-person-lab", "contracts", "opl-framework");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "dependency-release-sources.json"), JSON.stringify({ sources: { temporal: { kind: "github-release", repository: "temporalio/cli" }, codex: { kind: "npm" } } }));
    const archive = path.join(root, "framework.tar.gz");
    assert.equal(spawnSync("tar", ["-czf", archive, "-C", root, "one-person-lab"]).status, 0);
    const metadata = await preparePublicReleaseMetadata(root, archive, async endpoint => {
      assert.equal(endpoint, "repos/temporalio/cli/releases/latest");
      return { draft: false, prerelease: false, tag_name: "v1.0.0", url: "https://api.github.com/repos/temporalio/cli/releases/123", assets: [{ digest: `sha256:${"a".repeat(64)}` }] };
    });
    const read = args => spawnSync(process.execPath, [metadata.readerFile, ...args], { encoding: "utf8" });
    assert.equal(JSON.parse(read(["api", metadata.endpoints[0]]).stdout).assets[0].digest, `sha256:${"a".repeat(64)}`);
    assert.notEqual(read(["api", "user"]).status, 0);
    assert.notEqual(read(["api", metadata.endpoints[0], "--method", "POST"]).status, 0);
    assert.equal(metadata.credentialsCopiedToGuest, false);
    await assert.rejects(preparePublicReleaseMetadata(root, archive, async () => ({ draft: false, prerelease: true })), /Invalid stable/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("Guest public metadata accepts a stable release after a GitHub repository redirect", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-metadata-redirect-test-"));
  try {
    const source = path.join(root, "one-person-lab", "contracts", "opl-framework");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "dependency-release-sources.json"), JSON.stringify({ sources: { zstd: { kind: "github-release", repository: "facebook/zstd" } } }));
    const archive = path.join(root, "framework.tar.gz");
    assert.equal(spawnSync("tar", ["-czf", archive, "-C", root, "one-person-lab"]).status, 0);
    const metadata = await preparePublicReleaseMetadata(root, archive, async endpoint => {
      assert.equal(endpoint, "repos/facebook/zstd/releases/latest");
      return { draft: false, prerelease: false, tag_name: "v1.5.7", url: "https://api.github.com/repos/meta/zstd/releases/201293731" };
    });
    assert.equal(metadata.endpoints[0], "repos/facebook/zstd/releases/latest");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("Full Temporal proof executes the packaged CLI and observes each real lifecycle boundary", async () => {
  const home = "/Users/guest";
  const databasePath = `${home}/Library/Application Support/OPL/state/family-runtime/temporal-server/temporal.sqlite`;
  const label = "ai.opl.family-runtime.temporal-service";
  const calls = [];
  let pid = 101;
  let observations = 0;
  let unloading = 0;
  let bootstrapFailures = 0;
  const hooks = {
    home, uid: 501,
    opl(args) {
      calls.push(args);
      if (args[0] === "app") {
        const action = args.at(-1); if (action === "provider_service_restart") pid++;
        return { app_action_execution: { action_id: action, dry_run: false, result: { family_runtime_service: { status: { supervisor: { pid } } } } } };
      }
      return { family_runtime_service: { service_status: "running", server_reachable: true,
        supervisor: { ready: true, required: true, configuration_current: true, process_state: "running", pid } } };
    },
    command(executable, args) {
      calls.push([executable, ...args]);
      if (args[0] === "bootout") unloading = 2;
      if (args[0] === "print" || args[0] === "-0") return { args, status: unloading > 0 ? (--unloading, 0) : 3 };
      if (args[0] === "bootstrap" && bootstrapFailures++ === 0) return { args, status: 5, stderr: "Bootstrap failed: 5" };
      if (executable === "/bin/kill" || args[0] === "bootstrap") pid++;
      return { args, status: 0, signal: null, stdout: "", stderr: "" };
    },
    sleep: async () => {},
    readPlist: () => ({ Label: label, RunAtLoad: true, KeepAlive: true, ProgramArguments: ["temporal", "server", "start-dev", "--db-filename", databasePath] }),
    database: async () => ({ identity: "1:42", size: 4096, valid: true }),
  };
  // Exercise the serialized guest entry, so no module-local helper is available.
  const collect = new Function(`return (${collectTemporalServiceSupervisorProof.toString()})`)();
  const proof = await collect({ runtime: "/packaged runtime", hooks });
  assert.equal(proof.status, "passed");
  assert.equal(proof.start_action.action_id, "provider_service_start");
  assert.deepEqual([proof.initial_readback, proof.keep_alive_recovery.readback, proof.restart_readback, proof.session_reload.readback].map(x => x.supervisor.pid), [101, 102, 103, 104]);
  assert.ok(calls.some(x => x[0] === "/bin/kill" && x[2] === "101"));
  assert.ok(calls.some(x => x[1] === "bootout" && x[2] === `gui/501/${label}`));
  assert.equal(proof.session_reload.unloaded, true);
  assert.deepEqual(proof.session_reload.bootstrap_attempts.map(x => x.status), [5, 0]);
  await assert.rejects(collect({ runtime: "/runtime", hooks: { ...hooks,
    database: async () => ({ identity: ++observations === 1 ? "1:42" : "1:43", valid: true }) } }), /replaced its persistent database/);
  await assert.rejects(collect({ runtime: "/runtime", hooks: { ...hooks,
    readPlist: () => ({ Label: label, RunAtLoad: true, KeepAlive: false }) } }), /launchd configuration/);
});

function gatewayRecoveryFixture({ first = {}, reconciledSource = "missing", ready = true } = {}) {
  let source = "missing";
  let calls = 0;
  const projection = () => ({ surfaceKind: "opl_gateway_account_read_model.v1", status: "connected", connectionMode: "account", accountStatus: "active", managedKeyStatus: "active", freshnessStale: source === "opl_gateway" ? !ready : false, modelAccessSource: source, modelAccessAction: { actionId: "gateway_account_use_for_model_access", confirmationRequired: true, dryRunSupported: false, payloadFields: [] } });
  return {
    credentials: { email: "release@example.com", password: "secret" }, timeoutMs: 1,
    evaluate: async (expression) => {
      if (expression.includes("loginGatewayAccount")) return { ok: true, stateRefreshRequired: true };
      if (expression.includes("executeAction")) {
        calls++;
        if (calls === 1) return { ok: true, status: "error", dryRun: false, exitCode: 4, errorCode: "gateway_unavailable", ...first };
        source = "opl_gateway";
        return { ok: true, status: "executed", dryRun: false, exitCode: 0 };
      }
      if (!expression.includes("const project=")) source = reconciledSource;
      return { projection: projection() };
    },
    callCount: () => calls
  };
}

test("Gateway setup reconciles one settled unavailable error and retries once with real readiness still required", async () => {
  const fixture = gatewayRecoveryFixture();
  const result = await runGatewayHook(fixture);
  assert.equal(result.status, "passed");
  assert.equal(fixture.callCount(), 2);
  assert.equal(result.confirmation.recovery.firstExecute.errorCode, "gateway_unavailable");
  assert.equal(result.confirmation.recovery.retryCount, 1);
  const stale = gatewayRecoveryFixture({ ready: false });
  assert.equal((await runGatewayHook(stale)).status, "partial");
  assert.equal(stale.callCount(), 2);
});

test("Gateway recovery does not repeat unknown outcomes, authentication failures, or changed model access", async () => {
  for (const input of [{ first: { ok: false } }, { first: { status: null } }, { first: { errorCode: "invalid_credentials" } }, { first: { exitCode: null } }, { reconciledSource: "codex_login" }]) {
    const fixture = gatewayRecoveryFixture(input);
    assert.equal((await runGatewayHook(fixture)).status, "partial");
    assert.equal(fixture.callCount(), 1);
  }
});

test("Gateway recovery reads an already converged owner without a second mutation", async () => {
  const fixture = gatewayRecoveryFixture({ reconciledSource: "opl_gateway" });
  const result = await runGatewayHook(fixture);
  assert.equal(result.status, "passed");
  assert.equal(fixture.callCount(), 1);
  assert.equal(result.confirmation.recovery.alreadyConfigured, true);
  assert.equal(result.confirmation.recovery.retryCount, 0);
});

test("clean VM parses plutil raw values without embedding line breaks in JSON strings", () => {
  assert.deepEqual(parseInstalledIdentityOutput(
    '{"version":"0.1.2\n","productName":"One Person Lab Preview\n","bundleId":"cn.onepersonlab.opl.studio.preview\n"}'
  ), {
    version: "0.1.2",
    productName: "One Person Lab Preview",
    bundleId: "cn.onepersonlab.opl.studio.preview"
  });
});

test("Preview smoke maps Standard and Full to the real bridge profiles", () => {
  assert.deepEqual(parseRuntimeProfiles("standard,fast,full,standard"), ["standard", "full"]);
  const options = parsePreviewSmokeArgs([
    "--carrier", "webui",
    "--cdp-port", "9333",
    "--runtime-profiles", "standard,full",
    "--screenshots-dir", "out/screenshots",
    "--require-gateway-setup",
    "--require-codex-turn"
  ]);
  assert.equal(options.carrier, "webui");
  assert.equal(options.cdpPort, 9333);
  assert.deepEqual(options.runtimeProfiles, ["standard", "full"]);
  assert.match(options.screenshotsDir, /out\/screenshots$/);
  assert.equal(options.requireGatewaySetup, true);
  assert.equal(options.requireCodexTurn, true);
});

test("first launch waits only while this App process has an active first-install operation", async () => {
  const attempt = JSON.stringify({ schema: "opl_official_profile_first_install_terminal.v1", app_process_id: 42, status: "running" });
  assert.equal(parseCurrentFirstInstallAttempt(attempt, 41), null);
  assert.equal(parseCurrentFirstInstallAttempt('{}', 42), null);
  let reads = 0;
  const ready = await runDesktopHostReadiness({
    timeoutMs: 2000,
    evaluate: async () => ({ bootstrapStatus: "available", exitCode: ++reads === 1 ? 1 : 0 }),
    readFirstInstallAttempt: async () => parseCurrentFirstInstallAttempt(attempt, 42)
  });
  assert.equal(reads, 2);
  assert.equal(ready.status, "passed");
  for (const status of ["failed", "passed"]) {
    reads = 0;
    await assert.rejects(runDesktopHostReadiness({
      evaluate: async () => ({ bootstrapStatus: "available", exitCode: (++reads, 1), errorCode: "fixture_error" }),
      readFirstInstallAttempt: async () => ({ status })
    }), /initial readback failed.*fixture_error/);
    assert.equal(reads, 1);
  }
});

test("Stable Full first launch reads the normal owner projection and rejects failed readback", async () => {
  for (const exitCode of [0, -1]) {
    const calls = [];
    const result = await runStableSmoke({
      credentials: { email: "release@example.com", password: "fixture-password" },
      identity: { status: "passed" },
      options: { runtimeProfiles: ["full"], expectedRootPackageIds: ["mas"], timeoutMs: 1000 },
      evaluate: async (expression) => {
        calls.push(expression);
        if (expression.includes("bootstrapStatus")) return { exitCode: 0, bootstrapStatus: "available" };
        if (expression.includes("readyState")) return { readyState: "complete", root: true, bridge: true };
        if (expression.includes("Object.keys(window.oplStudio)")) return { bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
        if (expression.includes('readState("fast")')) return { profile: "fast", readback: { exitCode }, app_state: { agent_packages: { directory: { entries: [{ package_id: "mas", installed: true }] } } } };
        // This fixture deliberately lacks UI/login evidence; state success alone
        // must not qualify the installer.
        return {};
      }
    });
    assert.equal(result.checks.runtime.full.bridgeProfile, "fast");
    assert.equal(result.checks.runtime.full.status, exitCode === 0 ? "passed" : "partial");
    assert.equal(result.checks.runtime.full.frameworkProjection.packages[0].installed, true);
    assert.equal(result.checks.frameworkReadiness.status, exitCode === 0 ? "passed" : "failed");
    assert.equal(result.status, "failed");
    assert.equal(calls.some(expression => expression.includes('readState("full")')), false);
  }
});

test("Preview smoke skips optional hooks without claiming they ran", async () => {
  const evaluated = [];
  const receipt = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: async (expression) => {
      evaluated.push(expression);
      if (expression.includes("Object.keys(window.oplStudio)")) {
        return { state: { readback: { exitCode: 0 } }, bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
      }
      if (expression.includes("readState(\"fast\")") || expression.includes("readState(\"full\")")) {
        return { profile: expression.includes("full") ? "full" : "fast", readback: { exitCode: 0 } };
      }
      if (expression.includes("document.querySelector")) {
        return {
          root: true,
          studioRoot: true,
          startupReadiness: true,
          sessionHeader: true,
          composerRunState: true,
          settings: { opened: true, panel: true, account: true, about: true },
          runtime: { opened: true, panel: true, returnedToConversation: true },
          onboarding: { visible: false, dismissed: true },
          inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
        };
      }
      return {};
    }
  });
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.hooks.gatewaySetup, "skipped");
  assert.equal(receipt.hooks.codexTurn, "skipped");
  assert.ok(evaluated.some((expression) => expression.includes('settings-page-about')));
  assert.ok(evaluated.some((expression) => expression.includes('opl-runtime-overview-page')));
  assert.ok(evaluated.some((expression) => expression.includes('opl-context-inspector-trigger')));
  assert.ok(evaluated.some((expression) => expression.includes('opl-context-tabs')));
  assert.ok(evaluated.some((expression) => expression.includes('[role="menu"] [role="menuitem"]')));
  assert.ok(evaluated.some((expression) => expression.includes('menuItem.click()')));
  assert.ok(evaluated.some((expression) => expression.includes('opl-context-inspector-close')));
  assert.ok(evaluated.some((expression) => expression.includes('requestAnimationFrame(()=>requestAnimationFrame(resolve))')));
  assert.ok(evaluated.some((expression) => expression.includes('稍后处理')));
  assert.ok(evaluated.some((expression) => expression.includes('waitForGone')));
});

test("Preview smoke bounds every phase and records progress when a bridge read stalls", async () => {
  const progress = [];
  const receipt = await runPreviewSmoke({
    identity: { status: "passed" },
    options: { runtimeProfiles: ["standard"], timeoutMs: 10_000, phaseTimeoutMs: 25, progress: (event) => progress.push(event) },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: async (expression, timeoutMs) => {
      assert.equal(timeoutMs, 25);
      if (expression.includes("Object.keys(window.oplStudio)")) {
        return { bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
      }
      throw new Error("readState phase stalled");
    }
  });
  assert.equal(receipt.status, "partial");
  assert.equal(receipt.phaseTimeoutMs, 25);
  assert.ok(progress.some((event) => event.phase === "runtime:standard" && event.status === "started"));
  assert.equal(receipt.checks.failure.detail, "readState phase stalled");
});

test("Preview smoke never serializes supplied secrets into diagnostics", async () => {
  const secretValues = ["user@example.com", "password-value", "prompt-value"];
  assert.equal(redactSecrets("password-value and prompt-value", secretValues), "[REDACTED] and [REDACTED]");
  const receipt = await runPreviewSmoke({
    identity: { status: "partial" },
    waitForReady: async () => { throw new Error("prompt-value password-value"); },
    evaluate: async () => ({}),
    credentials: { email: secretValues[0], password: secretValues[1] },
    turnRequest: { prompt: secretValues[2] }
  });
  const serialized = JSON.stringify(receipt);
  for (const secret of secretValues) assert.equal(serialized.includes(secret), false);
});

test("Preview smoke requires a completed non-simulated Codex turn with a final response", async () => {
  const baseEvaluate = async (expression) => {
    if (expression.includes("Object.keys(window.oplStudio)")) {
      return { state: { readback: { exitCode: 0 } }, bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
    }
    if (expression.includes("readState(\"fast\")") || expression.includes("readState(\"full\")")) {
      return { profile: expression.includes("full") ? "full" : "fast", readback: { exitCode: 0 } };
    }
    if (expression.includes("document.querySelector")) {
      return {
        root: true,
        studioRoot: true,
        sessionHeader: true,
        composerRunState: true,
        settings: { opened: true, panel: true, account: true, about: true },
        runtime: { opened: true, panel: true, returnedToConversation: true },
        onboarding: { visible: false, dismissed: true },
        inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
      };
    }
    if (expression.includes("window.oplStudio.sendMessage")) {
      return {
        threadId: "thread-1",
        turnId: "turn-1",
        completed: "failed",
        finalMessagePresent: true,
        simulated: false,
        error: {
          code: "model_provider_failed",
          message: "Only reply OK could not reach the configured provider",
          details: { provider: "test" }
        }
      };
    }
    return {};
  };
  const receipt = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: baseEvaluate,
    turnRequest: { prompt: "Only reply OK" },
    options: { requireCodexTurn: true }
  });
  assert.equal(receipt.status, "partial");
  assert.equal(receipt.checks.codexTurn.status, "partial");
  assert.deepEqual(receipt.checks.codexTurn.error, {
    code: "model_provider_failed",
    message: "[REDACTED] could not reach the configured provider",
    fields: ["code", "details", "message"]
  });
  assert.ok(receipt.blockers.includes("required_codex_turn_hook_not_passed"));
});

function turnProbeEvaluate(turnResult) {
  return async (expression) => {
    if (expression.includes("Object.keys(window.oplStudio)")) {
      return { state: { readback: { exitCode: 0 } }, bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
    }
    if (expression.includes("readState(\"fast\")") || expression.includes("readState(\"full\")")) {
      return { profile: expression.includes("full") ? "full" : "fast", readback: { exitCode: 0 } };
    }
    if (expression.includes("document.querySelector")) {
      return {
        root: true,
        studioRoot: true,
        sessionHeader: true,
        composerRunState: true,
        settings: { opened: true, panel: true, account: true, about: true },
        runtime: { opened: true, panel: true, returnedToConversation: true },
        onboarding: { visible: false, dismissed: true },
        inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
      };
    }
    if (expression.includes("window.oplStudio.sendMessage")) return turnResult;
    return {};
  };
}

test("Preview smoke accepts a structured INSUFFICIENT_BALANCE turn as proven provider connectivity", async () => {
  const receipt = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: turnProbeEvaluate({
      threadId: "thread-balance",
      turnId: "turn-balance",
      completed: "failed",
      finalMessagePresent: false,
      simulated: false,
      error: {
        code: null,
        message: 'unexpected status 403 Forbidden: {"code":"INSUFFICIENT_BALANCE","message":"Insufficient account balance"}, url: https://gateway.example/v1/responses',
        additionalDetails: null
      }
    }),
    turnRequest: { prompt: "Only reply OK" },
    options: { requireCodexTurn: true }
  });
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.hooks.codexTurn, "connectivity_confirmed");
  assert.equal(receipt.checks.codexTurn.status, "connectivity_confirmed");
  assert.equal(receipt.checks.codexTurn.connectivity, "confirmed");
  assert.equal(receipt.checks.codexTurn.connectivityCode, "INSUFFICIENT_BALANCE");
  assert.equal(receipt.checks.codexTurn.outcome, "provider_reachable_without_generation");
  assert.equal(receipt.checks.codexTurn.scope, "connectivity_not_generation");
  assert.equal(receipt.checks.codexTurn.simulated, false);
  assert.equal(receipt.blockers.includes("required_codex_turn_hook_not_passed"), false);
});

test("Preview smoke keeps generic 403 and simulated turn outcomes as failures", async () => {
  const genericForbidden = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: turnProbeEvaluate({
      threadId: "thread-403",
      turnId: "turn-403",
      completed: "failed",
      finalMessagePresent: false,
      simulated: false,
      error: { code: "http_403", message: "unexpected status 403 Forbidden: unauthorized" }
    }),
    turnRequest: { prompt: "Only reply OK" },
    options: { requireCodexTurn: true }
  });
  assert.equal(genericForbidden.status, "partial");
  assert.equal(genericForbidden.checks.codexTurn.status, "partial");
  assert.equal(genericForbidden.checks.codexTurn.connectivity, "not_proven");
  assert.ok(genericForbidden.blockers.includes("required_codex_turn_hook_not_passed"));

  const simulated = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: turnProbeEvaluate({
      threadId: "thread-simulated",
      turnId: "turn-simulated",
      completed: "completed",
      finalMessagePresent: true,
      simulated: true,
      error: null
    }),
    turnRequest: { prompt: "Only reply OK" },
    options: { requireCodexTurn: true }
  });
  assert.equal(simulated.status, "partial");
  assert.equal(simulated.checks.codexTurn.status, "partial");
  assert.ok(simulated.blockers.includes("required_codex_turn_hook_not_passed"));
});

test("Preview smoke does not accept the pre-login Gateway projection as authenticated", async () => {
  const evaluate = async (expression) => {
    if (expression.includes("Object.keys(window.oplStudio)")) {
      return { state: { readback: { exitCode: 0 } }, bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
    }
    if (expression.includes("readState(\"fast\")") || expression.includes("readState(\"full\")")) {
      return { profile: expression.includes("full") ? "full" : "fast", readback: { exitCode: 0 } };
    }
    if (expression.includes("document.querySelector")) {
      return {
        root: true,
        studioRoot: true,
        sessionHeader: true,
        composerRunState: true,
        settings: { opened: true, panel: true, account: true, about: true },
        runtime: { opened: true, panel: true, returnedToConversation: true },
        onboarding: { visible: false, dismissed: true },
        inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
      };
    }
    if (expression.includes("loginGatewayAccount")) return { ok: true, stateRefreshRequired: true, errorCode: null };
    if (expression.includes("const deadline=Date.now()")) {
      return {
        state: {},
        projection: {
          surfaceKind: "opl_gateway_account_read_model.v1",
          status: "setup_required",
          connectionMode: "none",
          accountStatus: null,
          managedKeyStatus: null,
          freshnessStale: false
        }
      };
    }
    return {};
  };
  const receipt = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate,
    credentials: { email: "release@example.com", password: "secret" },
    options: { requireGatewaySetup: true, runtimeProfiles: ["standard"] }
  });
  assert.equal(receipt.checks.gateway.status, "partial");
  assert.ok(receipt.blockers.includes("required_gateway_setup_hook_not_passed"));
});

test("Preview smoke confirms the projected Gateway model-access action before the Codex turn", async () => {
  let modelAccessSource = "codex_login";
  const actionCalls = [];
  const state = () => ({
    app_state: {
      core: { codex: { model_access_source: modelAccessSource } },
      actions: [{
        action_id: "gateway_account_use_for_model_access",
        confirmation_required: true,
        dry_run_supported: false,
        payload_fields: []
      }],
      settings_control_center: {
        app_settings_read_model: {
          codex_model_policy: { model_access_source: modelAccessSource },
          opl_gateway_account: {
            surface_kind: "opl_gateway_account_read_model.v1",
            connection_mode: "account",
            status: "connected",
            account_card_visible: true,
            account: { status: "active" },
            managed_key: { status: "active" },
            freshness: { stale: false },
            actions: { use_for_model_access: "gateway_account_use_for_model_access" }
          }
        }
      }
    }
  });
  const evaluate = async (expression) => {
    if (expression.includes("Object.keys(window.oplStudio)")) {
      return { state: { readback: { exitCode: 0 } }, bridgeKeys: ["readState", "sendMessage", "executeAction"], startupErrors: [] };
    }
    if (expression.includes("const project=")) {
      const current = state();
      return { state: current, projection: projectGatewayState(current) };
    }
    if (expression.includes("window.oplStudio.executeAction")) {
      const dryRun = expression.includes("dryRun:true");
      actionCalls.push(dryRun ? "dryRun" : "execute");
      if (!dryRun) modelAccessSource = "opl_gateway";
      return {
        ok: true,
        status: dryRun ? "preview_ready" : "executed",
        dryRun,
        confirmationRequired: false,
        canExecute: true,
        exitCode: 0
      };
    }
    if (expression.includes("loginGatewayAccount")) return { ok: true, stateRefreshRequired: true, errorCode: null };
    if (expression.includes("readState(\"fast\")") || expression.includes("readState(\"full\")")) {
      return { profile: expression.includes("full") ? "full" : "fast", readback: { exitCode: 0 } };
    }
    if (expression.includes("document.querySelector")) {
      return {
        root: true,
        studioRoot: true,
        sessionHeader: true,
        composerRunState: true,
        settings: { opened: true, panel: true, account: true, about: true },
        runtime: { opened: true, panel: true, returnedToConversation: true },
        inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
      };
    }
    return {};
  };
  const receipt = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate,
    credentials: { email: "release@example.com", password: "secret" },
    options: { requireGatewaySetup: true, runtimeProfiles: ["standard"] }
  });
  assert.equal(receipt.checks.gateway.status, "passed");
  assert.deepEqual(actionCalls, ["execute"]);
  assert.equal(receipt.checks.gateway.projection.modelAccessSource, "opl_gateway");
  assert.equal(receipt.checks.gateway.modelAccessAction.actionId, "gateway_account_use_for_model_access");
});

test("Preview smoke reports a partial Gateway check when model-access admission is not projected", async () => {
  const evaluate = async (expression) => {
    if (expression.includes("Object.keys(window.oplStudio)")) {
      return { state: { readback: { exitCode: 0 } }, bridgeKeys: ["readState", "sendMessage"], startupErrors: [] };
    }
    if (expression.includes("const project=")) {
      return {
        state: {},
        projection: {
          surfaceKind: "opl_gateway_account_read_model.v1",
          status: "connected",
          connectionMode: "account",
          accountStatus: "active",
          managedKeyStatus: "active",
          freshnessStale: false,
          modelAccessSource: "codex_login",
          modelAccessAction: null
        }
      };
    }
    if (expression.includes("loginGatewayAccount")) return { ok: true, stateRefreshRequired: true, errorCode: null };
    if (expression.includes("readState(\"fast\")") || expression.includes("readState(\"full\")")) {
      return { profile: expression.includes("full") ? "full" : "fast", readback: { exitCode: 0 } };
    }
    if (expression.includes("document.querySelector")) {
      return {
        root: true,
        studioRoot: true,
        sessionHeader: true,
        composerRunState: true,
        settings: { opened: true, panel: true, account: true, about: true },
        runtime: { opened: true, panel: true, returnedToConversation: true },
        inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
      };
    }
    return {};
  };
  const evaluated = [];
  const wrappedEvaluate = async (expression) => {
    evaluated.push(expression);
    return evaluate(expression);
  };
  const receipt = await runPreviewSmoke({
    identity: { status: "passed", expected: PREVIEW_PRODUCT, actual: PREVIEW_PRODUCT },
    waitForReady: async () => ({ readyState: "complete", root: true, bridge: true }),
    evaluate: wrappedEvaluate,
    credentials: { email: "release@example.com", password: "secret" },
    options: { requireGatewaySetup: true, runtimeProfiles: ["standard"] }
  });
  assert.equal(receipt.checks.gateway.status, "partial");
  assert.equal(receipt.checks.gateway.errorCode, "gateway_model_access_action_not_projected");
  assert.equal(evaluated.some((expression) => expression.includes("window.oplStudio.executeAction")), false);
});

test("Gateway action diagnostics retain owner reason codes without raw secrets", async () => {
  const { projectGatewayActionReceipt } = await import("../../scripts/desktop/preview-smoke.mjs");
  const receipt = projectGatewayActionReceipt({
    status: "error", exitCode: 4, canExecute: true,
    stderrJson: { error: { code: "launcher_failed", message: "private-password", details: { reason_code: "gateway_codex_binding_failed", token: "private-token" } } },
    stdout: "private-password", stderr: "private-token"
  });
  assert.equal(receipt.errorCode, "gateway_codex_binding_failed");
  assert.equal(receipt.status, "error");
  assert.equal(receipt.exitCode, 4);
  assert.equal(JSON.stringify(receipt).includes("private-"), false);
  assert.equal(projectGatewayActionReceipt({ stdoutJson: { error: { code: "rate_limited" } } }).errorCode, "rate_limited");
  assert.equal(projectGatewayActionReceipt({ stderrJson: { error: { code: "Bearer private-token" } } }).errorCode, null);
});

test("Gateway diagnostic projector executes in the browser evaluation context", async () => {
  const { projectGatewayActionReceipt } = await import("../../scripts/desktop/preview-smoke.mjs");
  const { runInNewContext } = await import("node:vm");
  const result = runInNewContext("(" + projectGatewayActionReceipt.toString() + ")(receipt)", {
    receipt: { status: "error", exitCode: 4, stderrJson: { error: { code: "launcher_failed", details: { reason_code: "rate_limited" } } } }
  });
  assert.equal(result.errorCode, "rate_limited");
  assert.equal(result.status, "error");
});

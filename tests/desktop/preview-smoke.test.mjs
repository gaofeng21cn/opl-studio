import assert from "node:assert/strict";
import test from "node:test";
import {
  PREVIEW_PRODUCT,
  parsePreviewSmokeArgs,
  parseRuntimeProfiles,
  projectGatewayState,
  redactSecrets,
  runPreviewSmoke
} from "../../scripts/desktop/preview-smoke.mjs";
import { parseInstalledIdentityOutput } from "../../scripts/desktop/qualify-clean-vm.mjs";

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

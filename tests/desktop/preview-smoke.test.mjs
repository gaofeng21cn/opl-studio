import assert from "node:assert/strict";
import test from "node:test";
import {
  PREVIEW_PRODUCT,
  parsePreviewSmokeArgs,
  parseRuntimeProfiles,
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
        inspector: { opened: true, menuItemSelected: true, tabs: true, closed: true }
      };
    }
    if (expression.includes("window.oplStudio.sendMessage")) {
      return { threadId: "thread-1", turnId: "turn-1", completed: "failed", finalMessagePresent: true, simulated: false };
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

import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeAppUpdater,
  createNativeAppUpdaterFromEnvironment
} from "../../plugins/opl-host-core/src/native-app-updater.mjs";

const commandSet = (executable) => ({
  status: { executable, args: ["status", "--json"] },
  check: { executable, args: ["check", "--json"] },
  apply: { executable, args: ["apply", "--json"] },
  restart: { executable, args: ["restart", "--json"] }
});

test("standalone and Docker carriers execute only their fixed command plans", async () => {
  for (const [carrier, host] of [
    ["standalone_headless_webui", "native"],
    ["docker_webui", "web"]
  ]) {
    const calls = [];
    const updater = createNativeAppUpdater({
      carrier,
      currentVersion: "1.0.0",
      commands: commandSet("/opt/one-person-lab/bin/app-update-runner"),
      execute: async (executable, args, options) => {
        calls.push({ executable, args, options });
        return {
          stdout: JSON.stringify({
            schema: "opl_native_app_updater.v1",
            state: args[0] === "check" ? "available" : "applied",
            targetVersion: "1.1.0",
            restartRequired: args[0] === "apply",
            accepted: true
          })
        };
      }
    });

    const result = await updater.perform("check", {
      executable: "/tmp/request-controlled-command",
      args: ["malicious"]
    });
    assert.equal(result.schema, "opl_native_app_updater.v1");
    assert.equal(result.owner, "one-person-lab-app_native_host");
    assert.equal(result.host, host);
    assert.equal(result.operation, "check");
    assert.equal(result.state, "available");
    assert.equal(result.currentVersion, "1.0.0");
    assert.equal(result.targetVersion, "1.1.0");
    assert.deepEqual(calls, [{
      executable: "/opt/one-person-lab/bin/app-update-runner",
      args: ["check", "--json"],
      options: { timeout: 120_000, windowsHide: true }
    }]);
  }
});

test("environment configuration requires one absolute executable and explicit argv for every operation", async () => {
  const calls = [];
  const updater = createNativeAppUpdaterFromEnvironment({
    env: {
      OPL_NATIVE_APP_UPDATE_CARRIER: "docker_webui",
      OPL_NATIVE_APP_UPDATE_EXECUTABLE: "/usr/local/libexec/opl-webui-update",
      OPL_NATIVE_APP_UPDATE_STATUS_ARGS_JSON: '["status","--json"]',
      OPL_NATIVE_APP_UPDATE_CHECK_ARGS_JSON: '["check","--json"]',
      OPL_NATIVE_APP_UPDATE_APPLY_ARGS_JSON: '["apply","--json"]',
      OPL_NATIVE_APP_UPDATE_RESTART_ARGS_JSON: '["recreate","--json"]',
      OPL_NATIVE_APP_UPDATE_CURRENT_VERSION: "2.0.0"
    },
    execute: async (executable, args) => {
      calls.push([executable, args]);
      return {
        stdout: JSON.stringify({
          schema: "opl_native_app_updater.v1",
          state: "recreated",
          currentVersion: "2.1.0",
          restartRequired: false,
          accepted: true
        })
      };
    }
  });

  const result = await updater.perform("restart");
  assert.equal(result.supported, true);
  assert.equal(result.state, "recreated");
  assert.equal(result.currentVersion, "2.1.0");
  assert.deepEqual(calls, [[
    "/usr/local/libexec/opl-webui-update",
    ["recreate", "--json"]
  ]]);

  const incomplete = createNativeAppUpdaterFromEnvironment({
    env: {
      OPL_NATIVE_APP_UPDATE_CARRIER: "standalone_headless_webui",
      OPL_NATIVE_APP_UPDATE_EXECUTABLE: "relative/runner"
    }
  });
  const unsupported = await incomplete.perform("check");
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.state, "unsupported");
  assert.equal(unsupported.reasonCode, "carrier_update_config_invalid");
});

test("an unconfigured WebUI host remains truthfully unsupported", async () => {
  const updater = createNativeAppUpdaterFromEnvironment({ env: {} });
  const result = await updater.perform("check");
  assert.deepEqual(result, {
    schema: "opl_native_app_updater.v1",
    owner: "one-person-lab-app_native_host",
    host: "web",
    operation: "check",
    supported: false,
    state: "unsupported",
    restartRequired: false,
    reasonCode: "native_host_required",
    ownerFallback: "one-person-lab-app"
  });
});

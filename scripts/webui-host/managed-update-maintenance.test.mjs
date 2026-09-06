import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexAppServerTransport } from "./app-server-transport.mjs";
import { createManagedUpdateMaintenance, eligibleBackgroundComponents } from "./managed-update-maintenance.mjs";

const component = (id, safe = true) => ({
  component_id: id,
  auto_apply: { eligible: true, app_background_safe: safe, command_ref: "opl update apply --json" }
});

test("maintenance uses Framework eligibility and never adopts external component owners", () => {
  const plan = { managed_update: { components: [component("opl_base"), component("opl_packages", false), component("opl_app"), component("homebrew")] } };
  assert.deepEqual(eligibleBackgroundComponents(plan).map((item) => item.component_id), ["opl_base"]);
  assert.throws(() => eligibleBackgroundComponents({}), /no components/);
});

test("idle maintenance serializes new requests and defers active tasks and approvals", async () => {
  const transport = new CodexAppServerTransport();
  let release;
  const work = new Promise((resolve) => { release = resolve; });
  const lease = transport.runWhenIdle(() => work);
  let requested = false;
  const request = transport.withActivity(() => { requested = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requested, false);
  assert.equal((await transport.runWhenIdle(() => assert.fail("second writer"))).status, "deferred");
  release();
  await lease;
  await request;
  assert.equal(requested, true);
  transport.activeTurns.add("active-turn");
  assert.equal((await transport.runWhenIdle(() => assert.fail("active turn"))).status, "deferred");
  transport.activeTurns.clear();
  transport.pendingServerRequests.set(1, {});
  assert.equal((await transport.runWhenIdle(() => assert.fail("pending approval"))).status, "deferred");
  transport.pendingServerRequests.clear();
  await transport.close();
  await assert.rejects(transport.withActivity(() => assert.fail("closed transport")), /closed/);
});

test("eligible updates refresh Codex only inside the idle lease and read back Framework status", async () => {
  const calls = [];
  const transport = new CodexAppServerTransport();
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async (operation) => {
      calls.push(operation);
      if (operation === "plan") return { managed_update: { components: [component("opl_packages")] } };
      if (operation === "apply") return { managed_update: {
        execution: { status: "completed" },
        components: [{ component_id: "opl_packages", receipt: { reload_guidance: { reload_recommended: true } } }]
      } };
      return {};
    } },
    codex: { transport, reloadConfiguration: async (options) => {
      assert.equal(options.maintenanceHeld, true);
      assert.ok(transport.maintenance);
      calls.push("reload");
    } },
    now: () => 1234
  });
  const result = await maintenance.runNow();
  assert.equal(result.status, "completed");
  assert.equal(result.lastCompletedAt, 1234);
  assert.deepEqual(calls, ["check", "plan", "apply", "reload", "status"]);
  await maintenance.close();
});

test("busy and failed maintenance remains retryable without advancing the daily receipt", async () => {
  const transport = new CodexAppServerTransport();
  transport.activeTurns.add("running");
  let applied = false;
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: [component("opl_base")] } };
      if (operation === "apply") { applied = true; throw new Error("failed download"); }
      return {};
    } },
    codex: { transport }
  });
  assert.equal((await maintenance.runNow()).status, "deferred");
  assert.equal(applied, false);
  transport.activeTurns.clear();
  const failed = await maintenance.runNow();
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastCompletedAt, null);
  assert.equal(transport.maintenance, null);
  await maintenance.close();
});

test("failed Codex refresh survives restart and retries even when packages are already current", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-recovery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "state.json");
  const transport = new CodexAppServerTransport();
  let updated = false;
  let refreshes = 0;
  const options = {
    stateFile,
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: updated ? [] : [component("opl_packages")] } };
      if (operation === "apply") {
        updated = true;
        return { managed_update: { execution: { status: "completed" }, components: [
          { component_id: "opl_packages", receipt: { reload_guidance: { reload_recommended: true } } }
        ] } };
      }
      return {};
    } },
    codex: { transport, reloadConfiguration: async () => { if (++refreshes === 1) throw new Error("restart failed"); } },
    schedule: () => 1, unschedule: () => {}
  };
  const initial = createManagedUpdateMaintenance(options);
  assert.equal((await initial.runNow()).status, "failed");
  await initial.close();
  const restored = createManagedUpdateMaintenance(options);
  await restored.start();
  assert.equal(restored.snapshot().reloadPending, true);
  const result = await restored.runNow();
  assert.equal(result.status, "completed");
  assert.equal(result.reloadPending, false);
  assert.equal(refreshes, 2);
  await restored.close();
});

import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePageStable } from "../../scripts/desktop/cdp.mjs";

test("stable CDP evaluation anchors a page promise and polls its result", async () => {
  const expressions = [];
  let polls = 0;
  const value = await evaluatePageStable({
    port: 9222,
    expression: "window.oplStudio.readState(\"fast\")",
    timeoutMs: 1_000,
    pollIntervalMs: 0,
    evaluate: async ({ expression }) => {
      expressions.push(expression);
      if (expression.includes('return {status:"missing"}')) {
        polls += 1;
        return polls === 1 ? { status: "pending" } : { status: "fulfilled", value: { profile: "fast" } };
      }
      return true;
    }
  });
  assert.deepEqual(value, { profile: "fast" });
  assert.ok(expressions[0].includes("__oplStudioQualificationRequests"));
  assert.ok(expressions[0].includes('window.oplStudio.readState("fast")'));
  assert.ok(expressions.at(-1).includes("delete store"));
});

test("stable CDP evaluation returns the page-side rejection", async () => {
  await assert.rejects(
    evaluatePageStable({
      port: 9222,
      expression: "window.oplStudio.sendMessage({})",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
      evaluate: async ({ expression }) => expression.includes('return {status:"missing"}')
        ? { status: "rejected", error: { message: "turn failed", code: "turn_failed" } }
        : true
    }),
    (error) => error.message === "turn failed" && error.code === "turn_failed"
  );
});

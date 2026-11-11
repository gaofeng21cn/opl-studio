import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("vendored DSH provenance preserves canonical bytes with Windows autocrlf", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./deepseek-harness-gui-vendor.mjs", import.meta.url)), "check",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "core.autocrlf",
      GIT_CONFIG_VALUE_0: "true",
      GIT_CONFIG_KEY_1: "core.eol",
      GIT_CONFIG_VALUE_1: "crlf",
    },
  });
  assert.equal(result.status, 0, result.stderr);
});

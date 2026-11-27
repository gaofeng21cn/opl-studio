import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test("the local Docker command passes the resolved release inputs to the builder", { skip: process.platform === "win32" }, async (t) => {
  const bin = await mkdtemp(path.join(os.tmpdir(), "opl-local-build-test-"));
  t.after(() => rm(bin, { recursive: true, force: true }));
  const capture = path.join(bin, "args.json");
  await writeFile(path.join(bin, "docker"), `#!/usr/bin/env node
if (process.argv[2] === "info") console.log("aarch64");
else require("node:fs").writeFileSync(process.env.ARGUMENT_CAPTURE, JSON.stringify(process.argv.slice(2)));
`, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    ARGUMENT_CAPTURE: capture,
    OPL_APP_REF: "a".repeat(40),
    OPL_FRAMEWORK_REF: "f".repeat(40),
    OPL_APP_IMAGE: "opl-local-build:test",
    OPL_CODEX_NPM_SPEC: "@openai/codex@1.2.3"
  };
  execFileSync("npm", ["run", "build:docker"], { cwd: root, env, stdio: "pipe" });
  const command = JSON.parse(await readFile(capture, "utf8"));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.deepEqual(command.slice(0, 5), ["build", "--platform", "linux/arm64", "--tag", env.OPL_APP_IMAGE]);
  const args = command.filter((_, index) => command[index - 1] === "--build-arg");
  for (const [key, value] of Object.entries({
    OPL_APP_REF: env.OPL_APP_REF,
    OPL_FRAMEWORK_REF: env.OPL_FRAMEWORK_REF,
    OPL_SOURCE_REVISION: commit,
    OPL_CODEX_NPM_SPEC: env.OPL_CODEX_NPM_SPEC
  })) assert.ok(args.includes(`${key}=${value}`), `missing build input ${key}`);
  const invalid = spawnSync("npm", ["run", "build:docker"], {
    cwd: root, env: { ...env, OPL_CODEX_NPM_SPEC: "@openai/codex@latest" }, encoding: "utf8"
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /exact @openai\/codex version/);
});

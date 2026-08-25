#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fullBuildEnvironment, readFullPayloadCarrier } from "./full-payload.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = process.env.OPL_APP_REPO_ROOT?.trim();
const carrier = readFullPayloadCarrier();
const qualifyOnly = process.argv.includes("--qualify-only");
if (qualifyOnly) {
  process.stdout.write(`${JSON.stringify({ status: "full_contract_qualified", carrier: carrier.carrier_id, app_root: appRoot ? path.resolve(appRoot) : null, studio_root: root }, null, 2)}\n`);
  process.exit(0);
}
if (!appRoot) {
  throw new Error("Studio Full build requires OPL_APP_REPO_ROOT pointing to the canonical one-person-lab-app checkout");
}
const args = ["--experimental-strip-types", path.join(path.resolve(appRoot), "scripts/build-full-first-install-package.ts")];
const result = spawnSync(process.execPath, args, {
  cwd: path.resolve(appRoot),
  env: fullBuildEnvironment({ appRoot, studioRoot: root }),
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(`${JSON.stringify({ status: qualifyOnly ? "full_qualification_delegated" : "full_build_delegated", carrier: carrier.carrier_id, app_root: path.resolve(appRoot), studio_root: root }, null, 2)}\n`);

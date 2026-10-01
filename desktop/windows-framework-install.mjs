import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Framework keeps its existing carrier and update authority during WSL repair.
export function ensureGuestFramework({ payload, installRoot = "/home/opl/.opl/one-person-lab", env = process.env } = {}) {
  const cli = path.join(installRoot, "bin", "opl");
  let existingOwner = false;
  try {
    existingOwner = JSON.parse(fs.readFileSync(path.join(installRoot, "package.json"), "utf8")).name === "opl-framework";
    fs.accessSync(cli, fs.constants.X_OK);
  } catch { existingOwner = false; }
  if (existingOwner) {
    const check = spawnSync(cli, ["--version"], { env, stdio: "ignore", timeout: 60_000 });
    if (check.status !== 0) throw new Error("Existing Framework owner is unavailable; repair it through Framework.");
    return { status: "retained_existing_owner" };
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(payload, "manifest.json"), "utf8"));
  const ref = manifest.bootstrap?.framework_ref;
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error("Framework bootstrap source is unavailable");
  const install = spawnSync("/bin/bash", [path.join(payload, "runtime/opl-install.sh"), "--headless", "--skip-packages"], {
    env: { ...env, OPL_INSTALL_DIR: installRoot, OPL_INSTALL_BRANCH: ref, OPL_INSTALL_SOURCE_MODE: "archive",
      OPL_SOURCE_ARCHIVE_URL: `https://github.com/gaofeng21cn/one-person-lab/archive/${ref}.tar.gz` },
    stdio: "inherit", timeout: 20 * 60_000
  });
  if (install.status !== 0) throw new Error("Framework bootstrap installation failed");
  return { status: "installed" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(ensureGuestFramework({ payload: process.argv[2] })));
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = path.join(repositoryRoot, ".github", "workflows", "additional-carrier-qualification.yml");
const smokePath = path.join(repositoryRoot, "scripts", "smoke-desktop-live.mjs");
const builderPath = path.join(repositoryRoot, "electron-builder.yml");
const nsisMultiUserTemplatePath = path.join(
  repositoryRoot,
  "node_modules",
  "app-builder-lib",
  "templates",
  "nsis",
  "multiUser.nsh"
);
const linuxAfterRemovePath = path.join(repositoryRoot, "scripts", "desktop", "linux-after-remove.sh");

async function workflowSteps() {
  const workflow = YAML.parse(await readFile(workflowPath, "utf8"));
  return workflow.jobs["desktop-distribution"].steps;
}

function stepByName(steps, name) {
  const step = steps.find((candidate) => candidate.name === name);
  assert.ok(step, `missing workflow step: ${name}`);
  return step;
}

test("desktop live smoke prioritizes an explicitly installed executable", () => {
  const missingExecutable = path.join(os.tmpdir(), "opl-installed-smoke-missing", "One Person Lab Preview.exe");
  const result = spawnSync(process.execPath, [smokePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OPL_DESKTOP_EXECUTABLE: missingExecutable,
      OPL_DESKTOP_APP_PATH: path.dirname(missingExecutable)
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`missing packaged executable: ${missingExecutable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("Windows hosted qualification installs, updates, rolls back, and removes the NSIS package", async () => {
  const steps = await workflowSteps();
  const workflow = YAML.parse(await readFile(workflowPath, "utf8"));
  const builder = YAML.parse(await readFile(builderPath, "utf8"));
  const install = stepByName(steps, "Install base Windows NSIS package");
  const baseSmoke = stepByName(steps, "Start base Windows app and read exact version");
  const update = stepByName(steps, "Update Windows NSIS package");
  const updatedSmoke = stepByName(steps, "Start updated Windows app and read exact version");
  const rollback = stepByName(steps, "Roll back Windows NSIS package");
  const rolledBackSmoke = stepByName(steps, "Start rolled-back Windows app and read exact version");
  const cleanup = stepByName(steps, "Uninstall Windows NSIS package and verify cleanup");

  assert.equal(install.if, "matrix.distribution == 'windows'");
  assert.equal(workflow.jobs["desktop-distribution"].env.OPL_DESKTOP_WINDOWS_INSTALL_ID, builder.nsis.guid);
  assert.match(install.run, /Start-Process[^\n]+-ArgumentList '\/S'[^\n]+-Wait/);
  assert.match(install.run, /InstallLocation/);
  assert.match(install.run, /HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall/);
  assert.match(install.run, /OPL_DESKTOP_EXECUTABLE=/);
  assert.match(install.run, /DisplayVersion/);
  assert.match(baseSmoke.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(update.run, /out-target/);
  assert.match(update.run, /OPL_DESKTOP_TARGET_VERSION/);
  assert.match(update.run, /OPL_DESKTOP_STATE_MARKER/);
  assert.match(updatedSmoke.run, /OPL_DESKTOP_TARGET_VERSION/);
  assert.match(rollback.run, /Get-ChildItem -Path out /);
  assert.match(rollback.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(rollback.run, /OPL_DESKTOP_STATE_MARKER/);
  assert.match(rolledBackSmoke.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(cleanup.if, /always\(\)/);
  assert.match(cleanup.run, /OPL_DESKTOP_WINDOWS_INSTALL_ATTEMPTED/);
  assert.match(cleanup.run, /Uninstall One Person Lab Preview\.exe/);
  assert.match(cleanup.run, /left exact product files or registry identity behind/);
  assert.doesNotMatch(cleanup.run, /Get-ChildItem[^\n]+-Recurse/);
});

test("Windows per-user installer bounds the UserProgramFiles copy", async () => {
  const template = await readFile(nsisMultiUserTemplatePath, "utf8");
  assert.match(template, /FOLDERID_UserProgramFiles/);
  assert.match(template, /lstrcpynW\(w \.r0, p r2, i \$\{NSIS_MAX_STRLEN\}\)/);
});

test("Linux hosted qualification installs, updates, rolls back, and purges the DEB package", async () => {
  const steps = await workflowSteps();
  const install = stepByName(steps, "Install base Linux DEB package");
  const baseSmoke = stepByName(steps, "Start base Linux app and read exact version");
  const update = stepByName(steps, "Update Linux DEB package");
  const updatedSmoke = stepByName(steps, "Start updated Linux app and read exact version");
  const rollback = stepByName(steps, "Roll back Linux DEB package");
  const rolledBackSmoke = stepByName(steps, "Start rolled-back Linux app and read exact version");
  const cleanup = stepByName(steps, "Purge Linux DEB package and verify cleanup");

  assert.equal(install.if, "matrix.distribution == 'linux'");
  assert.match(install.run, /sudo apt-get install --no-install-recommends --yes/);
  assert.match(install.run, /unshare --user true/);
  assert.match(install.run, /root:root 755/);
  assert.match(install.run, /root:root 4755/);
  assert.match(install.run, /OPL_DESKTOP_EXECUTABLE=/);
  assert.match(install.run, /dpkg-query -W/);
  assert.match(baseSmoke.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(update.run, /out-target\/\*\.deb/);
  assert.match(update.run, /OPL_DESKTOP_TARGET_VERSION/);
  assert.match(update.run, /OPL_DESKTOP_STATE_MARKER/);
  assert.match(updatedSmoke.run, /OPL_DESKTOP_TARGET_VERSION/);
  assert.match(rollback.run, /--allow-downgrades/);
  assert.match(rollback.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(rollback.run, /OPL_DESKTOP_STATE_MARKER/);
  assert.match(rolledBackSmoke.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(cleanup.if, /always\(\)/);
  assert.match(cleanup.run, /sudo dpkg --purge/);
  assert.match(cleanup.run, /test ! -e "\$OPL_DESKTOP_APP_PATH"/);
});

test("hosted lifecycle reuses bounded user state and validates both package versions", async () => {
  const steps = await workflowSteps();
  const prepare = stepByName(steps, "Prepare lifecycle versions and persistent smoke state");
  const buildTarget = stepByName(steps, "Build unsigned target ${{ matrix.label }} distribution");
  const validate = stepByName(steps, "Validate base and target native package sets");
  const cleanup = stepByName(steps, "Remove lifecycle smoke state");
  const smoke = await readFile(smokePath, "utf8");

  assert.match(prepare.run, /OPL_DESKTOP_BASE_VERSION/);
  assert.match(prepare.run, /OPL_DESKTOP_TARGET_VERSION/);
  assert.match(prepare.run, /OPL_DESKTOP_SMOKE_STATE_ROOT/);
  assert.match(buildTarget.run, /extraMetadata\.version/);
  assert.match(buildTarget.run, /--publish never/);
  assert.match(validate.run, /--out-root out-target/);
  assert.match(validate.run, /--version "\$OPL_DESKTOP_TARGET_VERSION"/);
  assert.match(cleanup.if, /always\(\)/);
  assert.match(cleanup.run, /system temp directory/);
  assert.match(smoke, /OPL_DESKTOP_EXPECTED_VERSION/);
  assert.match(smoke, /windowState\.version/);
  assert.match(smoke, /cwd: isolatedCwd/);
  assert.match(smoke, /DSH_HOME: isolatedDshHome/);
  assert.doesNotMatch(smoke, /cwd: root/);
  assert.match(smoke, /if \(ownsStateRoot\) fs\.rmSync/);
});

test("Linux supports only the DEB native carrier", async () => {
  const builder = YAML.parse(await readFile(builderPath, "utf8"));
  assert.deepEqual(builder.linux.target, ["deb"]);
  assert.equal(builder.appImage, undefined);
});

test("Linux DEB removal unregisters the installed alternative target", async () => {
  const builder = YAML.parse(await readFile(builderPath, "utf8"));
  const afterRemove = await readFile(linuxAfterRemovePath, "utf8");

  assert.equal(builder.deb.afterRemove, "scripts/desktop/linux-after-remove.sh");
  assert.match(afterRemove, /update-alternatives --remove/);
  assert.match(afterRemove, /\/opt\/One Person Lab Preview\/one-person-lab-preview/);
  assert.doesNotMatch(afterRemove, /--remove[^\n]+\/usr\/bin\/one-person-lab-preview/);
});

test("desktop live smoke waits for forced process cleanup before installer removal", async () => {
  const smoke = await readFile(smokePath, "utf8");
  assert.match(smoke, /await waitFor\([\s\S]+forced desktop process exit/);
  assert.match(smoke, /await waitFor\([\s\S]+forced App Server cleanup/);
});

test("installed lifecycle qualification never disables the Chromium sandbox", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.doesNotMatch(source, /--no-sandbox/);
});

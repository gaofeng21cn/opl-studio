import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateDesktopPackage } from "../../scripts/validate-desktop-package.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const version = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).version;

async function artifact(file, { executable = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.alloc(2048, 1));
  if (executable) await chmod(file, 0o755);
}

async function fixture(platform, { arch = "x64", artifactVersion = version } = {}) {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), `opl-${platform}-distribution-`));
  if (platform === "win32") {
    await artifact(path.join(outRoot, "win-unpacked", "resources", "app.asar"));
    await artifact(path.join(outRoot, "win-unpacked", "One Person Lab Preview.exe"));
    await artifact(path.join(outRoot, `one-person-lab-preview-${artifactVersion}-win-x64.exe`));
    await artifact(path.join(outRoot, `one-person-lab-preview-${artifactVersion}-win-x64.zip`));
  } else {
    const unpacked = arch === "x64" ? "linux-unpacked" : `linux-${arch}-unpacked`;
    const debArch = arch === "x64" ? "amd64" : arch;
    await artifact(path.join(outRoot, unpacked, "resources", "app.asar"));
    await artifact(path.join(outRoot, unpacked, "one-person-lab-preview"), { executable: true });
    await artifact(path.join(outRoot, `one-person-lab-preview-${artifactVersion}-linux-${debArch}.deb`));
  }
  return outRoot;
}

test("Windows distribution qualification requires unpacked, NSIS, and ZIP artifacts", async () => {
  const outRoot = await fixture("win32");
  const receipt = validateDesktopPackage({ repositoryRoot, outRoot, platform: "win32", arch: "x64", requireDistribution: true });
  assert.equal(receipt.status, "desktop_package_validated");
  assert.deepEqual(receipt.distributionArtifacts.map((entry) => entry.name), [
    `one-person-lab-preview-${version}-win-x64.exe`,
    `one-person-lab-preview-${version}-win-x64.zip`
  ]);
});

test("Linux distribution qualification requires the unpacked app and DEB carrier", async () => {
  const outRoot = await fixture("linux");
  const receipt = validateDesktopPackage({ repositoryRoot, outRoot, platform: "linux", arch: "x64", requireDistribution: true });
  assert.equal(receipt.status, "desktop_package_validated");
  assert.deepEqual(receipt.distributionArtifacts.map((entry) => entry.name), [
    `one-person-lab-preview-${version}-linux-amd64.deb`
  ]);
});

test("Linux arm64 cross-distribution qualification reads the architecture-specific unpacked app", async () => {
  const outRoot = await fixture("linux", { arch: "arm64" });
  const receipt = validateDesktopPackage({ repositoryRoot, outRoot, platform: "linux", arch: "arm64", requireDistribution: true });
  assert.deepEqual(receipt.distributionArtifacts.map((entry) => entry.name), [
    `one-person-lab-preview-${version}-linux-arm64.deb`
  ]);
});

test("distribution qualification accepts an explicit lifecycle target version", async () => {
  const targetVersion = "0.1.2";
  const outRoot = await fixture("win32", { artifactVersion: targetVersion });
  const receipt = validateDesktopPackage({
    repositoryRoot,
    outRoot,
    platform: "win32",
    arch: "x64",
    version: targetVersion,
    requireDistribution: true
  });
  assert.deepEqual(receipt.distributionArtifacts.map((entry) => entry.name), [
    `one-person-lab-preview-${targetVersion}-win-x64.exe`,
    `one-person-lab-preview-${targetVersion}-win-x64.zip`
  ]);
});

test("platform qualification fails closed when one native distribution artifact is absent", async () => {
  const outRoot = await fixture("win32");
  await rm(path.join(outRoot, `one-person-lab-preview-${version}-win-x64.zip`));
  assert.throws(
    () => validateDesktopPackage({ repositoryRoot, outRoot, platform: "win32", arch: "x64", requireDistribution: true }),
    /artifact is missing/
  );
});

test("Linux hosted live smoke prepares the Chromium sandbox without disabling it", async () => {
  const workflow = await readFile(path.join(repositoryRoot, ".github", "workflows", "additional-carrier-qualification.yml"), "utf8");
  assert.match(workflow, /sudo chown root:root out\/linux-unpacked\/chrome-sandbox/);
  assert.match(workflow, /sudo chmod 4755 out\/linux-unpacked\/chrome-sandbox/);
  assert.doesNotMatch(workflow, /--no-sandbox/);
});

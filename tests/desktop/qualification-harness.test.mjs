import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import { verifyPreviewIdentity } from "../../scripts/desktop/preview-smoke.mjs";
import {
  waitForVmIp,
  buildGuestLaunchCommand,
  prepareRunnerTrustBundle,
  parseArgs as parseCleanVmArgs
} from "../../scripts/desktop/qualify-clean-vm.mjs";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

test("clean VM hands verified runner trust to the launched App and child processes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-vm-trust-"));
  try {
    const trust = await prepareRunnerTrustBundle(directory, (kind) => kind === "system" ? ["system-ca", "shared-ca"] : ["default-ca", "shared-ca"]);
    assert.equal(fs.readFileSync(trust.file, "utf8"), "default-ca\nshared-ca\nsystem-ca");
    assert.equal(trust.certificateCount, 3);
    assert.equal(fs.statSync(trust.file).mode & 0o777, 0o600);
    assert.equal(trust.tlsVerificationDisabled, false);
    const app = path.join(directory, "fake App");
    const result = path.join(directory, "environment");
    const caBundle = path.join(directory, "guest's CA.pem");
    fs.writeFileSync(app, `#!/bin/sh\n/bin/sh -c 'printf "%s\\n%s\\n%s" "$NODE_EXTRA_CA_CERTS" "$SSL_CERT_FILE" "${'$'}{NODE_TLS_REJECT_UNAUTHORIZED-unset}"' > "$TRUST_RESULT"\n`, { mode: 0o700 });
    const launch = buildGuestLaunchCommand({ appExecutable: app, logPath: path.join(directory, "app.log"), caBundle });
    const env = { ...process.env, TRUST_RESULT: result };
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    const child = spawnSync("/bin/sh", ["-c", `${launch}\nwait`], { env, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(fs.readFileSync(result, "utf8"), `${caBundle}\n${caBundle}\nunset`);
    assert.equal(await prepareRunnerTrustBundle(directory, () => []), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("clean VM and Gateway qualification remain candidate-only surfaces", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const cleanVm = fs.readFileSync(path.join(root, "scripts/desktop/qualify-clean-vm.mjs"), "utf8");
  const previewSmoke = fs.readFileSync(path.join(root, "scripts/desktop/preview-smoke.mjs"), "utf8");
  const gateway = fs.readFileSync(path.join(root, "scripts/desktop/diagnose-gateway-credential-persistence.mjs"), "utf8");

  assert.equal(packageJson.scripts["qualify:desktop:clean-vm"], "node scripts/desktop/qualify-clean-vm.mjs");
  assert.equal(packageJson.scripts["diagnose:gateway:persistence"], "node scripts/desktop/diagnose-gateway-credential-persistence.mjs");
  assert.match(cleanVm, /cleanVmReady: false/);
  assert.match(cleanVm, /releaseReady: false/);
  assert.match(cleanVm, /activeShellAdopted: false/);
  assert.match(cleanVm, /--attach/);
  assert.match(cleanVm, /verifyPreviewIdentity/);
  assert.match(previewSmoke, /readbackStderr/);
  assert.match(previewSmoke, /appServerErrors/);
  assert.match(previewSmoke, /OPL_Framework_runtime_readback_not_proven_in_clean_VM/);
  assert.equal(packageJson.scripts["smoke:preview"], "node scripts/desktop/preview-smoke.mjs");
  assert.match(gateway, /credentials\.json/);
  assert.match(gateway, /sha256/);
  assert.match(gateway, /mode0600After/);
  assert.match(gateway, /window\.oplStudio\.readState/);
});

test("attach identity is unavailable without an app path and does not self-certify", async () => {
  const identity = await verifyPreviewIdentity({ appPath: path.join(root, "missing-preview.app") });
  assert.equal(identity.status, "unavailable");
  assert.equal(identity.actual.productName, null);
  assert.equal(identity.actual.bundleId, null);
});

test("clean VM preserves explicit smoke and receipt paths", () => {
  const options = parseCleanVmArgs([
    "--attach",
    "--cdp-port", "9334",
    "--out", "out/custom-clean-vm.json",
    "--screenshots-dir", "out/screenshots",
    "--runtime-profiles", "standard"
  ]);
  assert.equal(options.attach, true);
  assert.equal(options.cdpPort, 9334);
  assert.equal(options.outPath, path.resolve(root, "out/custom-clean-vm.json"));
  assert.equal(options.screenshotsDir, path.resolve(root, "out/screenshots"));
  assert.deepEqual(options.runtimeProfiles, ["standard"]);
});

test("clean VM accepts an optional exact external Codex platform package", () => {
  const options = parseCleanVmArgs([
    "--attach",
    "--codex-platform-package-tarball", "fixtures/openai-codex-darwin-arm64.tgz",
    "--codex-version", "0.147.0"
  ]);
  assert.equal(options.codexPlatformPackageTarball, path.resolve(root, "fixtures/openai-codex-darwin-arm64.tgz"));
  assert.equal(options.codexVersion, "0.147.0");
});

test("clean VM keeps external Codex preparation optional for legacy invocations", () => {
  const options = parseCleanVmArgs(["--attach"]);
  assert.equal(options.codexPlatformPackageTarball, null);
  assert.equal(options.codexVersion, null);
  assert.equal(options.allowActions, false);
});

test("clean VM enables action execution only with an explicit non-attach opt-in", () => {
  const readOnly = buildGuestLaunchCommand({
    appExecutable: "/Applications/One Person Lab Preview.app/Contents/MacOS/One Person Lab Preview",
    logPath: "/tmp/preview.log"
  });
  assert.doesNotMatch(readOnly, /OPL_NATIVE_WORKBENCH_READ_ONLY=0/);

  const options = parseCleanVmArgs(["--allow-actions"]);
  assert.equal(options.allowActions, true);
  const enabled = buildGuestLaunchCommand({
    appExecutable: "/Applications/One Person Lab Preview.app/Contents/MacOS/One Person Lab Preview",
    logPath: "/tmp/preview.log",
    codexBinary: "/tmp/codex/bin/codex",
    allowActions: options.allowActions
  });
  assert.match(enabled, /OPL_CODEX_BIN='\/tmp\/codex\/bin\/codex'/);
  assert.match(enabled, /OPL_NATIVE_WORKBENCH_READ_ONLY=0/);
  assert.match(enabled, /nohup/);
});

test("clean VM rejects action execution in attach mode", () => {
  assert.throws(
    () => parseCleanVmArgs(["--attach", "--allow-actions"]),
    /cannot be used with --attach/
  );
});

test("clean VM rejects a partial external Codex identity", () => {
  assert.throws(
    () => parseCleanVmArgs(["--attach", "--codex-version", "0.147.0"]),
    /must be provided together/
  );
});

test("clean VM binds exact Framework source inputs for Standard bootstrap", () => {
  const options = parseCleanVmArgs([
    "--framework-source-archive", "fixtures/one-person-lab-framework.tar.gz",
    "--framework-ref", "1f57e11848d1ac832f4550dcf17ac354a2af43a3"
  ]);
  assert.equal(options.frameworkSourceArchive, path.resolve(root, "fixtures/one-person-lab-framework.tar.gz"));
  assert.equal(options.frameworkRef, "1f57e11848d1ac832f4550dcf17ac354a2af43a3");

  const command = buildGuestLaunchCommand({
    appExecutable: "/Applications/One Person Lab Preview.app/Contents/MacOS/One Person Lab Preview",
    logPath: "/tmp/preview.log",
    frameworkSourceArchive: "/tmp/framework.tar.gz",
    frameworkRef: options.frameworkRef
  });
  assert.match(command, /OPL_SOURCE_ARCHIVE_URL='file:\/\/\/tmp\/framework\.tar\.gz'/);
  assert.match(command, /OPL_FRAMEWORK_SOURCE_COMMIT='1f57e11848d1ac832f4550dcf17ac354a2af43a3'/);
});

test("clean VM rejects partial or attach-mode Framework source preparation", () => {
  assert.throws(
    () => parseCleanVmArgs(["--framework-ref", "1f57e11848d1ac832f4550dcf17ac354a2af43a3"]),
    /must be provided together/
  );
  assert.throws(
    () => parseCleanVmArgs([
      "--attach",
      "--framework-source-archive", "fixtures/framework.tar.gz",
      "--framework-ref", "1f57e11848d1ac832f4550dcf17ac354a2af43a3"
    ]),
    /cannot be used with --attach/
  );
});


test("a failed Tart process reports its startup cause without waiting for DHCP", async () => {
  const child = spawn(process.execPath, ["-e", "process.stderr.write('maximum supported VM count exceeded');process.exit(2)"], { stdio: ["ignore", "ignore", "pipe"] });
  await assert.rejects(waitForVmIp("fixture-vm", { vmProcess: child, timeoutMs: 1000, pollMs: 10,
    readIp: () => ({ status: 1, stdout: "" }) }), /Tart failed to start fixture-vm: maximum supported VM count exceeded/);
});

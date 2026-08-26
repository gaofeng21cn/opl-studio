import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capturePageScreenshot, evaluatePage, waitForPageReady } from "./cdp.mjs";
import {
  PREVIEW_PRODUCT,
  loadPreviewSmokeInputs,
  parsePreviewSmokeArgs,
  redactSecrets,
  runPreviewSmoke,
  verifyPreviewIdentity
} from "./preview-smoke.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const studioVersion = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).version;
const defaultSourceVm = process.env.OPL_STUDIO_CLEAN_VM_SOURCE || "opl-first-run-no-clt-clean-base-26-5-18";
const defaultGuestUser = process.env.OPL_STUDIO_CLEAN_VM_USER || "admin";
const defaultSshKey = process.env.OPL_STUDIO_CLEAN_VM_SSH_KEY || path.join(os.homedir(), ".ssh", "opl_first_run_tart_ed25519");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseInstalledIdentityOutput(value) {
  return JSON.parse(String(value).replace(/\r?\n/g, ""));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

export function parseArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanOptions = {
    sourceVm: defaultSourceVm,
    dmg: path.join(repositoryRoot, "out", `one-person-lab-preview-${studioVersion}-mac-arm64.dmg`),
    guestUser: defaultGuestUser,
    sshKey: defaultSshKey,
    vmName: `opl-studio-clean-${stamp}`,
    outPath: path.join(repositoryRoot, "out", "studio-clean-vm-qualification.json"),
    keepVm: false,
    skipClone: false,
    attach: false,
    codexPlatformPackageTarball: null,
    codexVersion: null
  };
  const smokeArgv = [];
  const takeValue = (arg, index) => {
    const value = argv[index + 1];
    invariant(value, `missing value for ${arg}`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep-vm") { cleanOptions.keepVm = true; continue; }
    if (arg === "--skip-clone") { cleanOptions.skipClone = true; continue; }
    if (arg === "--attach") { cleanOptions.attach = true; continue; }
    if (arg === "--source-vm") { cleanOptions.sourceVm = takeValue(arg, index); index += 1; continue; }
    if (arg === "--dmg") { cleanOptions.dmg = path.resolve(takeValue(arg, index)); index += 1; continue; }
    if (arg === "--guest-user") { cleanOptions.guestUser = takeValue(arg, index); index += 1; continue; }
    if (arg === "--ssh-key") { cleanOptions.sshKey = path.resolve(takeValue(arg, index)); index += 1; continue; }
    if (arg === "--vm-name") { cleanOptions.vmName = takeValue(arg, index); index += 1; continue; }
    if (arg === "--out") { cleanOptions.outPath = path.resolve(takeValue(arg, index)); index += 1; continue; }
    if (arg === "--codex-platform-package-tarball") {
      cleanOptions.codexPlatformPackageTarball = path.resolve(takeValue(arg, index));
      index += 1;
      continue;
    }
    if (arg === "--codex-version") {
      cleanOptions.codexVersion = takeValue(arg, index).trim();
      invariant(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(cleanOptions.codexVersion), "--codex-version must be a package version");
      index += 1;
      continue;
    }
    if (["--require-gateway-setup", "--require-codex-turn"].includes(arg)) { smokeArgv.push(arg); continue; }
    if (["--carrier", "--product-name", "--bundle-id", "--cdp-port", "--runtime-profiles", "--gateway-credentials-file", "--codex-turn-hook-file", "--codex-turn-prompt", "--timeout-ms", "--app-path", "--screenshots-dir"].includes(arg)) {
      const value = takeValue(arg, index);
      index += 1;
      smokeArgv.push(arg, value);
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  const smokeOptions = parsePreviewSmokeArgs(smokeArgv, {
    env: {
      ...process.env,
      OPL_STUDIO_CDP_PORT: process.env.OPL_STUDIO_CDP_PORT || String(19222 + (process.pid % 500))
    }
  });
  invariant(
    Boolean(cleanOptions.codexPlatformPackageTarball) === Boolean(cleanOptions.codexVersion),
    "--codex-platform-package-tarball and --codex-version must be provided together"
  );
  return {
    ...cleanOptions,
    ...smokeOptions,
    outPath: smokeOptions.outPath ?? cleanOptions.outPath
  };
}

function run(executable, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(executable)} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function sshArgs(options, ip, command) {
  return ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=8", "-i", options.sshKey, `${options.guestUser}@${ip}`, command];
}

function guestRun(options, ip, command, { allowFailure = false } = {}) {
  return run("ssh", sshArgs(options, ip, command), { allowFailure });
}

function scpToGuest(options, ip, source, target) {
  return run("scp", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-i", options.sshKey, source, `${options.guestUser}@${ip}:${target}`]);
}

async function waitForIp(vmName, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run("tart", ["ip", vmName], { allowFailure: true });
    const ip = result.stdout.trim();
    if (result.status === 0 && ip) return ip;
    await delay(2_000);
  }
  throw new Error(`timed out waiting for Tart IP for ${vmName}`);
}

async function qualifyCleanVm(options) {
  invariant(options.attach || process.platform === "darwin", "Studio clean VM qualification requires macOS host");
  invariant(Number.isInteger(options.cdpPort) && options.cdpPort > 1024, "CDP port must be a valid host port");
  if (!options.attach) {
    await stat(options.dmg);
    await stat(options.sshKey);
    if (options.codexPlatformPackageTarball) await stat(options.codexPlatformPackageTarball);
  }
  const runRoot = await mkdtemp(path.join(os.tmpdir(), "opl-studio-clean-vm-"));
  const productName = options.productName || PREVIEW_PRODUCT.productName;
  const bundleId = options.bundleId || PREVIEW_PRODUCT.bundleId;
  const guestDmg = `/tmp/opl-studio-clean-${process.pid}.dmg`;
  const guestCodexTarball = `/tmp/opl-studio-clean-${process.pid}-codex.tgz`;
  const guestCodexRoot = `/tmp/opl-studio-clean-${process.pid}-codex`;
  const guestCodexBinary = `${guestCodexRoot}/package/vendor/aarch64-apple-darwin/bin/codex`;
  const guestApp = `/Applications/${productName}.app`;
  const guestLog = `/tmp/opl-studio-clean-${process.pid}.log`;
  let tartProcess;
  let tunnel;
  let ip = null;
  let smokeInputs = { credentials: null, turnRequest: null };
  const checks = {
    codex: options.codexPlatformPackageTarball
      ? {
        status: options.attach ? "skipped" : "pending",
        reason: options.attach ? "attach_mode_does_not_prepare_guest_codex" : null,
        platform: "darwin-arm64",
        package: "@openai/codex-darwin-arm64",
        expectedVersion: options.codexVersion,
        source: path.basename(options.codexPlatformPackageTarball),
        binary: "<guest-temp>/package/vendor/aarch64-apple-darwin/bin/codex",
        injectedVia: "OPL_CODEX_BIN",
        bundleIncluded: false
      }
      : {
        status: "skipped",
        reason: "external_codex_not_provided",
        platform: null,
        package: null,
        expectedVersion: null,
        source: null,
        binary: null,
        injectedVia: null,
        bundleIncluded: false
      }
  };
  try {
    if (!options.attach) {
      if (!options.skipClone) run("tart", ["clone", options.sourceVm, options.vmName]);
      tartProcess = spawn("tart", ["run", "--no-graphics", options.vmName], { stdio: "ignore" });
      ip = await waitForIp(options.vmName);
      checks.vm = { source: options.sourceVm, clone: options.vmName, ip, started: true };

      scpToGuest(options, ip, options.dmg, guestDmg);
      const install = guestRun(options, ip, [
        "set -e",
        `test ! -e ${JSON.stringify(guestApp)}`,
        `mkdir -p /tmp/opl-studio-clean-${process.pid}/mount`,
        `hdiutil attach -nobrowse -readonly -mountpoint /tmp/opl-studio-clean-${process.pid}/mount ${JSON.stringify(guestDmg)} >/dev/null`,
        `ditto "/tmp/opl-studio-clean-${process.pid}/mount/${productName}.app" ${JSON.stringify(guestApp)}`,
        `hdiutil detach /tmp/opl-studio-clean-${process.pid}/mount >/dev/null`,
        `printf '{"version":"' && plutil -extract CFBundleShortVersionString raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} && printf '\",\"productName\":\"' && (plutil -extract CFBundleDisplayName raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} || plutil -extract CFBundleName raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} ) && printf '\",\"bundleId\":\"' && plutil -extract CFBundleIdentifier raw -o - ${JSON.stringify(`${guestApp}/Contents/Info.plist`)} && printf '\"}'`
      ].join(" && "));
      let installIdentity;
      try { installIdentity = parseInstalledIdentityOutput(install.stdout); } catch { installIdentity = null; }
      checks.install = {
        passed: installIdentity?.productName === productName && installIdentity?.bundleId === bundleId,
        version: installIdentity?.version ?? null,
        app: guestApp,
        identity: installIdentity
      };
      invariant(checks.install.passed, `installed Preview identity mismatch: ${JSON.stringify(installIdentity)}`);

      if (options.codexPlatformPackageTarball) {
        scpToGuest(options, ip, options.codexPlatformPackageTarball, guestCodexTarball);
        const expectedVersion = `codex-cli ${options.codexVersion}`;
        const verifyCodex = guestRun(options, ip, [
          "set -eu",
          `rm -rf ${shellQuote(guestCodexRoot)}`,
          `mkdir -p ${shellQuote(guestCodexRoot)}`,
          `tar -xzf ${shellQuote(guestCodexTarball)} -C ${shellQuote(guestCodexRoot)}`,
          `codex_bin=${shellQuote(guestCodexBinary)}`,
          'test -x "$codex_bin"',
          'actual_version="$($codex_bin --version)"',
          `test "$actual_version" = ${shellQuote(expectedVersion)}`,
          'printf "%s" "$actual_version"'
        ].join(" && "));
        const actualVersion = verifyCodex.stdout.trim();
        checks.codex = {
          ...checks.codex,
          status: actualVersion === expectedVersion ? "passed" : "partial",
          verifiedVersion: actualVersion,
          preparation: "scp_tarball_tar_extract_guest_temp",
          binaryExecutable: true
        };
        invariant(actualVersion === expectedVersion, `external Codex version mismatch: expected ${expectedVersion}, got ${actualVersion || "<empty>"}`);
      }

      const launch = [
        options.codexPlatformPackageTarball ? `OPL_CODEX_BIN=${shellQuote(guestCodexBinary)}` : null,
        "nohup",
        shellQuote(`${guestApp}/Contents/MacOS/${productName}`),
        "--disable-gpu",
        "--remote-debugging-port=9222",
        "--remote-debugging-address=127.0.0.1",
        `>${shellQuote(guestLog)}`,
        "2>&1",
        "& echo $!"
      ].filter(Boolean).join(" ");
      guestRun(options, ip, launch);
      tunnel = spawn("ssh", ["-N", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-i", options.sshKey, "-L", `${options.cdpPort}:127.0.0.1:9222`, `${options.guestUser}@${ip}`], { stdio: "ignore" });
    }
    await waitForPageReady({ port: options.cdpPort, timeoutMs: 45_000 });
    smokeInputs = await loadPreviewSmokeInputs(options);
    const identity = options.attach
      ? (options.appPath
        ? await verifyPreviewIdentity({ appPath: options.appPath, productName: options.productName, bundleId: options.bundleId })
        : {
          status: "unavailable",
          reason: "app_path_not_provided",
          expected: { productName: options.productName, bundleId: options.bundleId },
          actual: { productName: null, bundleId: null }
        })
      : {
        status: checks.install?.passed === true ? "passed" : "partial",
        expected: { productName: options.productName, bundleId: options.bundleId },
        actual: checks.install?.identity ?? null,
        app: guestApp
      };
    const smoke = await runPreviewSmoke({
      evaluate: (expression) => evaluatePage({ port: options.cdpPort, expression, timeoutMs: options.timeoutMs }),
      waitForReady: () => waitForPageReady({ port: options.cdpPort, timeoutMs: options.timeoutMs }),
      options: {
        ...options,
        captureScreenshot: options.screenshotsDir
          ? async (name) => {
            await mkdir(options.screenshotsDir, { recursive: true });
            await writeFile(path.join(options.screenshotsDir, `${name}.png`), await capturePageScreenshot({ port: options.cdpPort, timeoutMs: options.timeoutMs }));
          }
          : null
      },
      credentials: smokeInputs.credentials,
      turnRequest: smokeInputs.turnRequest,
      identity
    });
    checks.smoke = smoke;
    checks.startup = smoke.checks.startup;
    checks.runtime = smoke.checks.runtime;
    checks.gateway = smoke.checks.gateway;
    checks.update = {
      status: await evaluatePage({ port: options.cdpPort, expression: "window.oplStudio.readNativeAppUpdateStatus()", timeoutMs: options.timeoutMs }),
      publicFeedChecked: false,
      reason: "clean_vm_harness_does_not_mutate_or_require_public_release"
    };
  } catch (error) {
    const secretValues = [smokeInputs?.credentials?.email, smokeInputs?.credentials?.password, smokeInputs?.turnRequest?.prompt].filter(Boolean);
    checks.failure = { detail: redactSecrets(error instanceof Error ? error.message : String(error), secretValues) };
    if (ip) checks.guestLog = redactSecrets(guestRun(options, ip, `tail -120 ${guestLog}`, { allowFailure: true }).stdout, secretValues);
  } finally {
    if (tunnel && tunnel.exitCode === null) tunnel.kill("SIGTERM");
    if (!options.keepVm && tartProcess && tartProcess.exitCode === null) tartProcess.kill("SIGTERM");
    if (!options.attach && !options.keepVm) run("tart", ["stop", options.vmName], { allowFailure: true });
    if (!options.attach && !options.keepVm) run("tart", ["delete", options.vmName], { allowFailure: true });
    await rm(runRoot, { recursive: true, force: true });
  }
  const status = checks.failure ? "partial" : checks.smoke?.status === "passed" ? "passed" : "partial";
  const receipt = {
    schema: "opl_studio_macos_clean_vm_qualification.v1",
    status,
    candidate: "opl-studio",
    carrier: options.carrier,
    package: { dmg: options.dmg, bundleIdentifier: bundleId, productName },
    checks,
    cleanVmReady: false,
    releaseReady: false,
    activeShellAdopted: false,
    blockers: [
      ...(checks.failure ? ["clean_vm_execution_incomplete"] : []),
      ...(checks.smoke?.blockers ?? []),
      "App_owner_clean_VM_release_admission_is_separate_from_Studio_candidate_qualification"
    ]
  };
  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const receipt = await qualifyCleanVm(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status !== "passed") process.exitCode = 2;
}

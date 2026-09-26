import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as parseCleanArgs, qualifyCleanVm } from "./qualify-clean-vm.mjs";
import { runStableSmoke, STABLE_PRODUCT } from "./stable-smoke.mjs";

function invariant(condition, message) { if (!condition) throw new Error(message); }
const quote = (value) => `'${String(value).replaceAll("'", "'\"'\"'")}'`;

export function parseStableArgs(argv) {
  const own = { artifacts: null, expectedSha256: null, expectedVersion: null, expectedTeamId: null, accountEmailFile: null, accountPasswordFile: null, productProfile: null, runtimeProfile: "standard", channel: "stable", requireGatekeeper: false };
  const forwarded = [];
  const keys = { "--artifacts": "artifacts", "--expected-sha256": "expectedSha256", "--expected-version": "expectedVersion", "--expected-team-id": "expectedTeamId", "--gateway-account-email-file": "accountEmailFile", "--gateway-account-password-file": "accountPasswordFile", "--runtime-profile": "runtimeProfile", "--product-profile": "productProfile", "--channel": "channel" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--require-gatekeeper") { own.requireGatekeeper = true; continue; }
    invariant(!["--attach", "--skip-clone", "--require-codex-turn", "--codex-turn-hook-file", "--codex-turn-prompt", "--product-name", "--bundle-id", "--runtime-profiles"].includes(arg), `Stable qualification forbids ${arg}`);
    if (keys[arg]) { invariant(argv[index + 1], `Missing value for ${arg}`); own[keys[arg]] = argv[++index]; }
    else forwarded.push(arg);
  }
  invariant(own.artifacts && own.accountEmailFile && own.accountPasswordFile, "Artifact directory and dedicated Gateway credential files are required");
  invariant(own.productProfile, "App-owned Official Profile source is required");
  invariant(/^(sha256:)?[a-f0-9]{64}$/.test(own.expectedSha256 ?? ""), "Exact candidate SHA-256 is required");
  invariant(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(own.expectedVersion ?? ""), "Exact installed machine version is required");
  invariant(/^[A-Z0-9]{10}$/.test(own.expectedTeamId ?? ""), "Expected Developer ID team is required");
  invariant(["stable", "nightly"].includes(own.channel), "Unsupported qualification channel");
  if (own.channel === "nightly") {
    invariant(/^\d+\.\d+\.\d+-nightly\.[1-9]\d*$/.test(own.expectedVersion), "Nightly qualification requires an exact Nightly machine version");
    invariant(own.runtimeProfile === "standard" && !own.requireGatekeeper, "Nightly qualification is Standard preview only");
  } else {
    invariant(own.requireGatekeeper, "Stable qualification requires Gatekeeper with quarantine preserved");
  }
  invariant(["standard", "full"].includes(own.runtimeProfile), "Unsupported runtime profile");
  const artifacts = path.resolve(own.artifacts);
  const clean = parseCleanArgs([...forwarded, "--product-name", STABLE_PRODUCT.productName, "--bundle-id", STABLE_PRODUCT.bundleId, "--runtime-profiles", own.runtimeProfile, "--out", path.join(artifacts, "studio-clean-vm-qualification.json")]);
  invariant(clean.codexPlatformPackageTarball && clean.codexVersion, "Exact frozen Codex binary is required for protocol readiness");
  return { ...clean, ...own, artifacts, expectedSha256: own.expectedSha256.replace(/^sha256:/, ""), allowActions: true, requireGatewaySetup: true, requireCodexTurn: false, codexTurnPrompt: null, codexTurnHookFile: null };
}

export function buildDistributionCommand({ guestApp, expectedTeamId, requireGatekeeper }) {
  const app = quote(guestApp);
  return [
    "set -eu",
    `/usr/bin/codesign --verify --deep --strict --verbose=2 ${app}`,
    `signing=$(/usr/bin/codesign -dvv ${app} 2>&1)`,
    `printf '%s\\n' "$signing" | /usr/bin/grep -Fqx ${quote(`TeamIdentifier=${expectedTeamId}`)}`,
    `printf '%s\\n' "$signing" | /usr/bin/grep -Fq 'Authority=Developer ID Application:'`,
    ...(requireGatekeeper ? [
      `/usr/bin/xattr -w com.apple.quarantine '0083;00000000;OPL-Release-Qualification;' ${app}`,
      `/usr/bin/xattr -p com.apple.quarantine ${app} >/dev/null`,
      `/usr/sbin/spctl --assess --type execute --verbose=2 ${app}`
    ] : []),
    "printf 'OPL_DISTRIBUTION_VERIFIED\\n'"
  ].join(" && ");
}

export function buildStableSummary(options, receipt, error = null) {
  const smoke = receipt?.checks?.smoke;
  const distribution = receipt?.checks?.distribution;
  const nightly = options.channel === "nightly";
  const distributionPassed = nightly
    ? distribution?.qualificationChannel === "nightly" && distribution?.candidateDigestVerified === true
    : distribution?.signatureVerified === true && distribution?.stapledDmgNotarizationVerifiedOnHost === true && distribution?.gatekeeperAccepted === true;
  const passed = !error && receipt?.status === "passed" && smoke?.status === "passed" && distribution?.status === "passed"
    && distributionPassed && distribution.installedVersion === options.expectedVersion;
  return {
    schema: nightly ? "opl_studio_nightly_clean_vm.v1" : "opl_studio_stable_clean_vm.v1", surface_id: "opl_tart_gui_first_run_smoke", status: passed ? "passed" : "failed",
    shell: "opl-studio", source_vm: options.sourceVm, smoke_profile: "no-clt-clean-vm", runtime_profile: options.runtimeProfile,
    framework_source_archive: options.frameworkSourceArchive ?? null,
    artifact: { path: options.dmg, sha256: options.expectedSha256, expected_version: options.expectedVersion },
    settings_smoke: { status: smoke?.status === "passed" ? "passed" : "failed", evidence: "artifacts/smoke-summary.json", runtime_refresh: smoke?.checks?.runtimeRefresh ?? null },
    distribution: distribution ?? null,
    generation_requested: false,
    temporal_service_supervisor_proof: receipt?.checks?.temporal_service_supervisor_proof ?? null,
    failure: passed ? null : { stage: "studio_clean_vm", message: error?.message ?? receipt?.checks?.failure?.detail ?? "Studio clean VM checks did not pass" },
    studio_qualification: "studio-clean-vm-qualification.json"
  };
}

export async function runStableCleanVm(options) {
  await mkdir(path.join(options.artifacts, "artifacts"), { recursive: true });
  const transient = await mkdtemp(path.join(os.tmpdir(), "opl-stable-vm-credentials-"));
  let receipt = null;
  let failure = null;
  try {
    const digest = createHash("sha256").update(await readFile(options.dmg)).digest("hex");
    invariant(digest === options.expectedSha256, "Candidate DMG digest differs from the frozen build cohort");
    const productProfileBytes = await readFile(options.productProfile);
    const profile = JSON.parse(productProfileBytes);
    const roots = profile.official_profile?.desired_root_package_ids;
    invariant(Array.isArray(roots) && roots.length > 0 && roots.every((id) => typeof id === "string" && id.length > 0) && new Set(roots).size === roots.length, "App Official Profile roots are invalid");
    if (options.channel !== "nightly") {
      const staple = spawnSync("/usr/bin/xcrun", ["stapler", "validate", options.dmg], { encoding: "utf8" });
      invariant(staple.status === 0, "Exact candidate DMG stapled notarization is not valid");
    }
    const credentials = { email: (await readFile(options.accountEmailFile, "utf8")).trim(), password: await readFile(options.accountPasswordFile, "utf8") };
    invariant(credentials.email && credentials.password, "Dedicated Gateway credentials are empty");
    const credentialsFile = path.join(transient, "account.json");
    await writeFile(credentialsFile, JSON.stringify(credentials), { mode: 0o600 });
    receipt = await qualifyCleanVm({
      ...options,
      expectedRootPackageIds: roots,
      gatewayCredentialsFile: credentialsFile,
      runSmoke: runStableSmoke,
      verifyInstalledApp: async ({ guestRun, guestApp, identity }) => {
        invariant(identity?.version === options.expectedVersion, "Installed machine version differs from the exact candidate");
        if (options.channel === "nightly") {
          return { status: "passed", qualificationChannel: "nightly", candidateDigestVerified: true, bundleId: identity.bundleId, productName: identity.productName, installedVersion: identity.version, developerIdTeam: null, signatureVerified: null, stapledDmgNotarizationVerifiedOnHost: null, gatekeeperAccepted: null };
        }
        const result = guestRun(buildDistributionCommand({ guestApp, expectedTeamId: options.expectedTeamId, requireGatekeeper: options.requireGatekeeper }));
        invariant(result.stdout.includes("OPL_DISTRIBUTION_VERIFIED"), "Installed signature/notarization validation did not finish");
        return { status: "passed", bundleId: identity.bundleId, productName: identity.productName, installedVersion: identity.version, developerIdTeam: options.expectedTeamId, signatureVerified: true, stapledDmgNotarizationVerifiedOnHost: true, gatekeeperAccepted: options.requireGatekeeper };
      }
    });
    receipt.appProductProfileSha256 = createHash("sha256").update(productProfileBytes).digest("hex");
    if (receipt.checks?.smoke) await writeFile(path.join(options.artifacts, "artifacts", "smoke-summary.json"), `${JSON.stringify(receipt.checks.smoke, null, 2)}\n`);
  } catch (error) { failure = error; }
  finally { await rm(transient, { recursive: true, force: true }); }
  const summary = buildStableSummary(options, receipt, failure);
  await writeFile(path.join(options.artifacts, "tart-smoke-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await runStableCleanVm(parseStableArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status !== "passed") process.exitCode = 1;
}

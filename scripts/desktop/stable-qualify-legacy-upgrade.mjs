import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { qualifyUpgradeVm } from "./stable-upgrade-vm.mjs";
import { runStableSmoke, validateStableRuntimeEvidence } from "./stable-smoke.mjs";
import { evaluatePageStable, waitForPageReady } from "./cdp.mjs";

// v26.8.8 is the oldest retained public arm64 Stable with the legacy
// latest-arm64 feed/check-on-start behavior; v26.9.23 is the immediate
// predecessor. Earlier retained source tags do not have downloadable original
// arm64 bytes in the public release and require a separate archived artifact.
export const LEGACY_BASELINE_TAGS = Object.freeze(["v26.8.8", "v26.9.23"]);
const repository = "gaofeng21cn/one-person-lab-app";
const quote = (value) => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function invariant(ok, message) { if (!ok) throw new Error(message); }
function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).slice(-2000)}`);
  return result;
}
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    invariant(!entry.isSymbolicLink(), "Qualification artifact must not contain symlinks");
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}
export function loadSealedCandidate(root, expectedIdentitySha256) {
  const resolved = path.resolve(root);
  const files = filesUnder(resolved);
  const unique = (name) => { const found = files.filter((file) => path.basename(file) === name); invariant(found.length === 1, `Expected one sealed ${name}`); return found[0]; };
  const identityFile = unique("standard-identity-receipt.json");
  invariant(digest(identityFile) === expectedIdentitySha256.replace(/^sha256:/, ""), "Standard identity differs from protected publication input");
  const identity = JSON.parse(fs.readFileSync(identityFile, "utf8"));
  invariant(identity.schema === "opl_standard_release_identity_receipt.v2" && identity.status === "passed" && identity.release.channel === "stable" && identity.source.repository === repository, "Invalid sealed Stable identity");
  const records = [identity.apple_distribution_trust?.final_dmg, identity.updater_zip, identity.updater_metadata, identity.updater_compatibility_metadata, identity.component_manifest];
  const assets = records.map((record) => {
    invariant(record?.name && /^(sha256:)?[0-9a-f]{64}$/.test(record.sha256), "Missing sealed update artifact identity");
    const sealed = path.join(resolved, "assets", record.name);
    const file = fs.existsSync(sealed) ? sealed : unique(record.name);
    const sha256 = digest(file);
    invariant(sha256 === record.sha256.replace(/^sha256:/, ""), `Sealed update artifact mismatch: ${record.name}`);
    return { name: record.name, file, sha256, size: fs.statSync(file).size };
  });
  for (const file of files.filter((item) => item.endsWith(".blockmap"))) assets.push({ name: path.basename(file), file, sha256: digest(file), size: fs.statSync(file).size });
  return { identity, identitySha256: digest(identityFile), assets };
}
export function parseLegacyQualificationArgs(argv) {
  const keys = { "--candidate-root": "candidateRoot", "--standard-identity-sha256": "identitySha256", "--source-vm": "sourceVm", "--guest-user": "user", "--ssh-key": "sshKey", "--artifacts": "artifacts", "--framework-source-archive": "frameworkArchive", "--framework-ref": "frameworkRef", "--codex-platform-package-tarball": "codexTarball", "--codex-version": "codexVersion", "--gateway-account-email-file": "emailFile", "--gateway-account-password-file": "passwordFile", "--product-profile": "productProfile" };
  const options = { user: "admin", sshKey: path.join(os.homedir(), ".ssh/opl_first_run_tart_ed25519") };
  for (let index = 0; index < argv.length; index++) { invariant(keys[argv[index]] && argv[index + 1], `Invalid argument ${argv[index]}`); options[keys[argv[index]]] = argv[++index]; }
  for (const key of Object.values(keys)) invariant(options[key], `Missing legacy qualification input: ${key}`);
  invariant(/^(sha256:)?[0-9a-f]{64}$/.test(options.identitySha256) && /^[0-9a-f]{40}$/.test(options.frameworkRef), "Qualification requires immutable candidate identities");
  return options;
}
async function qualifyBaseline(options, candidate, tag, transient) {
  const baselineRoot = path.join(options.artifacts, tag);
  fs.mkdirSync(baselineRoot, { recursive: true });
  const metadata = JSON.parse(run("gh", ["api", `repos/${repository}/releases/tags/${tag}`]).stdout);
  invariant(metadata.tag_name === tag && metadata.draft === false && metadata.prerelease === false, "Legacy baseline must be an exact public Stable release");
  const asset = metadata.assets.find((item) => item.name.startsWith("One-Person-Lab-") && item.name.endsWith("-mac-arm64.dmg") && !item.name.includes("Full"));
  const name = asset?.name;
  invariant(asset && /^sha256:[0-9a-f]{64}$/.test(asset.digest), "Legacy public asset has no exact GitHub digest");
  const baselineDmg = path.join(transient, name);
  run("curl", ["--fail", "--location", "--retry", "3", "--output", baselineDmg, asset.browser_download_url]);
  invariant(fs.statSync(baselineDmg).size === asset.size && `sha256:${digest(baselineDmg)}` === asset.digest, "Legacy downloaded bytes differ from GitHub asset identity");
  run("xcrun", ["stapler", "validate", baselineDmg]);
  writeJson(path.join(baselineRoot, "baseline.json"), { tag, repository, asset: { name, digest: asset.digest, size: asset.size }, source: asset.browser_download_url, stapledDmgVerified: true });
  const vm = `opl-studio-cutover-gate-${process.env.GITHUB_RUN_ID ?? process.pid}-${tag.slice(1).replaceAll(".", "-")}`;
  let started = false;
  let tart;
  let guest;
  const sshArgs = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=8", "-i", options.sshKey];
  try {
    run("tart", ["clone", options.sourceVm, vm]); started = true;
    tart = spawn("tart", ["run", "--no-graphics", vm], { stdio: "ignore" });
    let ip;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      ip = run("tart", ["ip", vm], true).stdout.trim();
      if (/^192\.168\.64\.\d+$/.test(ip) && run("ssh", [...sshArgs, `${options.user}@${ip}`, "true"], true).status === 0) break;
      await delay(2000);
    }
    invariant(/^192\.168\.64\.\d+$/.test(ip), "Isolated guest did not acquire a Tart address");
    guest = (command, allowFailure = false) => run("ssh", [...sshArgs, `${options.user}@${ip}`, command], allowFailure);
    const copy = (source, target) => run("scp", [...sshArgs, source, `${options.user}@${ip}:${target}`]);
    copy(baselineDmg, "/tmp/opl-baseline.dmg");
    guest("test ! -e '/Applications/One Person Lab.app' && mkdir -p /tmp/opl-baseline-mount && hdiutil attach /tmp/opl-baseline.dmg -nobrowse -readonly -mountpoint /tmp/opl-baseline-mount && sudo -n ditto '/tmp/opl-baseline-mount/One Person Lab.app' '/Applications/One Person Lab.app' && hdiutil detach /tmp/opl-baseline-mount");
    guest("codesign --verify --deep --strict '/Applications/One Person Lab.app' && codesign --verify -R 'identifier \"cn.onepersonlab.opl\" and anchor apple generic and certificate leaf[subject.OU] = \"SVVC4TA784\"' '/Applications/One Person Lab.app' && spctl --assess --type execute '/Applications/One Person Lab.app'");
    const executable = "/Applications/One Person Lab.app/Contents/MacOS/One Person Lab";
    const guestNode = `env ELECTRON_RUN_AS_NODE=1 ${quote(executable)}`;
    guest("mkdir -p /tmp/opl-upgrade-assets /tmp/opl-upgrade-codex");
    for (const item of candidate.assets) copy(item.file, `/tmp/opl-upgrade-assets/${item.name}`);
    const fixtureAssets = candidate.assets.filter((item) => !item.name.endsWith(".blockmap") || item.name.includes(candidate.identity.release.version));
    const fixture = { schema: "opl_studio_upgrade_network_fixture.v1", created_at: new Date().toISOString(), releases: [{ repository, tag: candidate.identity.release.tag, assets: fixtureAssets.map(({ name: assetName, size, sha256 }) => ({ name: assetName, size, sha256, path: `/tmp/opl-upgrade-assets/${assetName}` })) }] };
    const fixturePath = path.join(baselineRoot, "network-manifest.json"); writeJson(fixturePath, fixture);
    copy(fixturePath, "/tmp/opl-upgrade-network.json");
    copy(path.join(path.dirname(fileURLToPath(import.meta.url)), "stable-upgrade-network.mjs"), "/tmp/stable-upgrade-network.mjs");
    copy(path.join(transient, "key.pem"), "/tmp/key.pem"); copy(path.join(transient, "cert.pem"), "/tmp/cert.pem");
    copy(options.frameworkArchive, "/tmp/opl-upgrade-framework.tar.gz"); copy(options.codexTarball, "/tmp/opl-upgrade-codex.tgz");
    guest(`test "$(shasum -a 256 /tmp/opl-upgrade-framework.tar.gz | awk '{print $1}')" = ${quote(digest(options.frameworkArchive))} && test "$(shasum -a 256 /tmp/opl-upgrade-codex.tgz | awk '{print $1}')" = ${quote(digest(options.codexTarball))} && tar -xzf /tmp/opl-upgrade-codex.tgz -C /tmp/opl-upgrade-codex && test "$(/tmp/opl-upgrade-codex/package/vendor/aarch64-apple-darwin/bin/codex --version)" = ${quote(`codex-cli ${options.codexVersion}`)}`);
    guest("sudo -n security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/cert.pem && printf '\n127.0.0.1 github.com api.github.com\n' | sudo -n tee -a /etc/hosts >/dev/null && sudo -n dscacheutil -flushcache");
    guest(`sudo -n nohup ${guestNode} /tmp/stable-upgrade-network.mjs /tmp/opl-upgrade-network.json /tmp/key.pem /tmp/cert.pem /tmp/opl-upgrade-requests.jsonl >/tmp/opl-upgrade-network.log 2>&1 &`);
    for (let index = 0; index < 30; index++) { if (guest("curl -fsS https://github.com/gaofeng21cn/one-person-lab-app/releases/latest >/dev/null", true).status === 0) break; await delay(1000); }
    const binding = { provider_id: "qualification-sentinel", account_id: "offline-sentinel-account", channel_session_id: "offline-sentinel-session", canonical_thread_host: "codex", canonical_thread_id: "offline-sentinel-reference" };
    const legacy = { schema: "opl_app_transport_bindings_adapter_state.v1", bindings: [binding] };
    const seedPath = path.join(baselineRoot, "legacy-bindings.json"); writeJson(seedPath, legacy);
    guest('mkdir -p "$HOME/Library/Application Support/One Person Lab"');
    copy(seedPath, "/tmp/legacy-bindings.json");
    guest('cp /tmp/legacy-bindings.json "$HOME/Library/Application Support/One Person Lab/channel-bindings.json"');
    const port = 19339;
    const roots = JSON.parse(fs.readFileSync(options.productProfile, "utf8")).official_profile.desired_root_package_ids;
    const credentials = { email: fs.readFileSync(options.emailFile, "utf8").trim(), password: fs.readFileSync(options.passwordFile, "utf8") };
    const receipt = await qualifyUpgradeVm({ vm, route: "aion", sshKey: options.sshKey, user: options.user, cdpPort: port, targetVersion: candidate.identity.release.updater_version, timeoutMs: 900_000, networkMode: "controlled_exact_candidate", out: path.join(baselineRoot, "upgrade.json"), launchEnvironment: { NODE_EXTRA_CA_CERTS: "/tmp/cert.pem", OPL_CODEX_BIN: "/tmp/opl-upgrade-codex/package/vendor/aarch64-apple-darwin/bin/codex", OPL_SOURCE_ARCHIVE_URL: "file:///tmp/opl-upgrade-framework.tar.gz", OPL_FRAMEWORK_SOURCE_COMMIT: options.frameworkRef, OPL_NATIVE_WORKBENCH_READ_ONLY: "0" }, verifyTarget: async () => {
      const bindings = JSON.parse(guest('cat "$HOME/Library/Application Support/One Person Lab/channel-transport-bindings.json"').stdout);
      invariant(bindings.entries?.some((entry) => Object.keys(binding).every((key) => entry[key] === binding[key])), "Legacy channel binding reference was not preserved");
      guest('cmp /tmp/legacy-bindings.json "$HOME/Library/Application Support/One Person Lab/channel-bindings.json"');
      const smoke = await runStableSmoke({ evaluate: (expression) => evaluatePageStable({ port, expression, timeoutMs: 240_000 }), waitForReady: () => waitForPageReady({ port, timeoutMs: 120_000 }), credentials, turnRequest: null, identity: { status: "passed" }, options: { carrier: "macos-dmg", runtimeProfiles: ["standard"], timeoutMs: 180_000, expectedRootPackageIds: roots } });
      writeJson(path.join(baselineRoot, "target-smoke.json"), smoke); validateStableRuntimeEvidence(smoke);
      return { status: "passed", productionRuntimeVerified: true, syntheticOfflineSentinelPreserved: true, legacyBindingSourceUnchanged: true, userConversationGenerated: false };
    } });
    invariant(receipt.status === "passed", receipt.failure?.message ?? "Legacy native upgrade failed");
    return { tag, status: "passed", baselineSha256: asset.digest, evidence: `${tag}/upgrade.json` };
  } finally {
    if (guest) for (const [remote, name] of [["/tmp/opl-upgrade-requests.jsonl", "network-requests.jsonl"], ["/tmp/opl-upgrade-app.log", "legacy-app.log"], ["/tmp/opl-upgrade-stable.log", "target-app.log"], ["/tmp/opl-upgrade-network.log", "network.log"]]) fs.writeFileSync(path.join(baselineRoot, name), guest(`sudo -n cat ${quote(remote)}`, true).stdout);
    tart?.kill("SIGTERM");
    if (started) { run("tart", ["stop", vm], true); run("tart", ["delete", vm], true); }
  }
}
export async function qualifyLegacyUpgrades(options) {
  const transient = fs.mkdtempSync(path.join(os.tmpdir(), "opl-legacy-upgrade-gate-"));
  const receipt = { schema: "opl_studio_legacy_upgrade_qualification.v1", status: "failed", networkMode: "controlled_exact_candidate", baselineTags: LEGACY_BASELINE_TAGS, routes: [], publicFeedReadbackProven: false };
  try {
    invariant(process.platform === "darwin", "Legacy upgrade qualification requires macOS Tart");
    const candidate = loadSealedCandidate(options.candidateRoot, options.identitySha256);
    invariant(candidate.identity.cohort.framework_sha === options.frameworkRef, "Framework input differs from sealed candidate");
    receipt.standardIdentitySha256 = candidate.identitySha256; receipt.targetVersion = candidate.identity.release.updater_version; receipt.candidateAssets = candidate.assets.map(({ file, ...item }) => item);
    const opensslConfig = path.join(transient, "openssl.cnf");
    fs.writeFileSync(opensslConfig, "[req]\ndistinguished_name=dn\nx509_extensions=extensions\nprompt=no\n[dn]\nCN=OPL Isolated Upgrade Qualification\n[extensions]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:github.com,DNS:api.github.com\n");
    run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-keyout", path.join(transient, "key.pem"), "-out", path.join(transient, "cert.pem"), "-config", opensslConfig]);
    for (const tag of LEGACY_BASELINE_TAGS) receipt.routes.push(await qualifyBaseline(options, candidate, tag, transient));
    receipt.status = "passed";
  } catch (error) { receipt.failure = { message: error.message }; }
  finally { fs.rmSync(transient, { recursive: true, force: true }); writeJson(path.join(options.artifacts, "legacy-upgrade-qualification.json"), receipt); }
  return receipt;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const receipt = await qualifyLegacyUpgrades(parseLegacyQualificationArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`); if (receipt.status !== "passed") process.exitCode = 1;
}

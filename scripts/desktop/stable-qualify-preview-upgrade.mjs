import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { validateTarget, readPreviewHandoff } from "../../desktop/preview-handoff.mjs";
import { verifyApp } from "../../desktop/handoff-installer.mjs";
import { qualifyUpgradeVm } from "./stable-upgrade-vm.mjs";
import { runStableSmoke, validateStableRuntimeEvidence } from "./stable-smoke.mjs";
import { evaluatePageStable, waitForPageReady } from "./cdp.mjs";
import { prepareRunnerTrustBundle } from "./qualify-clean-vm.mjs";

const previewRepository = "gaofeng21cn/opl-studio";
const stableRepository = "gaofeng21cn/one-person-lab-app";
const publisher = "SVVC4TA784";
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const ownedVms = new Set();
const quote = (value) => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function invariant(value, message) { if (!value) throw new Error(message); }
function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(command)} failed: ${(result.stderr || result.stdout || result.error?.message || "").slice(-1500)}`);
  return result;
}
function json(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function verifiedFile(root, relative, expectedSha256, size) {
  invariant(typeof relative === "string" && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."), "Invalid checkpoint path");
  const file = path.join(root, relative);
  invariant(fs.realpathSync(file).startsWith(`${fs.realpathSync(root)}${path.sep}`), "Checkpoint path escapes its root");
  const stat = fs.lstatSync(file);
  invariant(stat.isFile() && !stat.isSymbolicLink() && stat.size === size && sha256(file) === expectedSha256, `Checkpoint bytes differ: ${relative}`);
  return file;
}

export function selectPreviewBaselines(releases, terminalVersion) {
  const eligible = releases.filter((release) => release.draft === false && release.prerelease === false && /^v\d+\.\d+\.\d+$/.test(release.tag_name ?? "") && semver.valid(release.tag_name.slice(1)))
    .sort((left, right) => semver.rcompare(left.tag_name.slice(1), right.tag_name.slice(1)));
  invariant(eligible.length > 0 && semver.gt(terminalVersion, eligible[0].tag_name.slice(1)), "Terminal version must be newer than the latest public Preview");
  const baselines = eligible.slice(0, 2);
  for (const release of baselines) {
    const expectedName = `one-person-lab-preview-${release.tag_name.slice(1)}-mac-arm64.dmg`;
    const matches = release.assets?.filter((item) => item.name === expectedName) ?? [];
    invariant(matches.length === 1 && /^sha256:[0-9a-f]{64}$/.test(matches[0].digest), `Public Preview ${release.tag_name} lacks an exact DMG identity`);
  }
  return baselines;
}

export function validatePreviewUpgradeReceipt(receipt, { previewVersion, previewZipSha256, target }) {
  invariant(receipt?.schema === "opl_studio_preview_upgrade_qualification.v1" && receipt.status === "passed", "Passed terminal Preview VM qualification is required");
  invariant(receipt.previewVersion === previewVersion && receipt.previewZipSha256 === previewZipSha256 && JSON.stringify(receipt.target) === JSON.stringify(target), "Terminal Preview VM receipt differs from signed candidate or Stable target");
  invariant(/^[0-9a-f]{64}$/.test(receipt.checkpointSha256 ?? ""), "Exact signed Preview checkpoint identity is missing");
  invariant(receipt.isolation === "fresh_tart_clone_per_public_baseline" && receipt.userHostMutation === false && receipt.publicStableTargetVerified === true, "Terminal Preview qualification lacks isolation or public target proof");
  invariant(Array.isArray(receipt.baselineTags) && receipt.baselineTags.length >= 1 && receipt.baselineTags.length <= 2 && new Set(receipt.baselineTags).size === receipt.baselineTags.length, "Invalid public Preview baseline window");
  invariant(receipt.baselineTags.length === Math.min(2, receipt.publicPreviewCount) && Array.isArray(receipt.routes) && receipt.routes.length === receipt.baselineTags.length, "Preview latest and previous baseline evidence is incomplete");
  for (const [index, route] of receipt.routes.entries()) invariant(route.tag === receipt.baselineTags[index] && route.status === "passed" && route.nativeUpdater === true && route.terminalHandoff === true && route.ownerReadback === true && route.storagePreserved === true && route.channelBindingsPreserved === true, "Preview native updater and handoff route did not pass");
  return receipt;
}

export function loadPreviewCheckpoint(root, expectedSha256) {
  invariant(sha256(path.join(root, "checkpoint.json")) === expectedSha256.replace(/^sha256:/, ""), "Preview checkpoint digest differs");
  const checkpoint = json(path.join(root, "checkpoint.json"));
  invariant(checkpoint.schema === "opl_studio_signed_notarized_checkpoint.v2" && checkpoint.status === "signed_notarized" && checkpoint.authority_owner === "one-person-lab-app", "Expected App-sealed signed Preview checkpoint");
  invariant(checkpoint.source?.repository === previewRepository && semver.valid(checkpoint.source?.version) && checkpoint.source.tag === `v${checkpoint.source.version}`, "Invalid Preview checkpoint source");
  invariant(Array.isArray(checkpoint.files) && new Set(checkpoint.files.map((entry) => entry.path)).size === checkpoint.files.length, "Duplicate checkpoint files");
  const assets = checkpoint.files.map((entry) => ({ ...entry, file: verifiedFile(root, entry.path, entry.sha256, entry.size_bytes) })).filter((entry) => entry.path.startsWith("assets/"));
  const expected = [`one-person-lab-preview-${checkpoint.source.version}-mac-arm64.dmg`, `one-person-lab-preview-${checkpoint.source.version}-mac-arm64.zip`, `one-person-lab-preview-${checkpoint.source.version}-mac-arm64.zip.blockmap`, "latest-mac.yml", "latest-arm64-mac.yml"].sort();
  invariant(JSON.stringify(assets.map((entry) => path.basename(entry.path)).sort()) === JSON.stringify(expected), "Preview checkpoint asset inventory differs");
  return { checkpoint, assets };
}

function downloadAsset(asset, destination) {
  invariant(/^sha256:[0-9a-f]{64}$/.test(asset.digest) && Number.isSafeInteger(asset.size) && asset.size > 0, "Public release asset must declare size and SHA-256");
  const url = new URL(asset.browser_download_url);
  invariant(url.origin === "https://github.com" && !url.username && !url.password, "Unexpected public release asset URL");
  run("curl", ["--fail", "--location", "--retry", "3", "--connect-timeout", "30", "--max-time", "240", "--output", destination, url.href]);
  invariant(fs.statSync(destination).size === asset.size && `sha256:${sha256(destination)}` === asset.digest, "Downloaded public bytes differ from release asset identity");
  return destination;
}

function inspectSignedBridge(candidate, transient) {
  const zip = candidate.assets.find((asset) => asset.path.endsWith(".zip"));
  const dmg = candidate.assets.find((asset) => asset.path.endsWith(".dmg"));
  const root = path.join(transient, "bridge"); fs.mkdirSync(root);
  run("ditto", ["-x", "-k", zip.file, root]);
  const app = path.join(root, "One Person Lab Preview.app");
  run("codesign", ["--verify", "--deep", "--strict", app]);
  run("codesign", ["--verify", "-R", `identifier "cn.onepersonlab.opl.studio.preview" and anchor apple generic and certificate leaf[subject.OU] = "${publisher}"`, app]);
  run("spctl", ["--assess", "--type", "execute", app]);
  run("xcrun", ["stapler", "validate", app]); run("xcrun", ["stapler", "validate", dmg.file]);
  invariant(run("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(app, "Contents/Info.plist")]).stdout.trim() === candidate.checkpoint.source.version, "Signed bridge version differs from checkpoint");
  const plan = json(path.join(app, "Contents/Resources/preview-handoff.json"));
  invariant(plan.schema === "opl_studio_preview_handoff_plan.v1" && plan.enabled === true, "Checkpoint is not an enabled terminal Preview bridge");
  validateTarget(plan.target);
  return { plan, zipSha256: zip.sha256 };
}

async function runBaseline({ options, candidate, target, stableAsset, baseline, transient, launchEnvironment }) {
  const artifactRoot = path.join(options.artifacts, baseline.tag_name); fs.mkdirSync(artifactRoot, { recursive: true });
  const baselineAsset = baseline.assets.find((asset) => asset.name === `one-person-lab-preview-${baseline.tag_name.slice(1)}-mac-arm64.dmg`);
  const baselineDmg = downloadAsset(baselineAsset, path.join(transient, baselineAsset.name));
  run("xcrun", ["stapler", "validate", baselineDmg]);
  writeJson(path.join(artifactRoot, "baseline.json"), { tag: baseline.tag_name, asset: baselineAsset, publisher });
  const vm = `opl-studio-cutover-preview-${process.pid}-${randomUUID().slice(0, 8)}`;
  const sshArgs = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=8", "-i", options.sshKey];
  let cloned = false, tart, guest;
  try {
    run("tart", ["clone", options.sourceVm, vm]); cloned = true; ownedVms.add(vm);
    tart = spawn("tart", ["run", "--no-graphics", vm], { stdio: "ignore" });
    let ip, ready = false;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      ip = run("tart", ["ip", vm], true).stdout.trim();
      if (/^192\.168\.64\.\d+$/.test(ip) && run("ssh", [...sshArgs, `${options.user}@${ip}`, "true"], true).status === 0) { ready = true; break; }
      await delay(2000);
    }
    invariant(ready, "Fresh isolated Tart VM did not become ready");
    guest = (command, allowFailure = false) => run("ssh", [...sshArgs, `${options.user}@${ip}`, command], allowFailure);
    const copy = (source, destination) => run("scp", [...sshArgs, source, `${options.user}@${ip}:${destination}`]);
    guest("test ! -e '/Applications/One Person Lab.app' && test ! -e '/Applications/One Person Lab Preview.app' && mkdir -p /tmp/opl-preview-mount /tmp/opl-preview-assets /tmp/opl-preview-codex");
    copy(baselineDmg, "/tmp/opl-preview-baseline.dmg");
    guest("hdiutil attach /tmp/opl-preview-baseline.dmg -nobrowse -readonly -mountpoint /tmp/opl-preview-mount && ditto '/tmp/opl-preview-mount/One Person Lab Preview.app' '/Applications/One Person Lab Preview.app' && hdiutil detach /tmp/opl-preview-mount");
    const previewApp = "/Applications/One Person Lab Preview.app";
    guest(`codesign --verify --deep --strict ${quote(previewApp)} && codesign --verify -R 'identifier "cn.onepersonlab.opl.studio.preview" and anchor apple generic and certificate leaf[subject.OU] = "${publisher}"' ${quote(previewApp)} && spctl --assess --type execute ${quote(previewApp)}`);
    invariant(guest(`plutil -extract CFBundleShortVersionString raw -o - ${quote(`${previewApp}/Contents/Info.plist`)}`).stdout.trim() === baseline.tag_name.slice(1), "Installed baseline version differs from public tag");
    const previewAssets = candidate.assets.map((asset) => ({ name: path.basename(asset.path), path: `/tmp/opl-preview-assets/${path.basename(asset.path)}`, sha256: asset.sha256, size: asset.size_bytes }));
    for (const asset of candidate.assets) copy(asset.file, `/tmp/opl-preview-assets/${path.basename(asset.path)}`);
    copy(stableAsset.file, `/tmp/opl-preview-assets/${stableAsset.name}`);
    const manifest = { schema: "opl_studio_upgrade_network_fixture.v1", created_at: new Date().toISOString(), releases: [
      { repository: previewRepository, tag: candidate.checkpoint.source.tag, assets: previewAssets },
      { repository: stableRepository, tag: new URL(target.url).pathname.split("/")[5], assets: [{ name: stableAsset.name, path: `/tmp/opl-preview-assets/${stableAsset.name}`, sha256: target.sha256, size: target.size }] }
    ] };
    const fixture = path.join(artifactRoot, "network-manifest.json"); writeJson(fixture, manifest); copy(fixture, "/tmp/opl-preview-network.json");
    copy(path.join(scriptRoot, "stable-upgrade-network.mjs"), "/tmp/stable-upgrade-network.mjs");
    copy(path.join(transient, "cert.pem"), "/tmp/cert.pem"); copy(path.join(transient, "key.pem"), "/tmp/key.pem"); copy(path.join(transient, "trust.pem"), "/tmp/opl-preview-trust.pem");
    copy(options.frameworkArchive, "/tmp/opl-preview-framework.tar.gz"); copy(options.codexTarball, "/tmp/opl-preview-codex.tgz");
    guest(`test "$(shasum -a 256 /tmp/opl-preview-framework.tar.gz | awk '{print $1}')" = ${quote(sha256(options.frameworkArchive))} && test "$(shasum -a 256 /tmp/opl-preview-codex.tgz | awk '{print $1}')" = ${quote(sha256(options.codexTarball))} && tar -xzf /tmp/opl-preview-codex.tgz -C /tmp/opl-preview-codex && test "$(/tmp/opl-preview-codex/package/vendor/aarch64-apple-darwin/bin/codex --version)" = ${quote(`codex-cli ${options.codexVersion}`)}`);
    // Squirrel and shell.openPath relaunch through LaunchServices. The isolated
    // guest GUI session must retain the same exact runtime and HTTPS trust.
    for (const [key, value] of Object.entries(launchEnvironment)) guest(`launchctl setenv ${key} ${quote(value)}`);
    guest("sudo -n security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/cert.pem && printf '\n127.0.0.1 github.com api.github.com\n' | sudo -n tee -a /etc/hosts >/dev/null && sudo -n dscacheutil -flushcache");
    guest(`sudo -n nohup env ELECTRON_RUN_AS_NODE=1 ${quote(`${previewApp}/Contents/MacOS/One Person Lab Preview`)} /tmp/stable-upgrade-network.mjs /tmp/opl-preview-network.json /tmp/key.pem /tmp/cert.pem /tmp/opl-preview-requests.jsonl >/tmp/opl-preview-network.log 2>&1 &`);
    let networkReady = false;
    for (let index = 0; index < 30; index++) { if (guest(`curl -fsS https://github.com/${previewRepository}/releases/latest >/dev/null`, true).status === 0) { networkReady = true; break; } await delay(1000); }
    invariant(networkReady, "Isolated exact-candidate HTTPS fixture did not start");
    const binding = { provider_id: "qualification-sentinel", account_id: "offline-account", channel_session_id: "offline-session", canonical_thread_host: "codex", canonical_thread_id: "offline-reference" };
    const bindingFile = path.join(artifactRoot, "channel-bindings.json"); writeJson(bindingFile, { schema: "opl_studio_channel_transport_bindings.v1", entries: [binding] });
    copy(bindingFile, "/tmp/opl-preview-bindings.json");
    guest('mkdir -p "$HOME/Library/Application Support/opl-studio" && cp /tmp/opl-preview-bindings.json "$HOME/Library/Application Support/opl-studio/channel-transport-bindings.json"');
    const credentials = { email: fs.readFileSync(options.emailFile, "utf8").trim(), password: fs.readFileSync(options.passwordFile, "utf8") };
    const port = 19349;
    const receipt = await qualifyUpgradeVm({ vm, route: "preview", user: options.user, sshKey: options.sshKey, cdpPort: port, timeoutMs: 900_000, networkMode: "controlled_exact_candidate", targetVersion: target.version, previewTargetVersion: candidate.checkpoint.source.version, launchEnvironment, out: path.join(artifactRoot, "upgrade.json"), verifyTarget: async () => {
      const productProfile = json(options.productProfile);
      const expectedRootPackageIds = productProfile.official_profile?.desired_root_package_ids;
      invariant(Array.isArray(expectedRootPackageIds) && expectedRootPackageIds.length > 0, "App-owned Official Profile roots are missing");
      const smoke = await runStableSmoke({ evaluate: (expression) => evaluatePageStable({ port, expression, timeoutMs: 240_000 }), waitForReady: () => waitForPageReady({ port, timeoutMs: 120_000 }), credentials, turnRequest: null, identity: { status: "passed" }, options: { carrier: "macos-dmg", runtimeProfiles: ["standard"], timeoutMs: 180_000, expectedRootPackageIds } });
      writeJson(path.join(artifactRoot, "target-smoke.json"), smoke); validateStableRuntimeEvidence(smoke);
      const readGuestJson = (relative) => JSON.parse(guest(`cat "$HOME/Library/Application Support/${relative}"`).stdout);
      const incoming = readGuestJson("One Person Lab/handoff/incoming.json");
      const localIncoming = path.join(artifactRoot, "incoming.json"); writeJson(localIncoming, incoming);
      readPreviewHandoff(localIncoming, { currentVersion: target.version, target });
      invariant(incoming.source.version === candidate.checkpoint.source.version, "Handoff did not come from the exact terminal bridge");
      const installed = readGuestJson(`opl-studio/handoff/${target.sha256}/install.json`);
      invariant(installed.stage === "installed" && installed.digest === incoming.digest && installed.version === target.version, "Signed install helper did not commit the exact target");
      let owner;
      const ownerDeadline = Date.now() + 120_000;
      do {
        try { owner = readGuestJson(`One Person Lab/handoff/${incoming.digest}.owner-readback.json`); } catch {}
        if (owner) break;
        await delay(1000);
      } while (Date.now() < ownerDeadline);
      invariant(owner?.frameworkRead === true && owner.canonicalThreadDirectoryRead === true && owner.sharedStateCopied === false && owner.sourceRetained === true, "Production handoff owner readback is missing");
      guest('cmp /tmp/opl-preview-bindings.json "$HOME/Library/Application Support/opl-studio/channel-transport-bindings.json"');
      const importedBindings = readGuestJson("One Person Lab/channel-transport-bindings.json");
      invariant(importedBindings.entries?.some((entry) => Object.keys(binding).every((key) => entry[key] === binding[key])), "Preview channel reference was not preserved");
      return { status: "passed", ownerReadback: true, channelBindingsPreserved: true, sourceRetained: true };
    } });
    invariant(receipt.status === "passed", receipt.failure?.message ?? "Preview native update and handoff failed");
    return { tag: baseline.tag_name, status: "passed", baselineSha256: baselineAsset.digest, nativeUpdater: true, terminalHandoff: true, ownerReadback: true, storagePreserved: receipt.checks.previewShellStoragePreserved === true, channelBindingsPreserved: receipt.checks.targetReadiness?.channelBindingsPreserved === true, evidence: `${baseline.tag_name}/upgrade.json` };
  } finally {
    if (guest) for (const [remote, name] of [["/tmp/opl-preview-requests.jsonl", "network-requests.jsonl"], ["/tmp/opl-preview-network.log", "network.log"]]) fs.writeFileSync(path.join(artifactRoot, name), guest(`sudo -n cat ${quote(remote)}`, true).stdout);
    tart?.kill("SIGTERM");
    if (cloned) { run("tart", ["stop", vm], true); run("tart", ["delete", vm], true); ownedVms.delete(vm); }
  }
}

export function parsePreviewUpgradeArgs(argv) {
  const keys = { "--checkpoint-root": "checkpointRoot", "--checkpoint-sha256": "checkpointSha256", "--source-vm": "sourceVm", "--guest-user": "user", "--ssh-key": "sshKey", "--artifacts": "artifacts", "--framework-source-archive": "frameworkArchive", "--framework-ref": "frameworkRef", "--codex-platform-package-tarball": "codexTarball", "--codex-version": "codexVersion", "--gateway-account-email-file": "emailFile", "--gateway-account-password-file": "passwordFile", "--product-profile": "productProfile" };
  const options = { user: "admin", sshKey: path.join(os.homedir(), ".ssh/opl_first_run_tart_ed25519") };
  for (let index = 0; index < argv.length; index++) { invariant(keys[argv[index]] && argv[index + 1], `Invalid argument ${argv[index]}`); options[keys[argv[index]]] = argv[++index]; }
  for (const key of Object.values(keys)) invariant(options[key], `Missing Preview qualification input: ${key}`);
  invariant(/^(sha256:)?[0-9a-f]{64}$/.test(options.checkpointSha256) && /^[0-9a-f]{40}$/.test(options.frameworkRef), "Exact checkpoint and Framework identities are required");
  return options;
}

export async function qualifyPreviewUpgrades(options) {
  const transient = fs.mkdtempSync(path.join(os.tmpdir(), "opl-preview-upgrade-gate-"));
  const receipt = { schema: "opl_studio_preview_upgrade_qualification.v1", status: "failed", isolation: "fresh_tart_clone_per_public_baseline", userHostMutation: false, routes: [], publicStableTargetVerified: false };
  try {
    invariant(process.platform === "darwin", "Terminal Preview qualification requires macOS Tart");
    const candidate = loadPreviewCheckpoint(options.checkpointRoot, options.checkpointSha256);
    invariant(candidate.checkpoint.framework_ref === options.frameworkRef, "Framework differs from Preview checkpoint");
    const bridge = inspectSignedBridge(candidate, transient), target = bridge.plan.target;
    const { validateMacUpdateFeed } = await import("./macos-distribution.mjs");
    await validateMacUpdateFeed({ outRoot: path.join(options.checkpointRoot, "assets"), expectedVersion: candidate.checkpoint.source.version });
    Object.assign(receipt, { previewVersion: candidate.checkpoint.source.version, previewZipSha256: bridge.zipSha256, target, checkpointSha256: options.checkpointSha256.replace(/^sha256:/, "") });
    const stableTag = new URL(target.url).pathname.split("/")[5];
    const release = JSON.parse(run("gh", ["api", `repos/${stableRepository}/releases/tags/${stableTag}`]).stdout);
    invariant(release.tag_name === stableTag && release.draft === false && release.prerelease === false, "Signed handoff target must already be public Stable");
    const publicAsset = release.assets.find((asset) => asset.browser_download_url === target.url);
    invariant(publicAsset?.digest === `sha256:${target.sha256}` && publicAsset.size === target.size, "Public Stable asset differs from the signed handoff plan");
    const stableAsset = { ...publicAsset, file: downloadAsset(publicAsset, path.join(transient, publicAsset.name)) };
    run("xcrun", ["stapler", "validate", stableAsset.file]);
    const targetMount = path.join(transient, "stable-mount"); fs.mkdirSync(targetMount);
    run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", targetMount, stableAsset.file]);
    try {
      const stableApp = path.join(targetMount, "One Person Lab.app");
      verifyApp(stableApp, { exactVersion: target.version });
      invariant(json(path.join(stableApp, "Contents/Resources/opl-framework-bootstrap/manifest.json")).framework_ref === options.frameworkRef, "Public Stable bootstrap differs from the qualification Framework");
    } finally { run("hdiutil", ["detach", targetMount]); }
    receipt.publicStableTargetVerified = true;
    const pages = JSON.parse(run("gh", ["api", "--paginate", "--slurp", `repos/${previewRepository}/releases?per_page=100`]).stdout).flat();
    const baselines = selectPreviewBaselines(pages, candidate.checkpoint.source.version);
    receipt.publicPreviewCount = pages.filter((item) => item.draft === false && item.prerelease === false && /^v\d+\.\d+\.\d+$/.test(item.tag_name ?? "") && semver.valid(item.tag_name.slice(1))).length;
    receipt.baselineTags = baselines.map((item) => item.tag_name);
    const config = path.join(transient, "openssl.cnf"); fs.writeFileSync(config, "[req]\ndistinguished_name=dn\nx509_extensions=extensions\nprompt=no\n[dn]\nCN=OPL Isolated Preview Upgrade\n[extensions]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:github.com,DNS:api.github.com\n");
    run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-keyout", path.join(transient, "key.pem"), "-out", path.join(transient, "cert.pem"), "-config", config]);
    const trust = await prepareRunnerTrustBundle(transient);
    fs.writeFileSync(path.join(transient, "trust.pem"), `${trust ? fs.readFileSync(trust.file, "utf8") : ""}\n${fs.readFileSync(path.join(transient, "cert.pem"), "utf8")}`);
    const launchEnvironment = { NODE_EXTRA_CA_CERTS: "/tmp/opl-preview-trust.pem", SSL_CERT_FILE: "/tmp/opl-preview-trust.pem", OPL_CODEX_BIN: "/tmp/opl-preview-codex/package/vendor/aarch64-apple-darwin/bin/codex", OPL_SOURCE_ARCHIVE_URL: "file:///tmp/opl-preview-framework.tar.gz", OPL_FRAMEWORK_SOURCE_COMMIT: options.frameworkRef, OPL_NATIVE_WORKBENCH_READ_ONLY: "0" };
    for (const baseline of baselines) receipt.routes.push(await runBaseline({ options, candidate, target, stableAsset, baseline, transient, launchEnvironment }));
    receipt.status = "passed"; validatePreviewUpgradeReceipt(receipt, { previewVersion: receipt.previewVersion, previewZipSha256: receipt.previewZipSha256, target });
  } catch (error) { receipt.status = "failed"; receipt.failure = { message: error.message }; }
  finally { fs.rmSync(transient, { recursive: true, force: true }); writeJson(path.join(options.artifacts, "preview-upgrade-qualification.json"), receipt); }
  return receipt;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    for (const vm of ownedVms) { run("tart", ["stop", vm], true); run("tart", ["delete", vm], true); }
    process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  });
  const receipt = await qualifyPreviewUpgrades(parsePreviewUpgradeArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`); if (receipt.status !== "passed") process.exitCode = 1;
}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import semver from "semver";
import { qualifyLocalUpdater } from "./qualify-local-updater.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function selectPreviousUpdaterAsset(releases, targetVersion) {
  return releases.filter((release) => !release.draft && !release.prerelease
    && semver.valid(release.tag_name?.replace(/^v/, ""))
    && semver.lt(release.tag_name.replace(/^v/, ""), targetVersion))
    .sort((a, b) => semver.rcompare(a.tag_name.replace(/^v/, ""), b.tag_name.replace(/^v/, "")))
    .map((release) => ({ version: release.tag_name.replace(/^v/, ""),
      asset: release.assets?.find((asset) => /^one-person-lab-preview-.*-mac-arm64\.zip$/.test(asset.name)) }))
    .find((entry) => entry.asset);
}

async function qualifyPreviousSignedUpdate({ outRoot, targetVersion, targetSignature, extractionRoot, fetchImpl }) {
  const response = await fetchImpl("https://api.github.com/repos/gaofeng21cn/opl-studio/releases?per_page=30");
  invariant(response.ok, `previous Preview release lookup failed: ${response.status}`);
  const previous = selectPreviousUpdaterAsset(await response.json(), targetVersion);
  invariant(previous, "no earlier signed Preview updater baseline is available");
  const archive = await fetchImpl(previous.asset.browser_download_url);
  invariant(archive.ok, `previous Preview ZIP download failed: ${archive.status}`);
  const bytes = Buffer.from(await archive.arrayBuffer());
  invariant(bytes.length === previous.asset.size, "previous Preview ZIP byte count mismatch");
  if (previous.asset.digest?.startsWith("sha256:")) {
    invariant(`sha256:${createHash("sha256").update(bytes).digest("hex")}` === previous.asset.digest, "previous Preview ZIP digest mismatch");
  }
  const archivePath = path.join(extractionRoot, "previous-preview.zip");
  await writeFile(archivePath, bytes);
  const baseAppPath = await extractedUpdaterApp(archivePath, path.join(extractionRoot, "previous"));
  const signature = signatureDetails(baseAppPath);
  invariant(signature.valid && signature.authority?.startsWith("Developer ID Application:")
    && signature.teamIdentifier === targetSignature.teamIdentifier, "previous Preview signature does not match the candidate publisher");
  invariant(plistValue(path.join(baseAppPath, "Contents", "Info.plist"), "CFBundleShortVersionString") === previous.version,
    "previous Preview version does not match its release");
  return qualifyLocalUpdater({ baseAppPath, targetArtifactsRoot: outRoot });
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function command(executable, args, { input, allowFailure = false } = {}) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    input,
    maxBuffer: 16 * 1024 * 1024
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(executable)} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function safeArtifactName(value) {
  invariant(typeof value === "string" && value === path.basename(value), `invalid update artifact path: ${String(value)}`);
  invariant(!value.includes("..") && !value.includes("/"), `invalid update artifact path: ${value}`);
  return value;
}

async function digest(file, algorithm, encoding) {
  return createHash(algorithm).update(await readFile(file)).digest(encoding);
}

export async function validateMacUpdateFeed({ outRoot, expectedVersion } = {}) {
  invariant(outRoot, "outRoot is required");
  const primaryPath = path.join(outRoot, "latest-mac.yml");
  const metadataBytes = await readFile(primaryPath);
  const metadata = parse(metadataBytes.toString("utf8"));
  invariant(metadata && typeof metadata === "object", "latest-mac.yml must contain an object");
  invariant(typeof metadata.version === "string", "latest-mac.yml version is required");
  if (expectedVersion) invariant(metadata.version === expectedVersion, `feed version ${metadata.version} does not match ${expectedVersion}`);
  invariant(Array.isArray(metadata.files) && metadata.files.length >= 2, "latest-mac.yml must list ZIP and DMG artifacts");

  const artifacts = [];
  for (const entry of metadata.files) {
    const name = safeArtifactName(entry?.url);
    invariant(typeof entry.sha512 === "string" && entry.sha512, `${name} sha512 is required`);
    invariant(Number.isSafeInteger(entry.size) && entry.size >= 0, `${name} size is required`);
    const file = path.join(outRoot, name);
    const actualSize = (await stat(file)).size;
    const actualSha512 = await digest(file, "sha512", "base64");
    invariant(
      actualSize === entry.size && actualSha512 === entry.sha512,
      `${name} does not match update metadata`
    );
    artifacts.push({ name, size: actualSize, sha512: actualSha512, sha256: await digest(file, "sha256", "hex") });
  }
  invariant(artifacts.some((entry) => entry.name.endsWith(".zip")), "latest-mac.yml must include the updater ZIP");
  invariant(artifacts.some((entry) => entry.name.endsWith(".dmg")), "latest-mac.yml must include the installer DMG");
  const primaryName = safeArtifactName(metadata.path);
  const primary = artifacts.find((entry) => entry.name === primaryName);
  invariant(primary && primary.sha512 === metadata.sha512, "latest-mac.yml primary path and sha512 must bind the updater ZIP");

  const compatibilityPath = path.join(outRoot, "latest-arm64-mac.yml");
  let compatibilityMetadataByteIdentical = false;
  try {
    compatibilityMetadataByteIdentical = Buffer.compare(metadataBytes, await readFile(compatibilityPath)) === 0;
  } catch {}
  return {
    schema: "opl_desktop_update_feed_qualification.v1",
    version: metadata.version,
    metadata: "latest-mac.yml",
    compatibilityMetadata: "latest-arm64-mac.yml",
    compatibilityMetadataByteIdentical,
    artifacts
  };
}

export async function prepareMacUpdateFeed({ outRoot } = {}) {
  invariant(outRoot, "outRoot is required");
  await copyFile(path.join(outRoot, "latest-mac.yml"), path.join(outRoot, "latest-arm64-mac.yml"));
  const result = await validateMacUpdateFeed({ outRoot });
  invariant(result.compatibilityMetadataByteIdentical, "compatibility metadata must be byte-identical to latest-mac.yml");
  return result;
}

function dedicatedPublicFeedUrl(value, identity = "preview") {
  invariant(typeof value === "string" && value, "public update feed URL is required");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("public update feed URL is invalid");
  }
  invariant(url.protocol === "https:", "public update feed must use HTTPS");
  invariant(!url.username && !url.password && !url.search && !url.hash, "public update feed URL must not contain credentials, query, or fragment");
  invariant(url.hostname === "github.com", "public update feed must use GitHub Releases");
  invariant(
    new RegExp(`^/gaofeng21cn/${identity === "stable" ? "one-person-lab-app" : "opl-studio"}/releases/download/[^/]+/$`).test(url.pathname),
    "public update feed must target one identity-bound OPL release"
  );
  return url;
}

async function publicResponse(fetchImpl, baseUrl, name) {
  const response = await fetchImpl(new URL(safeArtifactName(name), baseUrl), { redirect: "follow" });
  invariant(response?.ok, `public update asset ${name} is unavailable anonymously (${response?.status ?? "unknown"})`);
  return response;
}

async function publicBytes(fetchImpl, baseUrl, name) {
  return Buffer.from(await (await publicResponse(fetchImpl, baseUrl, name)).arrayBuffer());
}

async function publicDigest(fetchImpl, baseUrl, name) {
  const response = await publicResponse(fetchImpl, baseUrl, name);
  invariant(response.body, `public update asset ${name} has no response body`);
  const sha512 = createHash("sha512");
  const sha256 = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    sha512.update(bytes);
    sha256.update(bytes);
  }
  return {
    name,
    size,
    sha512: sha512.digest("base64"),
    sha256: sha256.digest("hex")
  };
}

export async function validateMacPublicUpdateFeed({
  outRoot,
  publicFeedUrl,
  expectedVersion,
  identity = "preview",
  fetchImpl = globalThis.fetch
} = {}) {
  invariant(outRoot, "outRoot is required");
  invariant(typeof fetchImpl === "function", "public update feed requires fetch");
  const baseUrl = dedicatedPublicFeedUrl(publicFeedUrl, identity);
  const localFeed = await validateMacUpdateFeed({ outRoot, expectedVersion });
  const primaryBytes = await readFile(path.join(outRoot, "latest-mac.yml"));
  const compatibilityBytes = await readFile(path.join(outRoot, "latest-arm64-mac.yml"));
  invariant(
    Buffer.compare(primaryBytes, await publicBytes(fetchImpl, baseUrl, "latest-mac.yml")) === 0,
    "public latest-mac.yml does not match the qualified local metadata"
  );
  invariant(
    Buffer.compare(compatibilityBytes, await publicBytes(fetchImpl, baseUrl, "latest-arm64-mac.yml")) === 0,
    "public latest-arm64-mac.yml does not match the qualified local metadata"
  );

  const artifacts = [];
  for (const localArtifact of localFeed.artifacts) {
    const publicArtifact = await publicDigest(fetchImpl, baseUrl, localArtifact.name);
    invariant(
      publicArtifact.size === localArtifact.size &&
        publicArtifact.sha512 === localArtifact.sha512 &&
        publicArtifact.sha256 === localArtifact.sha256,
      `public update artifact ${localArtifact.name} does not match the qualified local bytes`
    );
    artifacts.push(publicArtifact);
  }

  return {
    schema: "opl_public_desktop_update_feed_qualification.v1",
    qualified: true,
    baseUrl: baseUrl.href,
    version: localFeed.version,
    metadata: ["latest-mac.yml", "latest-arm64-mac.yml"],
    anonymousDownload: true,
    artifacts
  };
}

function plistValue(plistPath, key) {
  return command("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plistPath]).stdout.trim();
}

function signatureDetails(appPath) {
  command("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const details = command("/usr/bin/codesign", ["-dvvv", appPath], { allowFailure: true });
  const text = `${details.stdout}\n${details.stderr}`;
  const authority = text.match(/^Authority=(Developer ID Application: .+)$/m)?.[1];
  const teamIdentifier = text.match(/^TeamIdentifier=(.+)$/m)?.[1];
  return {
    valid: details.status === 0,
    authority,
    teamIdentifier,
    hardenedRuntime: /flags=.*\(runtime\)/.test(text)
  };
}

function trustResult(appPath, dmgPath) {
  const gatekeeper = command("/usr/sbin/spctl", ["-a", "-vv", "--type", "execute", appPath], { allowFailure: true });
  const appStaple = command("/usr/bin/xcrun", ["stapler", "validate", appPath], { allowFailure: true });
  const dmgStaple = command("/usr/bin/xcrun", ["stapler", "validate", dmgPath], { allowFailure: true });
  return {
    gatekeeperAccepted: gatekeeper.status === 0,
    appStapled: appStaple.status === 0,
    dmgStapled: dmgStaple.status === 0,
    gatekeeperDetail: (gatekeeper.stderr || gatekeeper.stdout).trim().split("\n").slice(-3)
  };
}

async function extractedUpdaterApp(zipPath, directory) {
  command("/usr/bin/ditto", ["-x", "-k", zipPath, directory]);
  const entries = await readdir(directory, { recursive: true });
  const relative = entries.map(String).find((entry) => entry.endsWith(".app/Contents/Info.plist"));
  invariant(relative, "updater ZIP does not contain a macOS App bundle");
  return path.join(directory, relative.slice(0, -"/Contents/Info.plist".length));
}

function dmgFormat(dmgPath) {
  const imageInfo = command("/usr/bin/hdiutil", ["imageinfo", "-plist", dmgPath]).stdout;
  return command("/usr/bin/plutil", ["-extract", "Format", "raw", "-o", "-", "-"], { input: imageInfo }).stdout.trim();
}

export async function qualifyPrepublicationUpdate({ handoffPlan, requireReleaseTrust, requirePublicFeed, releaseTrustAccepted,
  previewUpgradeVmReceipt, previewVersion, previewZipSha256, runLocalUpdater }) {
  if (!requireReleaseTrust || requirePublicFeed || !releaseTrustAccepted) return null;
  if (handoffPlan?.enabled === true) {
    invariant(previewUpgradeVmReceipt, "Terminal Preview must be qualified in isolated Tart VMs; host local updater execution is forbidden");
    const { validatePreviewUpgradeReceipt } = await import("./stable-qualify-preview-upgrade.mjs");
    return validatePreviewUpgradeReceipt(JSON.parse(await readFile(previewUpgradeVmReceipt, "utf8")), {
      previewVersion, previewZipSha256, target: handoffPlan.target
    });
  }
  return runLocalUpdater();
}

export async function qualifyMacDistribution({
  outRoot = path.join(repositoryRoot, "out"),
  packageFile = path.join(repositoryRoot, "package.json"),
  requireReleaseTrust = false,
  requirePublicFeed = false,
  identity = process.env.OPL_DESKTOP_RELEASE_IDENTITY ?? "preview",
  expectedVersion = process.env.OPL_UPDATER_VERSION,
  publicFeedUrl = process.env.OPL_DESKTOP_PUBLIC_UPDATE_FEED_URL,
  previewUpgradeVmReceipt = process.env.OPL_PREVIEW_UPGRADE_VM_RECEIPT,
  fetchImpl = globalThis.fetch
} = {}) {
  invariant(process.platform === "darwin", "macOS distribution qualification requires macOS");
  const pkg = JSON.parse(await readFile(packageFile, "utf8"));
  invariant(["preview", "stable"].includes(identity), "unknown desktop release identity");
  const machineVersion = identity === "stable" ? expectedVersion : pkg.version;
  invariant(semver.valid(machineVersion), "release controller must provide the Stable updater version");
  const feed = await prepareMacUpdateFeed({ outRoot });
  invariant(feed.version === machineVersion, `feed version ${feed.version} does not match expected version ${machineVersion}`);
  const zip = feed.artifacts.find((entry) => entry.name.endsWith(".zip"));
  const dmg = feed.artifacts.find((entry) => entry.name.endsWith(".dmg"));
  invariant(zip && dmg, "qualified feed must bind one ZIP and one DMG");
  invariant(await stat(path.join(outRoot, `${zip.name}.blockmap`)), "updater ZIP blockmap is missing");
  command("/usr/bin/hdiutil", ["verify", path.join(outRoot, dmg.name)]);
  const format = dmgFormat(path.join(outRoot, dmg.name));
  invariant(format === "ULFO", `macOS DMG must use ULFO, observed ${format}`);

  const extractionRoot = await mkdtemp(path.join(os.tmpdir(), "opl-desktop-qualification-"));
  try {
    const appPath = await extractedUpdaterApp(path.join(outRoot, zip.name), extractionRoot);
    const infoPlist = path.join(appPath, "Contents", "Info.plist");
    const version = plistValue(infoPlist, "CFBundleShortVersionString");
    const buildVersion = plistValue(infoPlist, "CFBundleVersion");
    const bundleIdentifier = plistValue(infoPlist, "CFBundleIdentifier");
    const productName = plistValue(infoPlist, "CFBundleDisplayName");
    invariant(version === machineVersion && buildVersion === machineVersion, "App bundle version does not match update feed");
    invariant(bundleIdentifier === (identity === "stable" ? "cn.onepersonlab.opl" : "cn.onepersonlab.opl.studio.preview"), "App bundle identity mismatch");
    invariant(productName === (identity === "stable" ? "One Person Lab" : "One Person Lab Preview"), "App product name mismatch");

    const signature = signatureDetails(appPath);
    invariant(signature.valid, "updater ZIP App signature is invalid");
    invariant(signature.authority?.startsWith("Developer ID Application:"), "updater ZIP App is not Developer ID signed");
    invariant(signature.teamIdentifier === "SVVC4TA784", "updater ZIP publisher does not match OPL");
    invariant(signature.hardenedRuntime, "updater ZIP App does not enable hardened runtime");

    const appUpdate = parse(await readFile(path.join(appPath, "Contents", "Resources", "app-update.yml"), "utf8"));
    invariant(appUpdate?.provider === "github", "App update provider must be GitHub");
    invariant(appUpdate?.owner === "gaofeng21cn" && appUpdate?.repo === (identity === "stable" ? "one-person-lab-app" : "opl-studio"), "App must use its identity-bound updater feed");

    const trust = trustResult(appPath, path.join(outRoot, dmg.name));
    const releaseTrustAccepted = trust.gatekeeperAccepted && trust.appStapled && trust.dmgStapled;
    const handoffPlanPath = path.join(appPath, "Contents", "Resources", "preview-handoff.json");
    const handoffPlan = identity === "preview"
      ? await readFile(handoffPlanPath, "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return null; throw error; })
      : null;
    // The App release executor calls this on sealed signed bytes before publish.
    // A failed real Squirrel replacement must stop that job, not create a bad release.
    const prepublicationUpdate = await qualifyPrepublicationUpdate({ handoffPlan, requireReleaseTrust, requirePublicFeed, releaseTrustAccepted,
      previewUpgradeVmReceipt, previewVersion: machineVersion, previewZipSha256: await digest(path.join(outRoot, zip.name), "sha256", "hex"),
      runLocalUpdater: async () => identity === "stable"
        ? await qualifyLocalUpdater({ baseAppPath: appPath, buildNextTarget: true, identity: "stable" })
        : await qualifyPreviousSignedUpdate({ outRoot, targetVersion: machineVersion, targetSignature: signature, extractionRoot, fetchImpl })
    });
    let publicFeed = {
      schema: "opl_public_desktop_update_feed_qualification.v1",
      qualified: false,
      baseUrl: publicFeedUrl || null,
      reason: "public_update_feed_url_required"
    };
    if (publicFeedUrl) {
      try {
        publicFeed = await validateMacPublicUpdateFeed({
          outRoot,
          publicFeedUrl,
          expectedVersion: machineVersion,
          identity,
          fetchImpl
        });
      } catch (error) {
        publicFeed = {
          schema: "opl_public_desktop_update_feed_qualification.v1",
          qualified: false,
          baseUrl: null,
          reason: "public_update_feed_qualification_failed",
          detail: error instanceof Error ? error.message : String(error)
        };
      }
    }
    const releaseBlockers = [];
    if (!releaseTrustAccepted) releaseBlockers.push("apple_notarization_and_stapling_required");
    if (!publicFeed.qualified) releaseBlockers.push("public_update_feed_qualification_required");
    const receipt = {
      schema: "opl_macos_desktop_distribution_qualification.v1",
      prepublicationUpdate,
      carrier: "electron_desktop",
      candidateId: "opl-studio",
      productName,
      bundleIdentifier,
      version,
      buildVersion,
      architecture: process.arch,
      feed,
      dmg: { name: dmg.name, format, verified: true },
      updaterZip: { name: zip.name, blockmapPresent: true },
      signature,
      trust,
      publicFeed,
      localDistributableCandidate: true,
      releaseReady: releaseBlockers.length === 0,
      releaseBlocker: releaseBlockers[0] ?? null,
      releaseBlockers
    };
    await writeFile(path.join(outRoot, "macos-distribution-qualification.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    const requiredFailures = [];
    if (requireReleaseTrust && !releaseTrustAccepted) requiredFailures.push("Gatekeeper acceptance and stapled App/DMG tickets");
    if (requirePublicFeed && !publicFeed.qualified) {
      requiredFailures.push(publicFeed.detail ?? "an anonymously downloadable public update feed");
    }
    invariant(requiredFailures.length === 0, `release admission requires ${requiredFailures.join("; ")}`);
    return receipt;
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const receipt = await qualifyMacDistribution({
    requireReleaseTrust: process.argv.includes("--require-release-trust"),
    requirePublicFeed: process.argv.includes("--require-public-feed")
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

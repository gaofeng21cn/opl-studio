import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { createGuestCoreProxy } from "./guest-core-proxy.mjs";

export async function verifyGuestPayloadFiles(root, manifest, { paths } = {}) {
  const declared = manifest.files;
  if (!Array.isArray(declared) || declared.length === 0 || !declared.every(entry => typeof entry.path === "string"
    && !entry.path.startsWith("/") && !entry.path.split("/").some(part => !part || part === "." || part === "..")
    && !/[\r\n\0]/.test(entry.path) && /^[0-9a-f]{64}$/.test(entry.sha256))) {
    throw new Error("Windows guest Host payload integrity manifest is missing");
  }
  const actual = [];
  const add = async name => {
    const stat = await fs.promises.lstat(path.join(root, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Windows guest Host payload contains a symbolic link or special file");
    actual.push({ path: name, sha256: crypto.createHash("sha256").update(await fs.promises.readFile(path.join(root, name))).digest("hex") });
  };
  const visit = async relative => {
    for (const item of await fs.promises.readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error("Windows guest Host payload contains a symbolic link");
      if (item.isDirectory()) await visit(name);
      else if (item.isFile() && name !== "manifest.json") await add(name);
      else if (name !== "manifest.json") throw new Error("Windows guest Host payload contains an unsupported file");
    }
  };
  // Launch checks the archive and the code that admits it. The complete Host
  // closure is verified after extraction on ext4, rather than rereading unused
  // NTFS copies. Bootstrap separately checks every source it executes or copies.
  if (paths) {
    if (paths.some(name => !declared.some(entry => entry.path === name))) throw new Error("Windows guest Host payload admission path is missing");
    for (const name of paths) await add(name);
  } else await visit("");
  actual.sort((a, b) => a.path.localeCompare(b.path));
  const expected = paths ? declared.filter(entry => paths.includes(entry.path)) : declared;
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort((a, b) => a.path.localeCompare(b.path)))) {
    throw new Error("Windows guest Host payload bytes differ from the packaged manifest");
  }
  const lock = actual.find(entry => entry.path === "package-lock.json");
  if (lock && lock.sha256 !== manifest.package_lock_sha256) throw new Error("Windows guest Host payload lock digest mismatch");
}

export async function createWindowsGuestHost({ windowsRuntime, resourcesPath, userDataPath, env = process.env,
  version, instanceId, canonicalThreadHost = os.hostname(), platform = {}, nativeUpdater, carrierDiagnostics, candidateActionAllowlist = [],
  readFile = fs.readFileSync, verifyPayload = verifyGuestPayloadFiles, onProgress = () => {} } = {}) {
  const runtime = await windowsRuntime.ensureReady();
  const hostRoot = path.join(resourcesPath, "opl-wsl-host");
  const manifestBytes = readFile(path.join(hostRoot, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== "opl_studio_windows_guest_host.v1" || manifest.platform !== "linux" || manifest.arch !== "x64"
    || manifest.entry !== "desktop/windows-guest-host.mjs" || !/^[0-9a-f]{40}$/.test(manifest.shell_ref)
    || !/^[0-9a-f]{64}$/.test(manifest.package_lock_sha256)) throw new Error("Packaged Windows guest Host manifest is invalid");
  await verifyPayload(hostRoot, manifest, { paths: ["guest-host.tar.gz", "desktop/windows-guest-stage.mjs", "package-lock.json"] });
  const guestRoot = await windowsRuntime.projectHostPath(hostRoot);
  const guestDataRoot = await windowsRuntime.projectHostPath(userDataPath);
  const entry = await windowsRuntime.stageGuestHost(guestRoot, crypto.createHash("sha256").update(manifestBytes).digest("hex"));
  const child = windowsRuntime.spawnGuestHost(entry, { env });
  return createGuestCoreProxy({ child, platform, nativeUpdater, carrierDiagnostics, onProgress,
    initialize: { version, instanceId, canonicalThreadHost, identity: runtime.identity, guestDataRoot,
      channelBindingFile: `${guestDataRoot}/channel-transport-bindings.json`, candidateActionAllowlist },
    projectHostPath: value => windowsRuntime.projectHostPath(value),
    projectGuestPath: value => windowsRuntime.projectGuestPath(value),
    closeChild: () => windowsRuntime.close() });
}

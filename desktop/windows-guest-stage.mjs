import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const archiveName = "guest-host.tar.gz";

// NTFS is the immutable package source. Execute the verified Host closure on
// ext4: importing thousands of modules through WSL's mounted drive can exceed
// the RPC deadline even when the native package and managed runtime are healthy.
export function stageWindowsGuestHost(source, expectedDigest, cacheRoot = "/home/opl/.opl/studio-host") {
  const bytes = fs.readFileSync(path.join(source, "manifest.json"));
  if (!/^[0-9a-f]{64}$/.test(expectedDigest) || digest(bytes) !== expectedDigest) throw new Error("Guest Host manifest digest mismatch");
  const manifest = JSON.parse(bytes);
  const archive = manifest.files?.find(item => item.path === archiveName);
  const files = manifest.files?.filter(item => !item.path.startsWith("runtime/") && item.path !== archiveName);
  if (manifest.schema !== "opl_studio_windows_guest_host.v1" || manifest.entry !== "desktop/windows-guest-host.mjs" || !archive || !files?.length
    || files.some(item => typeof item.path !== "string" || item.path.startsWith("/") || item.path.split("/").some(part => !part || part === "." || part === "..")
      || /[\r\n\0]/.test(item.path) || !/^[0-9a-f]{64}$/.test(item.sha256))) throw new Error("Invalid guest Host staging manifest");
  const target = path.join(cacheRoot, expectedDigest, "opl-wsl-host");
  const verify = root => {
    const actual = [];
    const visit = relative => {
      for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const name = path.posix.join(relative, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Guest Host cache contains a symbolic link");
        if (entry.isDirectory()) visit(name);
        else if (entry.isFile() && name !== "manifest.json") actual.push(name);
        else if (!entry.isFile()) throw new Error("Guest Host cache contains a special file");
      }
    };
    visit("");
    if (JSON.stringify(actual.sort()) !== JSON.stringify(files.map(item => item.path).sort())) throw new Error("Guest Host cache inventory mismatch");
    if (digest(fs.readFileSync(path.join(root, "manifest.json"))) !== expectedDigest
      || files.some(item => digest(fs.readFileSync(path.join(root, item.path))) !== item.sha256)) throw new Error("Guest Host cache byte mismatch");
  };
  if (fs.existsSync(target)) { verify(target); return { entry: path.join(target, manifest.entry), reused: true }; }
  const archivePath = path.join(source, archiveName);
  if (digest(fs.readFileSync(archivePath)) !== archive.sha256) throw new Error("Guest Host archive digest mismatch");
  const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (listing.status !== 0 || JSON.stringify(listing.stdout.trimEnd().split("\n").sort()) !== JSON.stringify(files.map(item => item.path).sort())) throw new Error("Guest Host archive inventory mismatch");
  const types = spawnSync("tar", ["-tvzf", archivePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (types.status !== 0 || types.stdout.trimEnd().split("\n").some(line => !line.startsWith("-"))) throw new Error("Guest Host archive contains nonregular files");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = fs.mkdtempSync(path.join(path.dirname(target), ".staging-"));
  try {
    const extracted = spawnSync("tar", ["-xzf", archivePath, "--no-same-owner", "-C", temporary], { encoding: "utf8", timeout: 120000 });
    if (extracted.status !== 0) throw new Error("Guest Host archive extraction failed");
    fs.writeFileSync(path.join(temporary, "manifest.json"), bytes, { mode: 0o600 });
    verify(temporary);
    if (fs.existsSync(target)) verify(target);
    else fs.renameSync(temporary, target);
    return { entry: path.join(target, manifest.entry), reused: false };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== "linux" || process.arch !== "x64" || !/^\/mnt\/.*\/opl-wsl-host$/.test(process.argv[2] ?? "")) throw new Error("Invalid mounted guest Host source");
  process.stdout.write(JSON.stringify(stageWindowsGuestHost(process.argv[2], process.argv[3])) + "\n");
}

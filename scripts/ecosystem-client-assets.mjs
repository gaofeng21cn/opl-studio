import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const viewerCarrierRoot = path.join(root, "packages/opl-studio-ecosystem/dsh-file-viewer");
const source = Object.freeze({
  package: "dsh-file-viewer",
  version: "0.3.3",
  repository: "https://github.com/liguobao/dsh-file-viewer",
  license: "MIT",
  integrity: "sha512-7oSTZ59WEol7qJ6VlpNmLgt0KSHNeSZLaT6h6w1uv1mH9IyYXBPsodrS/U/26PURT/tfslFiXce1jrW5DqA4lw==",
  mode: "unmodified_npm_browser_artifact_only",
  hostHalfLoaded: false,
  peerPolicy: "original_metadata_preserved_no_peer_override",
});
const entries = { "dist/client.js": "client.js", "LICENSE": "LICENSE", "package.json": "upstream-package.json" };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifyViewerCarrier() {
  const manifest = JSON.parse(fs.readFileSync(path.join(viewerCarrierRoot, "manifest.json"), "utf8"));
  for (const [key, value] of Object.entries(source)) {
    if (manifest[key] !== value) throw new Error(`file viewer carrier provenance drift: ${key}`);
  }
  for (const filename of Object.values(entries)) {
    if (sha256(fs.readFileSync(path.join(viewerCarrierRoot, filename))) !== manifest.files[filename]) {
      throw new Error(`file viewer carrier byte drift: ${filename}`);
    }
  }
  return manifest;
}

function syncViewerCarrier() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "opl-ecosystem-npm-"));
  try {
    const packed = spawnSync("npm", ["pack", `${source.package}@${source.version}`, "--ignore-scripts", "--json", "--pack-destination", temporary], { encoding: "utf8" });
    if (packed.status !== 0) throw new Error(packed.stderr || "npm pack failed");
    const receipt = JSON.parse(packed.stdout)[0];
    const archive = path.join(temporary, path.basename(receipt.filename));
    const actual = `sha512-${createHash("sha512").update(fs.readFileSync(archive)).digest("base64")}`;
    if (actual !== source.integrity || receipt.integrity !== source.integrity) throw new Error("file viewer npm artifact integrity mismatch");
    fs.mkdirSync(viewerCarrierRoot, { recursive: true });
    const files = {};
    for (const [entry, filename] of Object.entries(entries)) {
      // Extract only the explicitly reviewed regular payloads, never an arbitrary archive tree.
      const extracted = spawnSync("tar", ["-xOf", archive, `package/${entry}`], { maxBuffer: 8 * 1024 * 1024 });
      if (extracted.status !== 0) throw new Error(String(extracted.stderr));
      fs.writeFileSync(path.join(viewerCarrierRoot, filename), extracted.stdout);
      files[filename] = sha256(extracted.stdout);
    }
    fs.writeFileSync(path.join(viewerCarrierRoot, "manifest.json"), `${JSON.stringify({ ...source, files }, null, 2)}\n`);
    return verifyViewerCarrier();
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(process.argv.includes("--sync") ? syncViewerCarrier() : verifyViewerCarrier(), null, 2));
}

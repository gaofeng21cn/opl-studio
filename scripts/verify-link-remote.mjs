import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "src/host/vendor/dsh-remote");
const manifestFile = path.join(directory, "provenance.json");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sourceFlag = process.argv.indexOf("--source");
if (sourceFlag >= 0) {
  const source = path.resolve(process.argv[sourceFlag + 1] ?? "");
  const revision = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (revision !== manifest.revision) throw new Error("Review and update the App-owned upstream revision before importing another source.");
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!entry.source) continue;
    const bytes = execFileSync("git", ["-C", source, "show", `${revision}:${entry.source}`], { maxBuffer: 16 * 1024 * 1024 });
    await writeFile(path.join(directory, name), bytes);
  }
  execFileSync("bun", ["build", "loopback.ts", "--target=node", "--format=esm", "--packages=external", "--outfile", "loopback.mjs"], { cwd: directory, stdio: "pipe" });
  for (const [name, entry] of Object.entries(manifest.files)) entry.sha256 = sha(await readFile(path.join(directory, name)));
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}
for (const [name, entry] of Object.entries(manifest.files)) {
  if (sha(await readFile(path.join(directory, name))) !== entry.sha256) throw new Error(`Pinned Remote bytes changed: ${name}`);
}
console.log(JSON.stringify({ status: "verified", upstream: manifest.repository, revision: manifest.revision, files: Object.keys(manifest.files).length }));

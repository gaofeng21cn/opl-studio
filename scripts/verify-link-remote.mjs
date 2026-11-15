import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

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
  const rtcSources = execFileSync("git", ["-C", source, "ls-tree", "-r", "--name-only", revision, "--", "packages/protocol/src", "packages/webrtc/src"], { encoding: "utf8" }).trim().split("\n")
    .filter(name => name.endsWith(".ts") && !/\.(?:test|spec)\.ts$/.test(name));
  rtcSources.push("packages/plugin/src/werift-rtc.ts", "packages/plugin/src/native-rtc-helper.ts");
  for (const original of rtcSources) {
    const name = `source/${original}`;
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), execFileSync("git", ["-C", source, "show", `${revision}:${original}`], { maxBuffer: 16 * 1024 * 1024 }));
    manifest.files[name] = { source: original };
  }
  execFileSync("bun", ["build", "loopback.ts", "--target=node", "--format=esm", "--packages=external", "--outfile", "loopback.mjs"], { cwd: directory, stdio: "pipe" });
  await build({ absWorkingDir: directory, entryPoints: ["rtc-entry.mjs"], outfile: "rtc.mjs", bundle: true, platform: "node", format: "esm", minifySyntax: true,
    alias: { "@dsh-remote/protocol": path.join(directory, "source/packages/protocol/src/index.ts"), "@dsh-remote/webrtc": path.join(directory, "source/packages/webrtc/src/index.ts") },
    external: ["@roamhq/wrtc"], banner: { js: 'import { createRequire as __rtcCreateRequire } from "node:module";const require=__rtcCreateRequire(import.meta.url);' } });
  manifest.files["rtc-entry.mjs"] = { authored_entry: true };
  manifest.files["rtc.mjs"] = { generated_from: "rtc-entry.mjs" };
  manifest.rtc_bundle = { entry: "rtc-entry.mjs", runtime: "official_loadNodeRtcFactory_with_native_optional_and_bundled_werift_fallback", dependencies: { werift: "0.26.0" }, optional_external: ["@roamhq/wrtc"], builder: "esbuild@0.25.12", upstream_sources_modified: false };
  for (const [name, entry] of Object.entries(manifest.files)) entry.sha256 = sha(await readFile(path.join(directory, name)));
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}
for (const [name, entry] of Object.entries(manifest.files)) {
  if (sha(await readFile(path.join(directory, name))) !== entry.sha256) throw new Error(`Pinned Remote bytes changed: ${name}`);
}
console.log(JSON.stringify({ status: "verified", upstream: manifest.repository, revision: manifest.revision, files: Object.keys(manifest.files).length }));

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const patchRoot = new URL("../src/integrations/deepseek-harness/patches/", import.meta.url);
const sha256 = value => createHash("sha256").update(value).digest("hex");

// Exact context only: an upstream update must be deliberately reviewed, never fuzz-applied.
function applyExactPatch(source, patch) {
  const original = source.split("\n");
  const output = [];
  const lines = patch.split("\n");
  let cursor = 0;
  for (let i = 2; i < lines.length; i += 1) {
    const header = lines[i].match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (!header) {
      if (lines[i] === "" && i === lines.length - 1) break;
      throw new Error("Invalid settings search compatibility patch");
    }
    const start = Number(header[1]) - 1;
    if (start < cursor) throw new Error("Overlapping settings search patch hunks");
    output.push(...original.slice(cursor, start));
    cursor = start;
    while (i + 1 < lines.length && !lines[i + 1].startsWith("@@") && !(i + 1 === lines.length - 1 && lines[i + 1] === "")) {
      const line = lines[++i];
      if (line[0] !== "+") {
        if (![" ", "-"].includes(line[0]) || original[cursor] !== line.slice(1)) throw new Error("Settings search patch context changed");
        cursor += 1;
      }
      if (line[0] !== "-") output.push(line.slice(1));
    }
  }
  return [...output, ...original.slice(cursor)].join("\n");
}

export function readStudioSettingsSearchClient() {
  const manifest = JSON.parse(readFileSync(new URL("settings-search-studio.json", patchRoot), "utf8"));
  const pkg = require(`${manifest.package}/package.json`);
  const source = readFileSync(require.resolve(`${manifest.package}/client`), "utf8");
  const patch = readFileSync(new URL(manifest.patch, patchRoot), "utf8");
  if (pkg.version !== manifest.version || sha256(source) !== manifest.upstreamSha256 || sha256(patch) !== manifest.patchSha256) {
    throw new Error("Settings search compatibility input changed; review the pinned upstream and patch");
  }
  const result = applyExactPatch(source, patch);
  if (sha256(result) !== manifest.resultSha256) throw new Error("Settings search compatibility output changed");
  return result;
}

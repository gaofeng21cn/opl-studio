import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/** Compile display assets; this never supplies catalog admission or software lifecycle state. */
export function generateSoftwareArtwork(root, appRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "contracts/software-artwork-assets.json"), "utf8"));
  const identities = new Set();
  const files = new Map();
  const imports = [];
  const rows = [];
  const canonicalIds = [];
  for (const asset of manifest.assets) {
    if (!/^[a-z0-9-]+\.png$/.test(asset.file) || !Array.isArray(asset.identities) || !asset.identities.length || files.has(asset.file)) throw new Error("Invalid software artwork manifest");
    const bytes = fs.readFileSync(path.join(root, "src/assets/software-icons", asset.file));
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Software artwork differs from its owner manifest: ${asset.file}`);
    const name = `artwork${files.size}`;
    files.set(asset.file, name);
    imports.push(`import ${name} from ${JSON.stringify(`../assets/software-icons/${asset.file}`)};`);
    canonicalIds.push(asset.identities[0]);
    for (const id of asset.identities) {
      if (typeof id !== "string" || !id.trim() || identities.has(id)) throw new Error("Duplicate or invalid artwork identity");
      identities.add(id);
      rows.push(`  ${JSON.stringify(id)}: ${name},`);
    }
  }
  if (!files.has(manifest.fallback)) throw new Error("Software artwork fallback is missing");
  const source = `// Generated from one-person-lab-app/contracts/software-artwork-assets.json. Do not edit.\n${imports.join("\n")}\n\nexport const softwareArtworkById: Readonly<Record<string, string>> = Object.freeze({\n${rows.join("\n")}\n});\nexport const softwareArtworkCatalogIds = Object.freeze(${JSON.stringify(canonicalIds)});\nexport const genericSoftwareIconUrl = ${files.get(manifest.fallback)};\n`;
  const target = path.join(root, "src/generated/softwareArtwork.generated.ts");
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== source) fs.writeFileSync(target, source);
}

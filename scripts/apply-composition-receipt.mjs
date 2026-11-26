#!/usr/bin/env node
/**
 * Apply a DSH plugin composition receipt to package.json and invalidate its
 * selected local plugin resolutions before npm refreshes the lockfile.
 *
 * Replaces file:plugins/<name> deps for OPL Host/client plugins with the exact
 * registry versions from the receipt. After running this script, `npm ci`
 * installs pre-built plugin packages from GitHub Packages instead of
 * compiling them from local source — enabling the shell-unchanged stable
 * release path.
 *
 * Usage:
 *   node scripts/apply-composition-receipt.mjs --receipt <path>
 *   node scripts/apply-composition-receipt.mjs --receipt <path> --dry-run
 *
 * To restore file: deps (e.g. after a build):
 *   git checkout package.json package-lock.json
 *
 * Design: docs/delivery/dsh-plugin-publication.md (in one-person-lab-app)
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { listDshSourcePackages } from "../packages/host-kit/src/dsh-source-packages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    receipt: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.receipt) {
  console.log(
    "Usage: node scripts/apply-composition-receipt.mjs --receipt <path> [--dry-run]\n" +
    "  --receipt    Path to composition_receipt.json\n" +
    "  --dry-run    Print the patched package.json without writing it\n" +
    "\nRestoring: git checkout package.json package-lock.json"
  );
  process.exit(values.help ? 0 : 1);
}

// Read and validate the receipt
const receiptPath = path.resolve(values.receipt);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (receipt.schema !== "opl_dsh_plugin_composition_receipt.v1") {
  throw new Error(`Unexpected receipt schema: ${receipt.schema}`);
}
if (!receipt.plugins || typeof receipt.plugins !== "object" || Array.isArray(receipt.plugins)) {
  throw new Error("Receipt is missing 'plugins' map");
}

// Read current package.json
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (receipt.dsh_cohort !== pkg.dependencies?.["@deepseek-ai/dsh-app-boot"]) {
  throw new Error("Composition receipt DSH cohort differs from the selected carrier");
}

// Map receipt package names to their directory names
const dirForPackage = new Map(
  Object.entries(pkg.dependencies || {})
    .filter(([, v]) => typeof v === "string" && v.startsWith("file:plugins/"))
    .map(([name, v]) => [name, v]) // e.g. "@gaofeng21cn/opl-superagent" → "file:plugins/extensions/opl-superagent"
);

const changes = [];
const publishable = listDshSourcePackages(root)
  .map(entry => entry.manifest)
  .filter(manifest => manifest.publishConfig?.registry === receipt.registry && !manifest.private)
  .map(manifest => manifest.name);
if (publishable.length !== Object.keys(receipt.plugins).length || publishable.some(name => !Object.hasOwn(receipt.plugins, name))) {
  throw new Error("Composition receipt must contain the complete published DSH plugin set");
}

for (const [pkgName, version] of Object.entries(receipt.plugins)) {
  if (!dirForPackage.has(pkgName)) {
    throw new Error(`Receipt package is not a local DSH plugin dependency: ${pkgName}`);
  }
  // This script runs before dependencies are installed. Reject ranges and
  // install specs here; npm validates the exact version during lock refresh.
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Receipt version must be exact: ${pkgName}`);
  }
  const previous = pkg.dependencies[pkgName];
  pkg.dependencies[pkgName] = version;
  changes.push({ name: pkgName, from: previous, to: version });
}

if (!changes.length) {
  console.log("No matching deps to patch — receipt plugins may not overlap with file: deps in package.json");
  process.exit(0);
}

console.log("Composition receipt:", receiptPath);
console.log(`DSH cohort: ${receipt.dsh_cohort}`);
console.log(`Tested at: ${receipt.tested_at}`);
console.log("\nDependency changes:");
for (const { name, from, to } of changes) {
  console.log(`  ${name}: ${from} → ${to}`);
}

if (values["dry-run"]) {
  console.log("\n--dry-run: not changing manifests, lockfile or installed plugins");
  process.exit(0);
}

// npm can retain a file: link after a dependency changes to the same registry
// version, even during `npm install --package-lock-only`. Remove only the
// selected plugin records and installed paths so npm must resolve their
// registry tarballs. Keep every unrelated locked dependency unchanged.
const lockPath = path.join(root, "package-lock.json");
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
if (lock && (!lock.packages || !lock.packages[""])) {
  throw new Error("Composition installation requires a package-lock v2/v3 packages map");
}
if (lock) {
  for (const { name, from, to } of changes) {
    lock.packages[""].dependencies[name] = to;
    const installedKey = `node_modules/${name}`;
    const sourceKey = from.slice("file:".length);
    for (const key of Object.keys(lock.packages)) {
      if (key === installedKey || key.startsWith(`${installedKey}/node_modules/`)
        || key === sourceKey || key.startsWith(`${sourceKey}/node_modules/`)) {
        delete lock.packages[key];
      }
    }
  }
}

for (const { name } of changes) {
  const installedPath = path.join(root, "node_modules", name);
  const installed = fs.lstatSync(installedPath, { throwIfNoEntry: false });
  if (!installed) continue;
  // Unlink explicitly: never follow the old link into plugins/<id>.
  if (installed.isSymbolicLink()) fs.unlinkSync(installedPath);
  else fs.rmSync(installedPath, { recursive: true, force: true });
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
if (lock) fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log("\nSelected local plugin resolutions cleared. Run: npm install --package-lock-only --ignore-scripts && OPL_DSH_REGISTRY_PLUGINS=1 npm ci");
console.log("Then build with: npm run build:desktop -- --registry-plugins");
console.log("To restore: git checkout package.json package-lock.json");

// Emit a machine-readable result for CI
const result = {
  schema: "opl_dsh_composition_receipt_applied.v1",
  receipt_path: receiptPath,
  dsh_cohort: receipt.dsh_cohort,
  tested_at: receipt.tested_at,
  applied_versions: Object.fromEntries(changes.map(({ name, to }) => [name, to])),
  original_file_deps: Object.fromEntries(
    changes.map(({ name, from }) => [name, from])
  ),
};
fs.writeFileSync(
  path.join(root, "composition-receipt-applied.json"),
  JSON.stringify(result, null, 2) + "\n"
);
console.log("\nMachine result written to: composition-receipt-applied.json");

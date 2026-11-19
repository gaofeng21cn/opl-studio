#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { compositionLockEntries, verifyCompositionInstallation } from "./verify-composition-installation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receiptName = "composition_receipt.json";
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const lockPath = path.join(root, "package-lock.json");
function runNpm(args, options) {
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return process.platform === "win32"
    ? execFileSync(process.execPath, [cli, ...args], options)
    : execFileSync("npm", args, options);
}

function tarballPath(directory, { name, version }) {
  return path.join(directory, "tarballs", `${name.replaceAll("/", "-")}-${version}.tgz`);
}

function verifyTarball(file, { integrity }) {
  const bytes = fs.readFileSync(file);
  const sha512 = createHash("sha512").update(bytes).digest("base64");
  if (!integrity.split(/\s+/).includes(`sha512-${sha512}`)) {
    throw new Error(`Tarball differs from the tested npm lock: ${path.basename(file)}`);
  }
}

function capture(directory, receiptPath) {
  const receipt = readJson(receiptPath);
  verifyCompositionInstallation({ root, receipt });
  const entries = compositionLockEntries({ lock: readJson(lockPath), receipt });
  const tarballs = path.join(directory, "tarballs");
  fs.mkdirSync(tarballs, { recursive: true });
  const packedValue = JSON.parse(runNpm([
    "pack", "--ignore-scripts", "--json", "--pack-destination", tarballs, "--registry", receipt.registry,
    ...entries.map(({ name, version }) => `${name}@${version}`),
  ], { cwd: root, encoding: "utf8" }));
  const packed = Array.isArray(packedValue) ? packedValue : Object.values(packedValue);
  for (const item of entries) {
    const match = packed.find(result => result.name === item.name && result.version === item.version);
    if (!match || !match.filename || path.basename(match.filename) !== match.filename) {
      throw new Error(`npm did not pack the tested version of ${item.name}`);
    }
    const source = path.join(tarballs, match.filename);
    verifyTarball(source, item.entry);
    fs.renameSync(source, tarballPath(directory, item));
  }
  fs.copyFileSync(lockPath, path.join(directory, "package-lock.json"));
  fs.copyFileSync(receiptPath, path.join(directory, receiptName));
}

function install(directory) {
  const receiptPath = path.join(directory, receiptName);
  const receipt = readJson(receiptPath);
  const lockBytes = fs.readFileSync(path.join(directory, "package-lock.json"));
  const lock = JSON.parse(lockBytes);
  const entries = compositionLockEntries({ lock, receipt });
  for (const item of entries) {
    const file = tarballPath(directory, item);
    verifyTarball(file, item.entry);
    item.entry.resolved = pathToFileURL(file).href;
  }
  execFileSync(process.execPath, [path.join(root, "scripts/apply-composition-receipt.mjs"), "--receipt", receiptPath], {
    cwd: root, stdio: "inherit",
  });
  const env = { ...process.env, OPL_DSH_REGISTRY_PLUGINS: "1" };
  try {
    // Fetch the admitted registry bytes from the local handoff. Keep the
    // original lock for provenance and for any subsequent build inspection.
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    runNpm(["ci", "--no-audit", "--no-fund"], {
      cwd: root, env, stdio: "inherit",
    });
  } finally {
    fs.writeFileSync(lockPath, lockBytes);
  }
  verifyCompositionInstallation({ root, receipt });
}

const { positionals: [action], values } = parseArgs({
  allowPositionals: true, options: { directory: { type: "string" }, receipt: { type: "string" } },
});
if (!values.directory || !["capture", "install"].includes(action) || (action === "capture" && !values.receipt)) {
  throw new Error("Usage: composition-build-input.mjs capture --directory <dir> --receipt <file> | install --directory <dir>");
}
const directory = path.resolve(values.directory);
if (action === "capture") capture(directory, path.resolve(values.receipt));
else install(directory);

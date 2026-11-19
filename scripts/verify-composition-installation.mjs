#!/usr/bin/env node
/** Verify an installed registry composition without resolving or changing it. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const digestLengths = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 };

function fail(name, reason) {
  throw new Error(`${name}: ${reason}`);
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function hasIntegrity(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return value.trim().split(/\s+/).every(token => {
    const match = /^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})(?:\?[^\s]+)?$/.exec(token);
    if (!match) return false;
    const [, algorithm, encoded] = match;
    const digest = Buffer.from(encoded, "base64");
    return digest.length === digestLengths[algorithm]
      && digest.toString("base64").replace(/=+$/, "") === encoded.replace(/=+$/, "");
  });
}

function verifyEntry(packageRoot, value, name, field) {
  if (typeof value !== "string" || !value || value.includes("\\")
    || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail(name, `${field} must name a package-relative file`);
  }
  const filename = path.resolve(packageRoot, value);
  const relative = path.relative(packageRoot, filename);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    fail(name, `${field} must stay inside the installed package`);
  }
  if (!fs.statSync(filename, { throwIfNoEntry: false })?.isFile()) {
    fail(name, `${field} shipped file is missing`);
  }
  const actual = path.relative(packageRoot, fs.realpathSync(filename));
  if (actual === ".." || actual.startsWith(`..${path.sep}`) || path.isAbsolute(actual)) {
    fail(name, `${field} must stay inside the installed package`);
  }
}

export function compositionLockEntries({ lock, receipt }) {
  if (receipt?.schema !== "opl_dsh_plugin_composition_receipt.v1") {
    throw new Error("Unexpected composition receipt schema");
  }
  if (!receipt.plugins || typeof receipt.plugins !== "object" || Array.isArray(receipt.plugins)
    || !Object.keys(receipt.plugins).length) {
    throw new Error("Composition receipt must contain a nonempty plugins map");
  }
  let registry;
  try { registry = new URL(receipt.registry); } catch {
    throw new Error("Composition receipt registry must be an HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(registry.protocol)) {
    throw new Error("Composition receipt registry must be an HTTP(S) URL");
  }
  if (!lock.packages?.[""]) {
    throw new Error("Composition installation requires a package-lock v2/v3 packages map");
  }

  return Object.entries(receipt.plugins).map(([name, version]) => {
    if (!packageName.test(name)) fail("Composition receipt", "invalid package name");
    if (typeof version !== "string" || !exactVersion.test(version)) {
      fail(name, "receipt version must be exact");
    }
    if (lock.packages[""].dependencies?.[name] !== version) {
      fail(name, "root lock dependency differs from the exact receipt version");
    }
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry || entry.link || entry.version !== version) {
      fail(name, "installed lock entry is linked or differs from the receipt version");
    }
    let resolved;
    try { resolved = new URL(entry.resolved); } catch {
      fail(name, "installed lock entry is missing its registry tarball URL");
    }
    if (!["http:", "https:"].includes(resolved.protocol)
      || resolved.origin !== registry.origin || resolved.pathname === "/"
      || resolved.username || resolved.password) {
      fail(name, "installed lock tarball does not come from the receipt registry");
    }
    if (!hasIntegrity(entry.integrity)) fail(name, "installed lock integrity is missing or invalid");
    return { name, version, entry };
  });
}

export function verifyCompositionInstallation({ root, receipt }) {
  const realRoot = fs.realpathSync(root);
  const lock = readJson(path.join(realRoot, "package-lock.json"));
  for (const { name, version } of compositionLockEntries({ lock, receipt })) {
    const packageRoot = path.join(realRoot, "node_modules", name);
    const installed = fs.lstatSync(packageRoot, { throwIfNoEntry: false });
    if (!installed?.isDirectory() || installed.isSymbolicLink()
      || fs.realpathSync(packageRoot) !== packageRoot) {
      fail(name, "installed package must be a registry directory, not a local link");
    }
    const manifest = readJson(path.join(packageRoot, "package.json"));
    if (manifest.name !== name || manifest.version !== version) {
      fail(name, "installed package name/version differs from the receipt");
    }
    if (Object.hasOwn(manifest, "main")) verifyEntry(packageRoot, manifest.main, name, "main");
    if (manifest.dsh && Object.hasOwn(manifest.dsh, "client")) {
      const client = manifest.exports?.["./client"];
      const target = typeof client === "string" ? client : client?.default;
      verifyEntry(packageRoot, target, name, "exports[./client]");
    }
  }
  return { verified_plugins: { ...receipt.plugins } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { receipt: { type: "string" }, help: { type: "boolean" } } });
    if (values.help || !values.receipt) {
      console.log("Usage: node scripts/verify-composition-installation.mjs --receipt <path>");
      process.exitCode = values.help ? 0 : 1;
    } else {
      const root = fileURLToPath(new URL("..", import.meta.url));
      const result = verifyCompositionInstallation({ root, receipt: readJson(path.resolve(values.receipt)) });
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

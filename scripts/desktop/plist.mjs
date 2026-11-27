import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const BINARY_PLIST_MAGIC = "bplist00";
const require = createRequire(import.meta.url);
let cachedPlistPackage = undefined;

function loadPlistPackage() {
  if (process.env.OPL_PLIST_FORCE_PLUTIL_FALLBACK === "1") return null;
  if (cachedPlistPackage !== undefined) return cachedPlistPackage;
  try {
    cachedPlistPackage = require("plist");
    return cachedPlistPackage;
  } catch (error) {
    const code = error?.code;
    const message = String(error?.message ?? "");
    if ((code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") && message.includes("plist")) {
      cachedPlistPackage = null;
      return null;
    }
    throw error;
  }
}

function readViaPlutil(plistPath) {
  const result = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", path.resolve(plistPath)], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) {
    throw new Error(`plist fallback /usr/bin/plutil failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim() || `exit ${String(result.status)}`;
    throw new Error(`plist fallback /usr/bin/plutil failed: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

export function parsePlistDocument(input) {
  const plistPackage = loadPlistPackage();
  if (!plistPackage) {
    // plutil can wait for EOF indefinitely on a child-process stdin pipe.
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "opl-studio-plist-"));
    try {
      const inputPath = path.join(tempDir, "input.plist");
      writeFileSync(inputPath, Buffer.isBuffer(input) ? input : String(input));
      return readViaPlutil(inputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
  if (Buffer.isBuffer(input)) {
    if (input.subarray(0, BINARY_PLIST_MAGIC.length).toString("ascii") === BINARY_PLIST_MAGIC) {
      return plistPackage.parseBinary(input);
    }
    return plistPackage.parse(input.toString("utf8"));
  }
  return plistPackage.parse(String(input));
}

export function readPlistFile(plistPath) {
  if (!loadPlistPackage()) return readViaPlutil(plistPath);
  return parsePlistDocument(readFileSync(plistPath));
}

export function readPlistKey(plistPath, key, { allowFailure = false } = {}) {
  try {
    const document = readPlistFile(plistPath);
    const value = document && typeof document === "object" ? document[key] : undefined;
    if (value === undefined || value === null) {
      if (allowFailure) return null;
      throw new Error(`missing plist key ${key} in ${plistPath}`);
    }
    return String(value).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

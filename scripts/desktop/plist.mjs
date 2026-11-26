import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

function parseViaPlutil(input) {
  const payload = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  const result = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
    input: payload,
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
  if (!plistPackage) return parseViaPlutil(input);
  if (Buffer.isBuffer(input)) {
    if (input.subarray(0, BINARY_PLIST_MAGIC.length).toString("ascii") === BINARY_PLIST_MAGIC) {
      return plistPackage.parseBinary(input);
    }
    return plistPackage.parse(input.toString("utf8"));
  }
  return plistPackage.parse(String(input));
}

export function readPlistFile(plistPath) {
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

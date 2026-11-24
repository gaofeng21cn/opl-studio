import { readFileSync } from "node:fs";
import { parse, parseBinary } from "plist";

const BINARY_PLIST_MAGIC = "bplist00";

export function parsePlistDocument(input) {
  if (Buffer.isBuffer(input)) {
    if (input.subarray(0, BINARY_PLIST_MAGIC.length).toString("ascii") === BINARY_PLIST_MAGIC) {
      return parseBinary(input);
    }
    return parse(input.toString("utf8"));
  }
  return parse(String(input));
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

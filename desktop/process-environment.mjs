import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function uniqueDirectories(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function nodeVersionBins(homeDir, readDirectory) {
  const root = path.join(homeDir, ".nvm", "versions", "node");
  try {
    return readDirectory(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((name) => path.join(root, name, "bin"));
  } catch {
    return [];
  }
}

function managedRuntimeBins(homeDir, readDirectory) {
  const bins = [
    path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime", "current", "bin"),
    path.join(homeDir, "Library", "Application Support", "OPL", "runtime", "current", "bin")
  ];
  const toolchainRoot = path.join(homeDir, ".opl", "toolchain");
  try {
    const toolchains = readDirectory(toolchainRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    bins.push(...toolchains.map((name) => path.join(toolchainRoot, name, "bin")));
  } catch {
    // The managed toolchain is optional on clean machines.
  }
  return bins;
}

function findExecutable(name, directories, executable) {
  const candidates = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`, name] : [name];
  for (const directory of directories) {
    for (const candidateName of candidates) {
      const candidate = path.join(directory, candidateName);
      if (executable(candidate)) return candidate;
    }
  }
  return undefined;
}

function defaultExecutable(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function resolveDesktopRuntimeEnvironment({
  env = process.env,
  homeDir = os.homedir(),
  readDirectory = fs.readdirSync,
  executable = defaultExecutable
} = {}) {
  const searchDirectories = uniqueDirectories([
    ...String(env.PATH ?? "").split(path.delimiter),
    path.join(homeDir, ".local", "bin"),
    path.join(homeDir, ".volta", "bin"),
    path.join(homeDir, ".asdf", "shims"),
    path.join(homeDir, ".bun", "bin"),
    path.join(homeDir, "Library", "pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...nodeVersionBins(homeDir, readDirectory),
    ...managedRuntimeBins(homeDir, readDirectory),
    "/Applications/ChatGPT.app/Contents/Resources"
  ]);
  const resolved = { ...env, PATH: searchDirectories.join(path.delimiter) };

  if (!resolved.OPL_CODEX_BIN && !resolved.CODEX_APP_SERVER_COMMAND) {
    const codex = findExecutable("codex", searchDirectories, executable);
    if (codex) resolved.OPL_CODEX_BIN = codex;
  }
  if (!resolved.OPL_APP_OPL_BIN && !resolved.OPL_COMMAND) {
    const opl = findExecutable("opl", searchDirectories, executable);
    if (opl) resolved.OPL_APP_OPL_BIN = opl;
  }
  return resolved;
}

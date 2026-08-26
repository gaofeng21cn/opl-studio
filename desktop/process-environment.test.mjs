import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveDesktopRuntimeEnvironment } from "./process-environment.mjs";

test("Finder launches resolve existing Codex and OPL executables outside the system PATH", () => {
  const homeDir = "/Users/opl";
  const codex = path.join(homeDir, ".local", "bin", "codex");
  const opl = "/opt/homebrew/bin/opl";
  const resolved = resolveDesktopRuntimeEnvironment({
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", PRESERVED: "yes" },
    homeDir,
    readDirectory: () => [],
    executable: (candidate) => candidate === codex || candidate === opl
  });

  assert.equal(resolved.OPL_CODEX_BIN, codex);
  assert.equal(resolved.OPL_APP_OPL_BIN, opl);
  assert.equal(resolved.PRESERVED, "yes");
  assert.ok(resolved.PATH.split(path.delimiter).includes(path.join(homeDir, ".local", "bin")));
  assert.ok(resolved.PATH.split(path.delimiter).includes("/opt/homebrew/bin"));
});

test("desktop runtime resolution preserves explicit executable overrides", () => {
  const resolved = resolveDesktopRuntimeEnvironment({
    env: {
      PATH: "/usr/bin",
      OPL_CODEX_BIN: "/managed/codex",
      OPL_APP_OPL_BIN: "/managed/opl"
    },
    homeDir: "/Users/opl",
    readDirectory: () => [],
    executable: () => true
  });

  assert.equal(resolved.OPL_CODEX_BIN, "/managed/codex");
  assert.equal(resolved.OPL_APP_OPL_BIN, "/managed/opl");
});

test("Finder launches prefer the Homebrew Framework OPL over an older Node-version shim", () => {
  const homeDir = "/Users/opl";
  const homebrewOpl = "/opt/homebrew/bin/opl";
  const nodeVersionOpl = path.join(homeDir, ".nvm", "versions", "node", "v22.16.0", "bin", "opl");
  const resolved = resolveDesktopRuntimeEnvironment({
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    homeDir,
    readDirectory: () => [{ name: "v22.16.0", isDirectory: () => true }],
    executable: (candidate) => candidate === homebrewOpl || candidate === nodeVersionOpl
  });

  assert.equal(resolved.OPL_APP_OPL_BIN, homebrewOpl);
});

test("Finder launches resolve Framework-managed Codex and OPL toolchain Node", () => {
  const homeDir = "/Users/opl";
  const managedCodex = path.join(homeDir, "Library", "Application Support", "OPL", "runtime", "current", "bin", "codex");
  const managedNode = path.join(homeDir, ".opl", "toolchain", "node-v22.21.1-darwin-arm64", "bin", "node");
  const managedOpl = path.join(homeDir, ".opl", "toolchain", "node-v22.21.1-darwin-arm64", "bin", "opl");
  const resolved = resolveDesktopRuntimeEnvironment({
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    homeDir,
    readDirectory: (directory) => directory.endsWith(path.join(".opl", "toolchain"))
      ? [{ name: "node-v22.21.1-darwin-arm64", isDirectory: () => true }]
      : [],
    executable: (candidate) => [managedCodex, managedNode, managedOpl].includes(candidate)
  });

  assert.equal(resolved.OPL_CODEX_BIN, managedCodex);
  assert.equal(resolved.OPL_APP_OPL_BIN, managedOpl);
  assert.ok(resolved.PATH.split(path.delimiter).includes(path.dirname(managedCodex)));
  assert.ok(resolved.PATH.split(path.delimiter).includes(path.dirname(managedNode)));
});

test("Finder launches resolve an already installed Studio Full runtime", () => {
  const homeDir = "/Users/opl";
  const studioOpl = path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime", "current", "bin", "opl");
  const resolved = resolveDesktopRuntimeEnvironment({
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    homeDir,
    readDirectory: () => [],
    executable: (candidate) => candidate === studioOpl
  });

  assert.equal(resolved.OPL_APP_OPL_BIN, studioOpl);
  assert.ok(resolved.PATH.split(path.delimiter).includes(path.dirname(studioOpl)));
});

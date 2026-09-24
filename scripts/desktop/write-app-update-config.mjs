import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const EXPECTED_OWNER = "gaofeng21cn";

function requireGitHubProvider(config) {
  const provider = config?.publish?.provider;
  const owner = config?.publish?.owner;
  const repo = config?.publish?.repo;
  const stable = config?.appId === "cn.onepersonlab.opl";
  const expectedRepo = stable ? "one-person-lab-app" : "opl-studio";
  if (provider !== "github" || owner !== EXPECTED_OWNER || repo !== expectedRepo
    || (stable && config.productName !== "One Person Lab")) {
    throw new Error("Studio updater provider must remain the dedicated identity-bound GitHub feed");
  }
  return { provider, owner, repo };
}

export function buildAppUpdateConfig(builderConfig) {
  return requireGitHubProvider(builderConfig);
}

function resolvePackagedAppDir(appOutDir) {
  const entries = fs.readdirSync(appOutDir, { withFileTypes: true });
  const appDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => path.join(appOutDir, entry.name));
  if (appDirs.length !== 1) {
    throw new Error(`electron-builder appOutDir must contain exactly one top-level .app (found ${appDirs.length})`);
  }
  return appDirs[0];
}

export function writeAppUpdateConfig({ appOutDir, builderConfig, platform = process.platform }) {
  if (!appOutDir || typeof appOutDir !== "string") {
    throw new Error("electron-builder appOutDir is required");
  }
  const config = buildAppUpdateConfig(builderConfig);
  const resourcesDir = platform === "darwin"
    ? path.join(resolvePackagedAppDir(appOutDir), "Contents", "Resources")
    : path.join(appOutDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  const outputPath = path.join(resourcesDir, "app-update.yml");
  fs.writeFileSync(outputPath, `${Object.entries(config).map(([key, value]) => `${key}: ${value}`).join("\n")}\n`);
  return outputPath;
}

export default async function afterPack(context) {
  const platform = context?.electronPlatformName || process.platform;
  const outputPath = writeAppUpdateConfig({
    appOutDir: context?.appOutDir,
    builderConfig: context?.packager?.config,
    platform,
  });
  process.stdout.write(`Studio updater config written: ${outputPath}\n`);
  const config = context?.packager?.config;
  const productName = config?.productName || "One Person Lab";
  const appDir = platform === "darwin" ? resolvePackagedAppDir(context.appOutDir) : context.appOutDir;
  const resources = platform === "darwin" ? path.join(appDir, "Contents", "Resources") : path.join(appDir, "resources");
  const executable = platform === "darwin" ? path.join(appDir, "Contents", "MacOS", productName)
    : platform === "win32" ? path.join(appDir, `${config?.executableName || productName}.exe`)
      : path.join(appDir, config?.linux?.executableName || config?.executableName || productName);
  const smoke = path.join(resources, "app.asar", "scripts", "webui-host", "packaged-host-smoke.mjs");
  // Cross-architecture packaging is validated on the matching native runner.
  const nativeArchitecture = context.arch === 3 ? "arm64" : context.arch === 1 ? "x64" : null;
  if (platform !== process.platform || (nativeArchitecture && nativeArchitecture !== process.arch)) return;
  const output = execFileSync(executable, [smoke], {
    cwd: os.tmpdir(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: "", NODE_OPTIONS: "" },
    timeout: 30_000,
    encoding: "utf8"
  });
  if (!output.includes("OPL_PACKAGED_HOST_READY")) throw new Error("Packaged Host did not become ready");
  process.stdout.write("Packaged Host startup verified\n");
}

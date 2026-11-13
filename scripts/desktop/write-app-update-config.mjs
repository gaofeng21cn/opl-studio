import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolveHostNode } from "../../desktop/node-host-runtime.mjs";

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

export function verifyPackagedHostStartup({ resourcesDir, nodeExecutable = process.execPath }) {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-packaged-host-payload-"));
  try {
    // Running under out/ lets missing peers resolve from the source checkout.
    // Relocate the exact unpacked payload before testing its dependency closure.
    fs.cpSync(path.join(resourcesDir, "app.asar.unpacked"), isolatedRoot, {
      recursive: true,
      dereference: true,
      mode: fs.constants.COPYFILE_FICLONE
    });
    // The standalone Host does not import the desktop updater. Check its
    // declared runtime dependencies from the relocated payload too, so a
    // successful Host boot cannot conceal a broken Electron main process.
    verifyDesktopUpdaterDependencies(isolatedRoot);
    const smoke = path.join(isolatedRoot, "src", "host", "packaged-host-smoke.mjs");
    const output = execFileSync(nodeExecutable, [smoke], {
      cwd: isolatedRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", NODE_PATH: "", NODE_OPTIONS: "" },
      timeout: 30_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (!output.includes("OPL_PACKAGED_HOST_READY")) throw new Error("Packaged Host did not become ready");
    return output;
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

export function verifyDesktopUpdaterDependencies(appRoot) {
  const visited = new Set();
  const root = fs.realpathSync(appRoot);
  function visit(name, from) {
    const require = createRequire(from);
    const manifestPath = fs.realpathSync(require.resolve(`${name}/package.json`));
    if (!manifestPath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Packaged desktop dependency resolves outside the payload: ${name}`);
    }
    if (visited.has(manifestPath)) return;
    visited.add(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      visit(dependency, manifestPath);
    }
  }
  visit("electron-updater", path.join(root, "desktop", "main.mjs"));
}

export default async function afterPack(context) {
  const platform = context?.electronPlatformName || process.platform;
  const outputPath = writeAppUpdateConfig({
    appOutDir: context?.appOutDir,
    builderConfig: context?.packager?.config,
    platform,
  });
  process.stdout.write(`Studio updater config written: ${outputPath}\n`);
  const appDir = platform === "darwin" ? resolvePackagedAppDir(context.appOutDir) : context.appOutDir;
  const resources = platform === "darwin" ? path.join(appDir, "Contents", "Resources") : path.join(appDir, "resources");
  // Cross-architecture packaging is validated on the matching native runner.
  const nativeArchitecture = context.arch === 3 ? "arm64" : context.arch === 1 ? "x64" : null;
  if (platform !== process.platform || (nativeArchitecture && nativeArchitecture !== process.arch)) return;
  const node = resolveHostNode({ nodeExecutable: process.execPath });
  verifyPackagedHostStartup({ resourcesDir: resources, nodeExecutable: node.command });
  process.stdout.write("Packaged Host startup verified\n");
}

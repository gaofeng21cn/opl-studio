import { constants } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function publicExportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value.import ?? value.node ?? value.default;
}

async function resolveExecutable(command, env) {
  if (typeof command !== "string" || !command.trim()) {
    throw Object.assign(new Error("Framework carrier command must be configured"), {
      code: "framework_carrier_unavailable"
    });
  }
  const candidates = path.isAbsolute(command) || command.includes(path.sep)
    ? [path.resolve(command)]
    : String(env.PATH ?? "").split(path.delimiter).filter(Boolean).map((entry) => path.join(entry, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return realpath(candidate);
    } catch {
      // Continue until the active PATH carrier is found.
    }
  }
  throw Object.assign(new Error(`Framework carrier executable is unavailable: ${command}`), {
    code: "framework_carrier_unavailable"
  });
}

async function frameworkPackageRoot(command, env) {
  const explicitRoot = env.OPL_FRAMEWORK_PACKAGE_ROOT?.trim();
  if (explicitRoot) {
    const root = path.resolve(explicitRoot);
    const packageJsonPath = path.join(root, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (packageJson.name !== "opl-framework") {
      throw Object.assign(new Error("Configured Framework Package root is not opl-framework"), {
        code: "framework_carrier_invalid"
      });
    }
    return { packageJson, packageJsonPath, root };
  }
  let current = path.dirname(await resolveExecutable(command, env));
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
      if (packageJson.name === "opl-framework") return { packageJson, packageJsonPath, root: current };
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw Object.assign(new Error("Framework carrier does not resolve to the opl-framework Package"), {
    code: "framework_carrier_invalid"
  });
}

export async function loadFrameworkCordisProfiles({
  command = process.env.OPL_APP_OPL_BIN ?? process.env.OPL_COMMAND ?? "opl",
  env = process.env
} = {}) {
  const carrier = await frameworkPackageRoot(command, env);
  const target = publicExportTarget(carrier.packageJson.exports?.["./cordis-profiles"]);
  if (typeof target !== "string") {
    throw Object.assign(new Error("Framework carrier does not publish ./cordis-profiles"), {
      code: "framework_public_export_unavailable"
    });
  }
  const modulePath = path.resolve(carrier.root, target);
  if (modulePath === carrier.root || !modulePath.startsWith(`${carrier.root}${path.sep}`)) {
    throw Object.assign(new Error("Framework public export escapes its Package root"), {
      code: "framework_public_export_invalid"
    });
  }
  await access(modulePath);
  return import(pathToFileURL(modulePath).href);
}

export function createFrameworkChannelCallbackRegistrar({
  command = process.env.OPL_APP_OPL_BIN ?? process.env.OPL_COMMAND ?? "opl",
  env = process.env,
  loadProfiles = loadFrameworkCordisProfiles
} = {}) {
  return async (callback) => {
    const profiles = await loadProfiles({ command, env });
    if (typeof profiles.startCordisChannelProviderHost !== "function") {
      throw Object.assign(new Error("Framework public Cordis profile export is missing channel-provider bootstrap"), {
        code: "framework_public_export_invalid"
      });
    }
    const host = await profiles.startCordisChannelProviderHost({ callback });
    for (const method of ["appStatePatch", "readChannelAccess", "executeChannelAccessAction", "dispose"]) {
      if (typeof host?.[method] === "function") continue;
      throw Object.assign(new Error(`Framework channel-provider bootstrap returned no ${method} method`), {
        code: "framework_bootstrap_invalid"
      });
    }
    return Object.freeze({
      appStatePatch: () => host.appStatePatch(),
      readChannelAccess: (input) => host.readChannelAccess(input),
      executeChannelAccessAction: (input) => host.executeChannelAccessAction(input),
      dispose: () => host.dispose()
    });
  };
}

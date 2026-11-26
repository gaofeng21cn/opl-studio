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

const weixinProviderId = "opl-channel-weixin";

export function createFrameworkChannelCallbackRegistrar({
  command = process.env.OPL_APP_OPL_BIN ?? process.env.OPL_COMMAND ?? "opl",
  env = process.env,
  loadProfiles = loadFrameworkCordisProfiles
} = {}) {
  return async (callback, studioWeixin) => {
    let profiles;
    try {
      profiles = await loadProfiles({ command, env });
    } catch (error) {
      if (!studioWeixin || !["framework_carrier_unavailable", "framework_public_export_unavailable"].includes(error.code)) {
        throw error;
      }
      // No Framework provider host can start on this carrier.
    }
    if (profiles && typeof profiles.startCordisChannelProviderHost !== "function") {
      throw Object.assign(new Error("Framework public Cordis profile export is missing channel-provider bootstrap"), {
        code: "framework_public_export_invalid"
      });
    }

    const nativeOwnsWeixin = studioWeixin !== undefined
      && (!profiles || profiles.CHANNEL_PROVIDER_EXCLUSION_ABI === 1);
    const frameworkHost = await profiles?.startCordisChannelProviderHost({
      callback,
      ...(nativeOwnsWeixin ? { excludedProviderIds: [weixinProviderId] } : {})
    });
    let nativeHost;
    try {
      for (const method of ["appStatePatch", "readChannelAccess", "executeChannelAccessAction", "dispose"]) {
        if (!frameworkHost || typeof frameworkHost[method] === "function") continue;
        throw Object.assign(new Error(`Framework channel-provider bootstrap returned no ${method} method`), {
          code: "framework_bootstrap_invalid"
        });
      }
      if (nativeOwnsWeixin) nativeHost = await studioWeixin?.connect(callback);
    } catch (error) {
      await frameworkHost?.dispose?.();
      throw error;
    }

    function appStatePatch() {
      const legacyPatch = frameworkHost?.appStatePatch() ?? {};
      if (!nativeOwnsWeixin) return legacyPatch;
      const nativePatch = nativeHost?.appStatePatch() ?? {};
      const hostProjection = legacyPatch.ui_contributions;
      const nativeProjection = nativePatch.ui_contributions;
      const legacyBindings = legacyPatch.transport_bindings;
      const nativeBindings = nativePatch.transport_bindings;
      const entries = [
        ...(hostProjection?.entries ?? []).filter(entry => entry.package_id !== weixinProviderId),
        ...(nativeProjection?.entries ?? [])
      ];
      const bindings = [
        ...(legacyBindings?.bindings ?? []).filter(binding => binding.provider_id !== weixinProviderId),
        ...(nativeBindings?.bindings ?? [])
      ].sort((left, right) => left.binding_id.localeCompare(right.binding_id));
      const transport = nativeBindings?.status === "available" ? nativeBindings : legacyBindings ?? nativeBindings;
      return {
        ui_contributions: {
          surface_kind: "opl_app_ui_contributions_projection.v1",
          ...hostProjection, ...nativeProjection,
          entries, contribution_count: entries.length
        },
        ...(transport ? { transport_bindings: { ...transport, bindings } } : {})
      };
    }

    function ownerFor(input) {
      return nativeOwnsWeixin && input.package_id === weixinProviderId ? nativeHost : frameworkHost;
    }

    return Object.freeze({
      ...(nativeOwnsWeixin ? { replacedPackageIds: [weixinProviderId] } : {}),
      appStatePatch,
      readChannelAccess: input => ownerFor(input).readChannelAccess(input),
      executeChannelAccessAction: input => ownerFor(input).executeChannelAccessAction(input),
      dispose: () => Promise.allSettled([frameworkHost?.dispose(), nativeHost?.dispose()])
    });
  };
}

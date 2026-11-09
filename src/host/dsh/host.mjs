import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  boot,
  createRuntimeResolution,
  initProfile,
  loadOverlayPatches,
  loadProfile,
  PluginPackages,
  resolveProfileDir
} from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

const dshRoot = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(dshRoot, "cordis.yml");
const webPatchPath = path.join(dshRoot, "web.patch.yml");
const installAnchor = path.resolve(dshRoot, "../../..", "package.json");
const profileName = "opl-studio";

export const OPL_STUDIO_HOST_OPTIONS_SERVICE = "oplStudioHostOptions";

export function resolveWebBindAddress(host = "127.0.0.1", interfaces = os.networkInterfaces()) {
  const ipv4 = host === "0.0.0.0";
  if (!ipv4 && host !== "::") return host;
  const addresses = [...new Set(Object.values(interfaces).flatMap(entries =>
    (entries ?? []).filter(entry => !entry.internal && entry.family === (ipv4 ? "IPv4" : "IPv6"))
      .map(entry => entry.address)
  ))];
  if (addresses.length !== 1) {
    throw new Error("opl-studio: select one concrete local WebUI bind address; the wildcard request does not identify a single network interface");
  }
  return addresses[0];
}

export async function bootOplStudioHost(options = {}, { web = false } = {}) {
  const dshHome = resolveDshHome(options.dshHome, options.env ?? process.env);
  const profileDir = resolveProfileDir(profileName, dshHome);
  initProfile(profileDir, []);
  const dshProfile = loadProfile(profileName, profileName, installAnchor, dshHome);
  const resolution = await createRuntimeResolution({ installAnchor, profile: dshProfile, home: dshHome });
  const patches = [
    ...(web ? loadOverlayPatches(profileName, webPatchPath) : []),
    ...dshProfile.layers.flatMap((layer) => layer.patches),
    ...dshProfile.patches
  ];
  const context = await boot(
    profileName,
    profilePath,
    patches,
    async (ctx) => {
      ctx.provide(OPL_STUDIO_HOST_OPTIONS_SERVICE, Object.freeze({
        ...options,
        webHost: resolveWebBindAddress(options.webHost),
        workspaceRoot: options.workspaceRoot ?? (options.env ?? process.env).OPL_NATIVE_WORKBENCH_CODEX_CWD
          ?? (options.env ?? process.env).OPL_STUDIO_CODEX_CWD ?? path.dirname(installAnchor),
        dshHome,
        settingsSearchLogOpenAllowed: !web,
        dshProfileDir: profileDir
      }));
      await ctx.plugin(PluginPackages, { resolution });
    },
    pathToFileURL(path.join(profileDir, "package.json")).href
  );
  const core = context.get("oplHostCore");
  if (!core) {
    await context.fiber.dispose();
    throw new Error("opl-studio: DSH profile did not provide oplHostCore");
  }
  core.attachHostContext(context);
  try {
    await core.start();
  } catch (error) {
    await context.fiber.dispose();
    throw error;
  }
  return { context, core };
}

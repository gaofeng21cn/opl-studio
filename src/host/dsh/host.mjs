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
import {
  quarantineProfileOverrides,
  readProfileBootRecovery,
  readProfileOplOverrides
} from "../../../packages/host-kit/profile-boot-recovery.mjs";
import {
  readDisabledOptionalPluginIds,
  readDisabledPluginPatches,
  reconcileUserExternalPluginsOnBoot
} from "../../../packages/host-kit/dsh-plugin-catalog.mjs";

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
  const profileBaseUrl = pathToFileURL(path.join(profileDir, "package.json")).href;
  initProfile(profileDir, []);

  async function attemptBoot() {
    reconcileUserExternalPluginsOnBoot(profileDir);
    const dshProfile = loadProfile(profileName, profileName, installAnchor, dshHome);
    const resolution = await createRuntimeResolution({ installAnchor, profile: dshProfile, home: dshHome });
    const disabledAtBoot = readDisabledOptionalPluginIds(profileDir);
    const activeExternalPlugins = dshProfile.layers.map(layer => layer.packageName).filter(Boolean);
    const patches = [
      ...(web ? loadOverlayPatches(profileName, webPatchPath) : []),
      // This bundle also ships an agent-loop integration. Studio consumes its
      // Codex launcher; applying its DSH model/preset patches would change another host.
      ...dshProfile.layers.filter(layer => layer.packageName !== "billion-context").flatMap(layer => layer.patches),
      ...dshProfile.patches,
      ...readDisabledPluginPatches(profileDir)
    ];
    const context = await boot(
      profileName,
      profilePath,
      patches,
      async (ctx) => {
        // DSH's packaged Include imports bare names from the profile anchor, but
        // its tree keeps the shipped config directory as baseUrl. Keep metadata
        // consumers (including the official client graph) on that same anchor.
        // Nested Includes retain the resolution base of their own config file.
        ctx.on("loader/patch-context", async (entry, next) => {
          await next();
          if (entry.parent.tree.filename === profilePath) {
            entry.parent.tree.ctx.baseUrl = profileBaseUrl;
          }
        });
        ctx.provide(OPL_STUDIO_HOST_OPTIONS_SERVICE, Object.freeze({
          ...options,
          webHost: resolveWebBindAddress(options.webHost),
          webPort: options.webPort ?? Number((options.env ?? process.env).OPL_STUDIO_WEB_PORT || 0),
          workspaceRoot: options.workspaceRoot ?? (options.env ?? process.env).OPL_NATIVE_WORKBENCH_CODEX_CWD
            ?? (options.env ?? process.env).OPL_STUDIO_CODEX_CWD ?? path.dirname(installAnchor),
          dshHome,
          settingsSearchLogOpenAllowed: !web,
          dshInstallAnchor: installAnchor,
          dshProfileDir: profileDir,
          dshDisabledAtBoot: disabledAtBoot,
          dshActiveExternalPlugins: activeExternalPlugins,
          billionContextAdmitted: dshProfile.layers.some(layer => layer.packageName === "billion-context")
        }));
        await ctx.plugin(PluginPackages, { resolution });
      },
      profileBaseUrl
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

  try {
    const result = await attemptBoot();
    result.core.profileBootRecovery = readProfileBootRecovery(profileDir);
    return result;
  } catch (firstError) {
    if (Object.keys(readProfileOplOverrides(profileDir)).length === 0) throw firstError;
    const recovery = quarantineProfileOverrides(profileDir, firstError);
    if (!recovery) throw firstError;
    console.warn("[OPL:dsh-boot-recovery]", JSON.stringify(recovery));
    const result = await attemptBoot();
    result.core.profileBootRecovery = recovery;
    return result;
  }
}

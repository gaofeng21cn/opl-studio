import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  boot,
  healProfilesModuleFallback,
  initProfile,
  loadOverlayPatches,
  loadProfile,
  resolveProfileDir
} from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

const dshRoot = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(dshRoot, "cordis.yml");
const webPatchPath = path.join(dshRoot, "web.patch.yml");
const installAnchor = path.resolve(dshRoot, "../../..", "package.json");
const profileName = "opl-studio";

export const OPL_STUDIO_HOST_OPTIONS_SERVICE = "oplStudioHostOptions";

export async function bootOplStudioHost(options = {}, { web = false } = {}) {
  const dshHome = resolveDshHome(options.dshHome, options.env ?? process.env);
  const profileDir = resolveProfileDir(profileName, dshHome);
  initProfile(profileDir, []);
  const dshProfile = loadProfile(profileName, profileName, installAnchor, dshHome);
  await healProfilesModuleFallback({ installAnchor, profile: dshProfile, home: dshHome });
  const patches = [
    ...(web ? loadOverlayPatches(profileName, webPatchPath) : []),
    ...dshProfile.layers.flatMap((layer) => layer.patches),
    ...dshProfile.patches
  ];
  const context = await boot(
    profileName,
    profilePath,
    patches,
    (ctx) => {
      ctx.provide(OPL_STUDIO_HOST_OPTIONS_SERVICE, Object.freeze({
        ...options,
        dshHome,
        dshProfileDir: profileDir
      }));
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

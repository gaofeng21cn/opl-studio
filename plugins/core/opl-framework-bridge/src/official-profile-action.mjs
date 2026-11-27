import {
  readOfficialProfileResources,
  restoreOfficialProfile,
  safeDesktopErrorMessage,
} from "@gaofeng21cn/opl-host-kit/official-profile";

export const restoreAction = Object.freeze({
  action_id: "official_profile_restore",
  label: "Restore official combination",
  owner: "one-person-lab-app",
  route: "opl-studio:official-profile-restore",
  payload_fields: ["intent"],
  mutates: "opl_packages",
  confirmation_required: true,
  dry_run_supported: true,
});

export function withOfficialProfileAction(state, resourcesPath) {
  if (!state || typeof state !== "object") return state;
  const actions = Array.isArray(state.actions) ? state.actions : [];
  const otherActions = actions.filter(action => action?.action_id !== restoreAction.action_id);
  if (resourcesPath) {
    try {
      if (readOfficialProfileResources(resourcesPath).restoreAllowed) {
        return { ...state, actions: [...otherActions, restoreAction] };
      }
    } catch { /* Missing or invalid App resources only disable explicit restore. */ }
  }
  return otherActions.length === actions.length ? state : { ...state, actions: otherActions };
}

export async function runOfficialProfileAction(env, { payload, dryRun }) {
  if (payload.intent !== "explicit_restore") return { status: "error", blocked_reason: "explicit_restore_intent_required" };
  if (!dryRun && payload.confirmed !== true) return { status: "confirmation_required" };
  if (!env.OPL_OFFICIAL_PROFILE_RESOURCES) return { status: "unsupported", blocked_reason: "official_profile_resources_unavailable" };
  try {
    const result = await restoreOfficialProfile({ resourcesPath: env.OPL_OFFICIAL_PROFILE_RESOURCES, env, dryRun });
    if (result.status === "failed") {
      const failures = result.package_results.filter(item => item.status === "failed");
      return { status: "failed", result, blocked_reason: failures.map(item => item.package_id + ": " + (item.error?.message ?? "failed")).join("; ") };
    }
    return { status: dryRun ? "preview" : "completed", confirmation_required: dryRun, result };
  } catch (error) {
    return { status: "error", blocked_reason: safeDesktopErrorMessage(error, env) };
  }
}

import { validateDeepLinkPayload } from "../../desktop/deep-links.mjs";
import type { SettingsDestinationId } from "./SettingsPanel";

declare global { var __OPL_DEEP_LINK_POLICY__: unknown; }

export type DeepLinkDestination =
  | { kind: "conversation"; scope: "all" | "archived" }
  | { kind: "schedules" }
  | { kind: "application_management"; section?: "applications" | "updates" | "resources" | "sources" }
  | { kind: "settings"; destination: SettingsDestinationId };

// This maps App-owned routes into the existing Studio presentation. Admission
// still comes from the exact App registry, even when several routes share a page.
const settingsPresentation: Record<string, SettingsDestinationId> = {
  "/settings/general": "overview", "/settings/gateway": "account",
  "/settings/access": "models", "/settings/workspace": "workspace",
  "/settings/agents": "agents", "/settings/capabilities": "capabilities",
  "/settings/resources": "resources", "/settings/environment": "services",
  "/settings/storage": "storage", "/settings/appearance": "preferences",
  "/settings/about": "about"
};

export function resolveDeepLinkDestination(value: unknown, policy: unknown = globalThis.__OPL_DEEP_LINK_POLICY__): DeepLinkDestination | null {
  const result = validateDeepLinkPayload(value, policy);
  if (!result.valid) return null;
  const route = result.payload.params.route;
  let baseRoute = route;
  let section: string | undefined;
  try {
    const parsed = new URL(route, "https://opl.invalid");
    const entries = [...parsed.searchParams];
    if (entries.length > 1 || (entries.length === 1 && entries[0][0] !== "section")) return null;
    baseRoute = parsed.pathname;
    section = entries[0]?.[1];
  } catch {
    return null;
  }
  if (baseRoute === "/guid") return { kind: "conversation", scope: "all" };
  if (baseRoute === "/archived") return { kind: "conversation", scope: "archived" };
  if (baseRoute === "/scheduled") return { kind: "schedules" };
  if (baseRoute === "/apps") {
    return section && ["applications", "updates", "resources", "sources"].includes(section)
      ? { kind: "application_management", section: section as "applications" | "updates" | "resources" | "sources" }
      : section ? null : { kind: "application_management" };
  }
  if (baseRoute === "/settings/agents" || baseRoute === "/settings/capabilities") return { kind: "application_management", section: "applications" };
  if (baseRoute === "/settings/resources") return { kind: "application_management", section: "resources" };
  if (baseRoute === "/settings/environment" && section === "updates") return { kind: "application_management", section: "updates" };
  if (section) return null;
  const destination = settingsPresentation[baseRoute];
  return destination ? { kind: "settings", destination } : null;
}

export type SettingsNavigationRequest = { open: boolean; destination?: SettingsDestinationId; revision: number };

/** Share the upstream settings state between shortcuts and admitted deep links. */
export function applySettingsShellNavigation(
  request: SettingsNavigationRequest,
  actions: { open(): void; close(): void; openSection(id: string): void },
  sectionId?: string,
): void {
  if (!request.open) actions.close();
  else if (sectionId) actions.openSection(sectionId);
  else actions.open();
}

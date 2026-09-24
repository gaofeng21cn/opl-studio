import { validateDeepLinkPayload } from "../../desktop/deep-links.mjs";
import type { SettingsDestinationId } from "./SettingsPanel";

declare global { var __OPL_DEEP_LINK_POLICY__: unknown; }

export type DeepLinkDestination =
  | { kind: "conversation"; scope: "all" | "archived" }
  | { kind: "settings"; destination: SettingsDestinationId };

// This maps App-owned routes into the existing Studio presentation. Admission
// still comes from the exact App registry, even when several routes share a page.
const settingsPresentation: Record<string, SettingsDestinationId> = {
  "/settings/general": "overview", "/settings/gateway": "account",
  "/settings/access": "models", "/settings/workspace": "workspace",
  "/settings/agents": "agents", "/settings/capabilities": "capabilities",
  "/settings/resources": "resources", "/settings/environment": "services",
  "/settings/storage": "storage", "/settings/appearance": "preferences",
  "/settings/about": "about", "/scheduled": "services"
};

export function resolveDeepLinkDestination(value: unknown, policy: unknown = globalThis.__OPL_DEEP_LINK_POLICY__): DeepLinkDestination | null {
  const result = validateDeepLinkPayload(value, policy);
  if (!result.valid) return null;
  const route = result.payload.params.route;
  if (route === "/guid") return { kind: "conversation", scope: "all" };
  if (route === "/archived") return { kind: "conversation", scope: "archived" };
  const destination = settingsPresentation[route];
  return destination ? { kind: "settings", destination } : null;
}

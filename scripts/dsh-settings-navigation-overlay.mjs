import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SETTINGS_ROOT_SOURCE = "packages/client/ui-settings-general/src/client/SettingsRoot.tsx";
export const SETTINGS_NAVIGATION_OVERLAY = "scripts/dsh-settings-navigation-overlay.mjs";
export const SETTINGS_NAVIGATION_ANCHOR = "  const rows = useSections(s => s)\n";

export function applySettingsNavigationOverlay(source) {
  if (source.split(SETTINGS_NAVIGATION_ANCHOR).length !== 2) {
    throw new Error("DSH Settings navigation overlay requires one exact pinned source anchor");
  }
  return source.replace(SETTINGS_NAVIGATION_ANCHOR, `${SETTINGS_NAVIGATION_ANCHOR}
  // OPL overlay: a validated host navigation request selects the same native
  // settings state as a user click; upstream source remains byte-identical.
  const navigationRequest = (props as SettingsRootComponentProps & {
    navigationRequest?: { sectionId?: string; revision: number }
  }).navigationRequest
  useEffect(() => {
    if (!navigationRequest) return
    if (!navigationRequest.sectionId) { close(); return }
    if (rows.some(row => row.id === navigationRequest.sectionId)) {
      openSection(navigationRequest.sectionId)
    }
  }, [navigationRequest?.revision])
`);
}

const digest = value => crypto.createHash("sha256").update(value).digest("hex");

export function settingsNavigationOverlayManifest(root, upstreamSha256) {
  return {
    id: "opl-settings-host-navigation",
    source: SETTINGS_NAVIGATION_OVERLAY,
    source_sha256: digest(fs.readFileSync(path.join(root, SETTINGS_NAVIGATION_OVERLAY))),
    target: SETTINGS_ROOT_SOURCE,
    target_upstream_sha256: upstreamSha256,
    application: "bun_build_onLoad_exact_anchor",
    purpose: "optional_validated_navigation_request_uses_native_settings_open_and_selection_state"
  };
}

export function verifySettingsNavigationOverlay(root, manifest) {
  const source = manifest.files.find(entry => entry.path === SETTINGS_ROOT_SOURCE);
  const expected = settingsNavigationOverlayManifest(root, source?.sha256);
  const entry = manifest.build_overlays?.find(entry => entry.id === expected.id);
  if (!source || JSON.stringify(entry) !== JSON.stringify(expected)) {
    throw new Error("DSH settings navigation overlay manifest does not bind its exact source and pinned target");
  }
  const raw = fs.readFileSync(path.join(root, "src/vendor/deepseek-harness", SETTINGS_ROOT_SOURCE), "utf8");
  if (digest(raw) !== source.sha256) throw new Error("DSH settings navigation overlay target differs from its pinned source");
  return applySettingsNavigationOverlay(raw);
}

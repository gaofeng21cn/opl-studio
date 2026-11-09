// Preserve the official menu and dialog implementation without importing the
// DSH Host's compile-time service graph into the Codex-owned Studio renderer.
export { apply as applyContextMenus } from "../../vendor/deepseek-harness/packages/client/ui-context-menu/src/client/index.ts";
export { createContextMenuBindings } from "../../vendor/deepseek-harness/packages/client/ui-context-menu/src/client/trigger.ts";
export { SessionRenameDialog } from "../../vendor/deepseek-harness/packages/client/ui-workspace/src/client/session-actions/RenameSession.tsx";

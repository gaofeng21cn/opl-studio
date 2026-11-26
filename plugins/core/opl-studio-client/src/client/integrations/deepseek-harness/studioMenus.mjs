// Preserve the official menu and dialog implementation without importing the
// DSH Host's compile-time service graph into the Codex-owned Studio renderer.
export {
  applyContextMenus,
  createContextMenuBindings,
  SessionRenameDialog
} from "@gaofeng21cn/opl-dsh-adapters/dsh-shell";

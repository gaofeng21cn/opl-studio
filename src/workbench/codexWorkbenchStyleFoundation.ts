export const codexWorkbenchStyleFoundation = `
  /* OPL-only content tokens consume the pinned DSH theme; shell geometry,
     glyphs and palette remain owned by the imported upstream styles. */
  :root {
    color-scheme: light;
    --opl-native-titlebar-inset: 0px;
    --opl-sidebar-width: 236px;
    --opl-font-sans: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    --opl-font-mono: var(--dsh-font-family-code, ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace);
    /* OPL uses one compact desktop scale for host-owned
       pages. Components may opt into a larger title, but should not invent a
       new base size or weight. */
    --opl-text-xs: 11px;
    --opl-text-sm: 12px;
    --opl-text-md: 13px;
    --opl-text-body: 14px;
    --opl-text-lg: 16px;
    --opl-text-xl: 20px;
    --opl-text-2xl: 24px;
    --opl-text-display-sm: 28px;
    --opl-text-display: 32px;
    --opl-leading-tight: 1.25;
    --opl-leading-normal: 1.45;
    --opl-leading-relaxed: 1.6;
    --opl-weight-regular: 400;
    --opl-weight-medium: 500;
    --opl-weight-semibold: 600;
    --opl-space-1: 4px;
    --opl-space-2: 8px;
    --opl-space-3: 12px;
    --opl-space-4: 16px;
    --opl-space-5: 20px;
    --opl-space-6: 24px;
    --opl-control-sm: 30px;
    --opl-control-md: 34px;
    --opl-radius-control: 7px;
    --opl-radius-surface: 10px;
  }

  :root[data-opl-host="native"] {
    --opl-native-titlebar-inset: 34px;
  }

  body {
    --opl-canvas: var(--dsw-alias-bg-base);
    --opl-sidebar: var(--dsw-specific-sidebar-fill);
    --opl-surface-secondary: var(--dsw-alias-bg-module-platform);
    --opl-text: var(--dsw-alias-label-primary);
    --opl-muted: var(--dsw-alias-label-secondary);
    --opl-faint: var(--dsw-alias-label-tertiary);
    --opl-hover: var(--dsw-alias-interactive-bg-hover);
    --opl-selected: var(--dsw-alias-interactive-bg-active);
    --opl-border-light: var(--dsw-alias-border-l1);
    --opl-border: var(--dsw-alias-border-l2);
    --opl-border-heavy: var(--dsw-alias-border-l3);
    --opl-accent: var(--dsw-alias-brand-primary);
    --opl-accent-soft: var(--opl-hover);
    --opl-success: var(--dsw-alias-state-success-primary);
    --opl-warning: var(--dsw-alias-state-warn-primary);
    --opl-warning-soft: color-mix(in oklab, var(--opl-warning) 16%, transparent);
    --opl-danger: var(--dsw-alias-state-error-primary);
    --opl-surface-elevated: color-mix(in srgb, var(--opl-canvas) 94%, var(--opl-text));
    --opl-focus-ring: 0 0 0 3px color-mix(in srgb, var(--opl-accent) 22%, transparent);
    font-family: var(--opl-font-sans);
    font-size: var(--opl-text-body);
    line-height: var(--opl-leading-normal);
  }

  :root[data-opl-sidebar-resizing="true"],
  :root[data-opl-sidebar-resizing="true"] * {
    cursor: col-resize !important;
    user-select: none !important;
  }

  * {
    box-sizing: border-box;
  }

  [hidden] {
    display: none !important;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  :where(button, input, textarea, select, summary):focus-visible {
    outline: 0;
    box-shadow: var(--opl-focus-ring);
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

`;

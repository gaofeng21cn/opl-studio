import dshSource from "../composition/deepseekHarnessSourceManifest.json";

export const codexWorkbenchStyleFoundation = `
  /* OPL-only content tokens consume the pinned DSH theme; shell geometry,
     glyphs and palette remain owned by the imported upstream styles. */
  :root {
    color-scheme: light;
    --opl-native-titlebar-inset: 0px;
    --opl-sidebar-width: 236px;

  }

  :root[data-opl-host="native"] {
    --opl-native-titlebar-inset: 34px;
  }

  body {
    /* Compatibility aliases for OPL content; all visual values come from DSH. */
    --opl-font-sans: var(--dsw-font-family);
    --opl-font-mono: var(--ds-font-family-code);
    --opl-text-xs: var(--dsw-font-xxs-12-font-size);
    --opl-text-sm: var(--dsw-font-xxs-12-font-size);
    --opl-text-md: var(--dsw-font-xs-13-font-size);
    --opl-text-body: var(--dsw-font-s-14-font-size);
    --opl-text-lg: var(--dsw-font-base-16-font-size);
    --opl-text-xl: var(--dsw-font-l-20-font-size);
    --opl-text-2xl: var(--dsw-font-xl-24-font-size);
    --opl-text-display-sm: var(--dsw-font-xl-24-font-size);
    --opl-text-display: var(--dsw-font-xl-24-font-size);
    --opl-leading-tight: var(--dsw-font-xs-13-line-height);
    --opl-leading-normal: var(--dsw-font-s-14-line-height);
    --opl-leading-relaxed: var(--dsw-font-markdown-base-line-height);
    --opl-weight-regular: var(--dsw-font-s-14-font-weight);
    --opl-weight-medium: var(--dsw-font-s-strong-14-font-weight);
    --opl-weight-semibold: var(--dsw-font-xl-24-font-weight);
    --opl-space-1: 4px;
    --opl-space-2: 8px;
    --opl-space-3: 12px;
    --opl-space-4: 16px;
    --opl-space-5: 20px;
    --opl-space-6: 24px;
    --opl-control-sm: ${dshSource.primitive_metrics.button_sm_height};
    --opl-control-md: ${dshSource.primitive_metrics.button_md_height};
    --opl-radius-control: var(--dsw-radius-md);
    --opl-radius-surface: var(--dsw-radius-md);

    --opl-canvas: var(--dsw-alias-bg-base);
    --opl-bg: var(--dsw-alias-bg-base);
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
    --opl-warning-soft: var(--dsw-alias-state-warn-tertiary);
    --opl-danger: var(--dsw-alias-state-error-primary);
    --opl-surface-elevated: var(--dsw-alias-bg-layer-2);
    font: var(--dsw-font-s-14);
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
    outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.4;
  }

`;

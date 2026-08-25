export const codexWorkbenchStyles = `
  /* ChatGPT Codex macOS 26.707.61608 visual token baseline.
     OPL Studio additionally uses pinned DeepSeek Harness GUI source reuse. */
  :root {
    color-scheme: light;
    --opl-native-titlebar-inset: 0px;
    --opl-sidebar-width: 236px;
    --opl-font-sans: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    --opl-font-mono: var(--ds-font-family-code, ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace);
    /* OPL uses one compact desktop scale across DSH surfaces and host-owned
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

    /* Selected from DeepSeek Harness ui-theme/design-platform.css at
       b150a551b8d465e31e418e1b2eaf5e79bbb7d28e for the reused primitives. */
    --dsw-static-deepseek-450: rgb(86, 134, 254);
    --dsw-static-neutral-bluish-00: rgb(255, 255, 255);
    --dsw-static-neutral-bluish-100: rgb(235, 238, 242);
    --dsw-static-neutral-bluish-500: rgb(151, 157, 166);
    --dsw-static-neutral-bluish-700: rgb(97, 102, 107);
    --dsw-static-neutral-bluish-750: rgb(67, 69, 74);
    --dsw-static-neutral-bluish-850: rgb(44, 44, 46);
    --dsw-static-neutral-bluish-1000: rgb(15, 17, 21);
    --dsw-static-green-500: rgb(34, 197, 94);
    --dsw-static-amber-500: rgb(245, 158, 11);
    --dsw-static-red-600: rgb(236, 19, 19);
    --dsw-alias-bg-layer-2: var(--dsw-static-neutral-bluish-00);
    --dsw-alias-border-l2: rgba(0, 0, 0, 0.1);
    --dsw-alias-button-ghost-active-border: var(--dsw-static-neutral-bluish-500);
    --dsw-alias-button-ghost-active-fill: var(--dsw-static-neutral-bluish-100);
    --dsw-alias-button-primary-fill: var(--dsw-static-neutral-bluish-1000);
    --dsw-alias-button-primary-hover: var(--dsw-static-neutral-bluish-750);
    --dsw-alias-button-tool-bar-fill: rgba(84, 85, 87, 0.5);
    --dsw-alias-button-tool-bar-hover: rgba(84, 85, 87, 0.6);
    --dsw-alias-interactive-bg-active: rgba(38, 49, 72, 0.1);
    --dsw-alias-interactive-bg-hover: rgba(38, 49, 72, 0.06);
    --dsw-alias-label-primary: var(--dsw-static-neutral-bluish-1000);
    --dsw-alias-label-primary-foreground: var(--dsw-static-neutral-bluish-00);
    --dsw-alias-label-secondary: var(--dsw-static-neutral-bluish-700);
    --dsw-alias-state-success-primary: var(--dsw-static-green-500);
    --dsw-alias-state-warn-primary: var(--dsw-static-amber-500);
    --dsw-alias-state-error-primary: var(--dsw-static-red-600);
    --dsw-alias-tooltip-bg: var(--dsw-static-neutral-bluish-850);
    --ds-ease-in-out: ease-in-out;
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

  .startup-readiness {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 100dvh;
    padding: calc(40px + var(--opl-native-titlebar-inset)) 32px 40px;
    overflow: auto;
    color: var(--opl-text, rgb(15, 17, 21));
    background: var(--opl-canvas, rgb(250, 250, 249));
    font-family: var(--opl-font-sans);
  }

  .startup-readiness-content {
    width: min(100%, 620px);
    min-width: 0;
  }

  .startup-readiness-wordmark {
    min-width: 0;
    margin-bottom: 26px;
    color: var(--opl-text, rgb(15, 17, 21));
    overflow-wrap: anywhere;
    font-size: var(--opl-text-display);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .startup-readiness h1 {
    margin: 0;
    font-size: var(--opl-text-display-sm);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
    letter-spacing: 0;
  }

  .startup-readiness-count {
    margin: 10px 0 30px;
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-lg);
    font-variant-numeric: tabular-nums;
  }

  .startup-readiness-stages {
    margin: 0;
    padding: 0;
    border-bottom: 1px solid var(--opl-border, rgba(0, 0, 0, 0.1));
    list-style: none;
  }

  .startup-readiness-stages li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    min-height: 58px;
    padding: 10px 2px;
    border-top: 1px solid var(--opl-border, rgba(0, 0, 0, 0.1));
  }

  .startup-readiness-stage-icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: var(--opl-muted, rgb(97, 102, 107));
  }

  .startup-readiness-stages li[data-status="ready"] .startup-readiness-stage-icon {
    color: var(--opl-success, rgb(34, 197, 94));
  }

  .startup-readiness-stages li[data-status="error"] .startup-readiness-stage-icon,
  .startup-readiness-stages li[data-status="timeout"] .startup-readiness-stage-icon {
    color: var(--opl-danger, rgb(236, 19, 19));
  }

  .startup-readiness-stage-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .startup-readiness-stage-copy strong {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-semibold);
  }

  .startup-readiness-stage-copy > span {
    min-width: 0;
    overflow: hidden;
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .startup-readiness-stage-status {
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-md);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .startup-readiness-stages li[data-status="error"] .startup-readiness-stage-status,
  .startup-readiness-stages li[data-status="timeout"] .startup-readiness-stage-status {
    color: var(--opl-danger, rgb(236, 19, 19));
  }

  .startup-readiness-spinner {
    animation: startup-readiness-spin 900ms linear infinite;
  }

  .startup-readiness-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 22px;
  }

  .startup-readiness-actions button {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 8px 13px;
    border: 1px solid var(--opl-border, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .startup-readiness-actions button:hover {
    background: var(--opl-hover, rgba(38, 49, 72, 0.06));
  }

  .startup-readiness-actions .startup-readiness-retry {
    border-color: var(--dsw-alias-button-primary-fill, rgb(15, 17, 21));
    background: var(--dsw-alias-button-primary-fill, rgb(15, 17, 21));
    color: var(--dsw-alias-label-primary-foreground, white);
  }

  .startup-readiness-actions .startup-readiness-retry:hover {
    background: var(--dsw-alias-button-primary-hover, rgb(67, 69, 74));
  }

  .startup-readiness-actions p {
    flex-basis: 100%;
    margin: 2px 0 0;
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  @keyframes startup-readiness-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .startup-readiness-spinner {
      animation: none;
    }
  }

  .opl-contribution-slot {
    display: grid;
    gap: 0;
    min-width: 0;
  }

  .opl-contribution {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 10px 0;
    border-top: 1px solid var(--opl-border);
  }

  .opl-contribution-header,
  .opl-contribution-title,
  .opl-contribution-meta,
  .opl-contribution-badges,
  .opl-contribution-actions,
  .opl-contribution-fallback {
    display: flex;
    align-items: center;
  }

  .opl-contribution-header {
    justify-content: space-between;
    gap: 12px;
  }

  .opl-contribution-title,
  .opl-contribution-meta,
  .opl-contribution-badges,
  .opl-contribution-actions,
  .opl-contribution-fallback {
    gap: 7px;
  }

  .opl-contribution-title {
    min-width: 0;
  }

  .opl-contribution-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opl-contribution-meta,
  .opl-contribution-badges,
  .opl-contribution-actions {
    flex-wrap: wrap;
  }

  .opl-contribution-result,
  .opl-structured-fields,
  .opl-structured-list {
    min-width: 0;
  }

  .opl-contribution-result {
    padding: 2px 0;
  }

  .opl-service-status-summary {
    display: grid;
    gap: 8px;
  }

  .opl-service-status-state {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
  }

  .opl-service-status-technical-details > .opl-structured-fields,
  .opl-service-status-technical-details > .opl-structured-list {
    margin-top: 8px;
  }

  .opl-runtime-detail-result {
    display: grid;
    gap: 14px;
  }

  .opl-runtime-detail-result > section > h4 {
    margin: 0 0 6px;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
    letter-spacing: 0;
  }

  .opl-runtime-detail-result .opl-structured-list > li > strong {
    display: block;
    margin-bottom: 4px;
    overflow-wrap: anywhere;
    font-size: var(--opl-text-xs);
  }

  .opl-structured-fields,
  .opl-structured-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
  }

  .opl-structured-list {
    padding-left: 18px;
  }

  .opl-structured-fields > div {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(76px, 0.3fr) minmax(0, 1fr);
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid var(--opl-border);
  }

  .opl-structured-fields > div:last-child {
    border-bottom: 0;
  }

  .opl-structured-fields dt,
  .opl-structured-fields dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .opl-structured-fields dt,
  .opl-structured-empty {
    color: var(--opl-muted);
  }

  .opl-structured-scalar {
    color: var(--opl-text);
  }

  .opl-contribution-fallback {
    margin: 0;
    color: var(--opl-muted);
  }

  .settings-contribution-section {
    display: grid;
    gap: 8px;
  }

  .settings-contribution-section > h2 {
    margin: 0;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-contribution-package {
    display: grid;
    gap: 0;
    min-width: 0;
  }

  .settings-contribution-package > h3 {
    margin: 8px 0 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-contribution-technical-details {
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .opl-contribution-technical-details summary {
    cursor: pointer;
  }

  .opl-contribution-technical-details dl {
    display: grid;
    gap: 2px;
    margin: 6px 0 0;
  }

  .opl-contribution-technical-details dl > div {
    display: flex;
    gap: 6px;
  }

  .opl-contribution-technical-details dt,
  .opl-contribution-technical-details dd {
    margin: 0;
  }

  .opl-studio {
    width: 100vw;
    height: 100vh;
    min-width: 0;
    position: relative;
    display: grid;
    grid-template-columns: var(--opl-sidebar-width) minmax(0, 1fr);
    overflow: hidden;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-family: var(--opl-font-sans);
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-regular);
    line-height: var(--opl-leading-normal);
    letter-spacing: 0;
  }

  .opl-studio.sidebar-closed {
    grid-template-columns: 0 minmax(0, 1fr);
  }

  .sidebar {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--opl-border);
    background: var(--opl-sidebar);
    padding-top: var(--opl-native-titlebar-inset);
  }

  .sidebar-closed .sidebar {
    display: none;
  }

  .sidebar-closed .chat-shell {
    grid-column: 1 / -1;
  }

  .sidebar-resizer {
    position: absolute;
    z-index: 45;
    top: 0;
    bottom: 0;
    left: calc(var(--opl-sidebar-width) - 3px);
    width: 6px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
  }

  .sidebar-resizer::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: transparent;
  }

  .sidebar-resizer:hover::after,
  .sidebar-resizer:focus-visible::after,
  :root[data-opl-sidebar-resizing="true"] .sidebar-resizer::after {
    background: color-mix(in oklab, var(--opl-text) 18%, transparent);
  }

  .sidebar-closed .sidebar-resizer {
    display: none;
  }

  .brand-row {
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
  }

  .brand-row img {
    display: none;
  }

  .brand-lockup {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0;
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-semibold);
    white-space: nowrap;
  }

  .brand-mark {
    color: var(--opl-text);
  }

  .icon-button {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--opl-muted);
  }

  .icon-button:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .brand-row .icon-button {
    margin-left: auto;
  }

  .brand-row .sidebar-close-mobile {
    margin-left: 0;
  }

  .sidebar-close-mobile {
    display: none;
  }

  .sidebar-scroll {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 1px 8px 14px;
    scrollbar-color: color-mix(in oklab, var(--opl-text) 12%, transparent) transparent;
    scrollbar-width: thin;
  }

  .sidebar-scroll::-webkit-scrollbar {
    width: 5px;
    height: 0;
  }

  .sidebar-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar-scroll::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in oklab, var(--opl-text) 12%, transparent);
  }

  .sidebar-scroll::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--opl-text) 20%, transparent);
  }

  .sidebar-scroll > *,
  .project-directory,
  .project-directory-group,
  .project-children,
  .history-list,
  .history-list ol,
  .history-list li,
  .thread-directory-row {
    min-width: 0;
    max-width: 100%;
  }

  .quick-actions {
    display: grid;
    gap: 2px;
    margin-bottom: 12px;
  }

  .quick-actions button,
  .sidebar-primary button,
  .project-root,
  .project-context-link,
  .history-list li button,
  .sidebar-footer button {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-text);
    text-align: left;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-regular);
  }

  .quick-actions button:hover,
  .sidebar-primary button:hover,
  .project-root:hover,
  .project-context-link:hover,
  .history-list li button:hover,
  .sidebar-footer button:hover {
    background: var(--opl-hover);
  }

  .kbd-hint {
    margin-left: auto;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .sidebar-primary {
    display: grid;
    gap: 2px;
    margin-bottom: 14px;
  }

  .sidebar-primary button[aria-current="page"] {
    background: var(--opl-selected);
  }

  .sidebar-section-head {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-medium);
  }

  .sidebar-section-head strong {
    font: inherit;
  }

  .sidebar-section-search {
    width: 26px;
    height: 26px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-muted);
  }

  .sidebar-section-search:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .sidebar-panel,
  .history-list {
    margin: 0 0 12px;
  }

  .project-root {
    font-weight: var(--opl-weight-medium);
  }

  .project-root .project-device {
    margin-left: auto;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-regular);
  }

  .project-root .project-status-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--opl-success);
  }

  .project-children {
    margin-left: 0;
    padding-left: 0;
  }

  .project-context-links {
    display: grid;
    gap: 1px;
    margin: 2px 0 5px;
  }

  .project-context-link {
    min-height: 30px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .project-context-link span:last-child {
    margin-left: auto;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .sidebar-panel-card,
  .sidebar-source-list,
  .sidebar-add-item,
  .sidebar-project-pill {
    display: none;
  }

  .history-list ol {
    list-style: none;
    display: grid;
    gap: 1px;
    margin: 0;
    padding: 0;
  }

  .history-list li button {
    min-height: 30px;
    padding-left: 7px;
  }

  .history-list li button strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-regular);
  }

  .history-list li button span {
    display: none;
  }

  .history-list li button small {
    margin-left: auto;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    white-space: nowrap;
  }

  .history-list li.active button {
    background: var(--opl-selected);
  }

  .sidebar-footer {
    flex: 0 0 auto;
    padding: 7px 8px 8px;
    border-top: 1px solid var(--opl-border);
  }

  .sidebar-footer button {
    min-height: 38px;
  }

  .account-avatar {
    width: 22px;
    height: 22px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: var(--opl-success);
    color: var(--opl-canvas);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-semibold);
  }

  .account-auth-icon {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    display: inline-grid;
    place-items: center;
    color: var(--opl-muted);
  }

  .account-copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .account-copy strong {
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .account-copy small {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .sidebar-footer .settings-glyph {
    margin-left: auto;
    color: var(--opl-muted);
  }

  .sidebar-footer .status-pill {
    display: none;
  }

  .chat-shell {
    min-width: 0;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--opl-canvas);
  }

  .topbar {
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    border-bottom: 1px solid var(--opl-border);
    background: rgba(255, 255, 255, 0.94);
  }

  .topbar-copy,
  .topbar-title,
  .topbar-actions {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .topbar-copy {
    gap: 6px;
  }

  .topbar-title {
    gap: 7px;
    color: var(--opl-text);
  }

  .topbar-title h1 {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .topbar-actions {
    gap: 3px;
  }

  .topbar-meta,
  .topbar-config,
  .topbar-status {
    display: none;
  }

  .conversation {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .conversation::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  .settings-page {
    min-height: 0;
    flex: 1;
    display: block;
    overflow: hidden;
  }

  .conversation-inner {
    width: min(100%, 780px);
    min-height: 100%;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    padding: 28px 24px 0;
  }

  .workflow-strip,
  .thread-intro {
    display: none;
  }

  .thread {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 20px;
  }

  .thread-read-error {
    margin: 0;
    padding: 9px 11px;
    border-radius: 7px;
    background: color-mix(in oklab, var(--opl-danger) 7%, transparent);
    color: var(--opl-danger);
    font-size: var(--opl-text-sm);
  }

  .empty-thread {
    min-height: calc(100vh - 210px);
    display: grid;
    place-items: center;
    text-align: center;
  }

  .empty-thread-inner {
    display: grid;
    gap: 9px;
    max-width: 520px;
  }

  .empty-thread-inner strong {
    font-size: var(--opl-text-lg);
    font-weight: var(--opl-weight-semibold);
  }

  .empty-thread-inner p {
    margin: 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-md);
  }

  .empty-starters {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 8px;
  }

  .empty-starters button {
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid var(--opl-border);
    border-radius: 8px;
    background: var(--opl-canvas);
    color: var(--opl-muted);
  }

  .empty-starters button:hover {
    background: var(--opl-sidebar);
  }

  .message {
    width: 100%;
    display: grid;
    gap: 7px;
  }

  .message-label {
    display: none;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-medium);
  }

  .message.assistant .message-label {
    color: var(--opl-muted);
  }

  .message-frame {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .message.user .message-frame {
    width: fit-content;
    max-width: 86%;
    justify-self: end;
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--opl-surface-secondary);
  }

  .message.system .message-frame {
    padding-left: 12px;
    border-left: 2px solid color-mix(in oklab, var(--opl-danger) 35%, transparent);
    color: var(--opl-danger);
  }

  .message.system.subagent .message-label {
    display: block;
    color: var(--opl-accent);
  }

  .message.system.subagent .message-frame {
    border-left-color: var(--opl-accent);
    color: var(--opl-text);
  }

  .message-frame p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--opl-text-body);
    line-height: var(--opl-leading-relaxed);
  }

  .message-frame > div,
  .message-frame > div > div {
    max-width: 100%;
  }

  .message.assistant .message-frame :where(p, ul, ol, blockquote, pre, table) {
    margin-top: 0;
    margin-bottom: 14px;
  }

  .message.assistant .message-frame :where(h1, h2, h3, h4) {
    margin: 22px 0 9px;
    font-size: var(--opl-text-lg);
    line-height: var(--opl-leading-normal);
    font-weight: var(--opl-weight-semibold);
  }

  .message.assistant .message-frame :where(ul, ol) {
    padding-left: 21px;
  }

  .message.assistant .message-frame :where(li + li) {
    margin-top: 5px;
  }

  .message.assistant .message-frame :where([data-streamdown="inline-code"]) {
    padding: 1px 3px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--opl-text) 6%, transparent);
    font-family: var(--opl-font-mono);
    font-size: 0.9em;
    font-weight: var(--opl-weight-regular);
  }

  .message.assistant .message-frame :where([data-streamdown="link"]) {
    display: inline;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: var(--opl-weight-medium);
    text-decoration-line: underline;
    text-decoration-color: color-mix(in oklab, var(--opl-text) 28%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .message.assistant .message-frame :where([data-streamdown="link"]:hover) {
    color: var(--opl-text);
    text-decoration-color: color-mix(in oklab, var(--opl-text) 58%, transparent);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block"]) {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    margin: 14px 0;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-canvas);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-header"]) {
    min-height: 31px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid var(--opl-border-light);
    background: color-mix(in srgb, var(--opl-sidebar) 72%, var(--opl-canvas));
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-actions"]) {
    position: absolute;
    z-index: 1;
    top: 3px;
    right: 5px;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-actions"] button) {
    width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--opl-muted);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-actions"] button:hover) {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-body"]) {
    overflow-x: auto;
    padding: 10px 12px 11px;
    border: 0;
    border-radius: 0;
    background: var(--opl-canvas);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block"] pre) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block"] code) {
    padding: 0;
    background: transparent;
  }

  .message.assistant .message-frame :where(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--opl-text-md);
  }

  .message.assistant .message-frame :where(th, td) {
    padding: 7px 8px;
    border-bottom: 1px solid var(--opl-border);
    text-align: left;
    vertical-align: top;
  }

  .message-meta {
    display: none;
  }

  .run-events {
    display: grid;
    gap: 5px;
    margin-top: 3px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .run-event {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .run-event::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--opl-faint);
  }

  .composer {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: 14px 0 10px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--opl-canvas) 0%, transparent), var(--opl-canvas) 28%);
  }

  .composer-frame {
    position: relative;
    padding: 7px 9px 6px;
    border: 1px solid var(--opl-border-heavy);
    border-radius: 17px;
    background: var(--opl-canvas);
    box-shadow: 0 0 0 0.5px var(--opl-border-heavy), 0 3px 7.5px rgba(0, 0, 0, 0.04), 0 0 20px rgba(0, 0, 0, 0.05);
  }

  .composer textarea {
    width: 100%;
    min-height: 32px;
    max-height: 180px;
    resize: vertical;
    padding: 1px 2px 4px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--opl-text);
    font-size: var(--opl-text-body);
    line-height: var(--opl-leading-normal);
    resize: none;
    field-sizing: content;
    max-height: 180px;
    overflow-y: auto;
  }

  .composer textarea::placeholder {
    color: var(--opl-faint);
  }

  .composer-selections {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 0 1px 6px;
  }

  .composer-selection {
    min-width: 0;
    max-width: min(260px, 100%);
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 8px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-sidebar);
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
  }

  .composer-selection > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-selection button,
  .composer-palette header button {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--opl-muted);
  }

  .composer-selection button:hover,
  .composer-palette header button:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .composer-palette {
    position: absolute;
    z-index: 80;
    left: -1px;
    bottom: calc(100% + 8px);
    width: min(420px, calc(100vw - 48px));
    max-height: min(520px, calc(50dvh - 64px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--opl-border-heavy);
    border-radius: 10px;
    background: var(--opl-canvas);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.13), 0 2px 8px rgba(0, 0, 0, 0.07);
  }

  .composer-palette > header {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px 0 13px;
  }

  .composer-palette > header strong {
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .composer-palette-search {
    height: 34px;
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 9px 7px;
    padding: 0 9px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    color: var(--opl-muted);
  }

  .composer-palette-search:focus-within {
    border-color: color-mix(in oklab, var(--opl-text) 28%, transparent);
  }

  .composer-palette-search input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
  }

  .composer-palette-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 0 7px 8px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--opl-text) 12%, transparent) transparent;
  }

  .composer-palette-scroll section + section {
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid var(--opl-border-light);
  }

  .composer-palette-group {
    display: block;
    padding: 4px 7px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-semibold);
  }

  .composer-palette-row {
    width: 100%;
    min-height: 42px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 5px 7px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--opl-text);
    text-align: left;
  }

  button.composer-palette-row:hover,
  button.composer-palette-row[aria-pressed="true"] {
    background: var(--opl-hover);
  }

  .composer-palette-icon {
    width: 28px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    color: var(--opl-muted);
  }

  .composer-palette-row > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .composer-palette-row strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .composer-palette-row small {
    overflow: hidden;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-palette-loaded {
    padding-right: 3px;
  }

  .composer-palette-state {
    margin: 8px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .composer-palette-state.error {
    color: var(--opl-danger);
  }

  .thread-search-overlay {
    position: fixed;
    z-index: 110;
    inset: 0;
    background: rgba(0, 0, 0, 0.18);
  }

  .thread-search-dialog {
    position: fixed;
    z-index: 111;
    top: max(72px, 11vh);
    left: 50%;
    width: min(560px, calc(100vw - 36px));
    max-height: min(620px, calc(100vh - 120px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateX(-50%);
    border: 1px solid var(--opl-border-heavy);
    border-radius: 12px;
    outline: 0;
    background: var(--opl-canvas);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.17), 0 3px 10px rgba(0, 0, 0, 0.08);
  }

  .thread-search-input {
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 10px 0 14px;
    border-bottom: 1px solid var(--opl-border);
    color: var(--opl-muted);
  }

  .thread-search-input input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--opl-text);
    font-size: var(--opl-text-body);
  }

  .thread-search-input button {
    width: 28px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-muted);
  }

  .thread-search-input button:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .thread-search-results {
    min-height: 96px;
    overflow-y: auto;
    padding: 8px;
  }

  .thread-search-group-label {
    display: block;
    padding: 3px 7px 6px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-semibold);
  }

  .thread-search-results > button {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--opl-text);
    text-align: left;
  }

  .thread-search-results > button:hover,
  .thread-search-results > button:focus-visible {
    outline: 0;
    background: var(--opl-hover);
  }

  .thread-search-result-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 1px;
  }

  .thread-search-result-copy strong,
  .thread-search-result-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-search-result-copy strong {
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .thread-search-result-copy small,
  .thread-search-project,
  .thread-search-empty {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .thread-search-project {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-search-empty {
    margin: 22px 8px;
    text-align: center;
  }

  .composer footer,
  .composer-meta,
  .composer-actions,
  .composer-model-controls {
    display: flex;
    align-items: center;
  }

  .composer footer {
    justify-content: space-between;
    gap: 10px;
  }

  .composer-meta,
  .composer-actions,
  .composer-model-controls {
    gap: 5px;
  }

  .composer-status {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .composer-status.error {
    color: var(--opl-danger);
  }

  .composer .thread-note {
    display: none;
  }

  .composer-action,
  .composer-select,
  .composer-submit {
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .composer-action {
    width: 30px;
    padding: 0;
  }

  .composer-action:hover,
  .composer-select:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .composer-select {
    position: relative;
    padding-right: 5px;
  }

  .composer-select select {
    max-width: 112px;
    height: 100%;
    padding: 0 15px 0 4px;
    border: 0;
    outline: 0;
    appearance: none;
    background: transparent;
    color: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .composer-select > svg:last-child {
    position: absolute;
    right: 4px;
    pointer-events: none;
  }

  .composer-permissions {
    padding-left: 5px;
  }

  .composer-permissions select {
    max-width: 118px;
    padding-left: 21px;
  }

  .composer-permission-icon {
    position: absolute;
    left: 6px;
    pointer-events: none;
  }

  .composer-submit {
    width: 30px;
    padding: 0;
    border-radius: 50%;
    background: var(--opl-text);
    color: var(--opl-canvas);
  }

  .composer-submit span {
    display: none;
  }

  .settings-detail::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  .settings-detail {
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .settings-detail-header,
  .settings-content {
    width: min(100%, 860px);
    margin: 0 auto;
    padding-right: 40px;
    padding-left: 40px;
  }

  .settings-detail-header {
    padding-top: 28px;
    padding-bottom: 18px;
  }

  .settings-detail-header h1 {
    margin: 0;
    font-size: var(--opl-text-xl);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .settings-detail-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .settings-subnav {
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    margin: 0;
    scrollbar-width: none;
  }

  .settings-subnav::-webkit-scrollbar {
    display: none;
  }

  .settings-subnav button {
    flex: none;
    min-height: var(--opl-control-sm);
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-tight);
  }

  .settings-subnav button:hover {
    background: color-mix(in srgb, var(--opl-text) 5%, var(--opl-canvas));
    color: var(--opl-text);
  }

  .settings-subnav button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--opl-text) 38%, transparent);
    outline-offset: 2px;
  }

  .settings-content {
    padding-bottom: 56px;
  }

  .settings-group {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .settings-group + .settings-group,
  .gateway-identity + .settings-group,
  .about-mark + .settings-group {
    margin-top: var(--opl-space-6);
  }

  .settings-group h2 {
    margin: 0 0 var(--opl-space-2);
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .settings-rows {
    border-top: 1px solid var(--opl-border);
  }

  .settings-row {
    min-height: 56px;
    display: grid;
    grid-template-columns: minmax(150px, 0.9fr) minmax(230px, 1.35fr);
    align-items: center;
    gap: var(--opl-space-6);
    padding: 9px 0;
    border-bottom: 1px solid var(--opl-border);
  }

  .settings-row-label,
  .settings-inline-identity > span:last-child,
  .gateway-identity > span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-row-label > span {
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
    line-height: var(--opl-leading-normal);
  }

  .settings-page small {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .settings-row-value {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--opl-muted);
    font-size: var(--opl-text-md);
    line-height: var(--opl-leading-normal);
    text-align: right;
  }

  .settings-row-value > :where(span, strong, code) {
    max-width: 100%;
  }

  .settings-row-actions {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .settings-inline-command {
    min-height: var(--opl-control-sm);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .settings-inline-command:disabled {
    opacity: 0.55;
  }

  .settings-page code {
    overflow-wrap: anywhere;
    color: var(--opl-muted);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
    white-space: normal;
  }

  .settings-inline-identity {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    text-align: left;
  }

  .settings-inline-identity strong,
  .gateway-identity strong {
    overflow: hidden;
    color: var(--opl-text);
    font-weight: var(--opl-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-avatar {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: var(--opl-text);
    color: var(--opl-canvas);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-avatar.large {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
    font-size: var(--opl-text-md);
  }

  .gateway-identity {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 2px 0 18px;
    border-bottom: 1px solid var(--opl-border);
  }

  .gateway-login-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
    gap: 12px;
    align-items: end;
    padding: 16px 24px;
    border-bottom: 1px solid var(--dsh-border-muted, rgba(127, 127, 127, 0.18));
  }

  .gateway-login-form label {
    display: grid;
    gap: 6px;
    min-width: 0;
    color: var(--dsh-text-secondary, #666);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-tight);
  }

  .gateway-login-form input {
    width: 100%;
    min-width: 0;
    height: var(--opl-control-md);
    padding: 0 9px;
    border: 1px solid var(--dsh-border-default, rgba(127, 127, 127, 0.28));
    border-radius: var(--opl-radius-control);
    background: var(--dsh-surface-primary, transparent);
    color: inherit;
    font: inherit;
  }

  .gateway-login-form input:focus {
    outline: 0;
    border-color: color-mix(in srgb, var(--opl-text) 45%, var(--opl-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--opl-text) 8%, transparent);
  }

  .gateway-login-form .settings-action-button {
    min-height: 32px;
    white-space: nowrap;
  }

  .settings-access-setup {
    min-width: 0;
    display: grid;
    gap: 14px;
    padding: 7px 0 14px;
  }

  .settings-access-setup-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-access-setup .gateway-login-form {
    padding: 0;
    border-bottom: 0;
  }

  .settings-api-key-form {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 8px 10px;
  }

  .settings-api-key-form label {
    min-width: 0;
    display: grid;
    gap: 6px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-tight);
  }

  .settings-api-key-form input {
    width: 100%;
    min-width: 0;
    height: var(--opl-control-md);
    padding: 0 9px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    outline: 0;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font: inherit;
  }

  .settings-api-key-form input:focus {
    border-color: color-mix(in srgb, var(--opl-text) 45%, var(--opl-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--opl-text) 8%, transparent);
  }

  .settings-api-key-form > small,
  .settings-access-note {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .settings-workspace-location {
    min-width: 0;
    max-width: 100%;
  }

  .settings-workspace-location code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--opl-muted);
    white-space: nowrap;
  }

  .settings-status > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--opl-faint);
  }

  .settings-status[data-tone="ready"] > span {
    background: var(--opl-success);
  }

  .settings-status[data-tone="attention"] > span {
    background: var(--opl-warning);
  }

  .settings-muted {
    color: var(--opl-faint);
  }

  .settings-command {
    min-height: var(--opl-control-md);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 18px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .settings-icon-button {
    width: var(--opl-control-sm);
    height: var(--opl-control-sm);
    min-width: var(--opl-control-sm);
    flex: 0 0 var(--opl-control-sm);
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .settings-icon-button:hover:not(:disabled) {
    background: var(--opl-hover);
  }

  .settings-icon-button:disabled {
    opacity: 0.52;
  }

  .settings-page-refresh {
    margin-top: 18px;
  }

  .about-mark {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--opl-border);
    border-radius: 8px;
    color: var(--opl-muted);
  }

  .setting-toggle,
  .setting-select {
    min-height: var(--opl-control-sm);
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .setting-select {
    min-width: 108px;
  }

  .setting-switch {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--opl-muted);
  }

  .setting-switch-track {
    width: 30px;
    height: 18px;
    position: relative;
    display: inline-block;
    border-radius: 9px;
    background: var(--opl-faint);
    transition: background 160ms ease;
  }

  .setting-switch-track span {
    width: 14px;
    height: 14px;
    position: absolute;
    top: 2px;
    left: 2px;
    border-radius: 50%;
    background: var(--opl-canvas);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
    transition: transform 160ms ease;
  }

  .setting-switch[aria-checked="true"] .setting-switch-track {
    background: var(--opl-accent);
  }

  .setting-switch[aria-checked="true"] .setting-switch-track span {
    transform: translateX(12px);
  }

  .segmented-control {
    width: fit-content;
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-sidebar);
  }

  .segmented-control button {
    min-height: 27px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-muted);
  }

  .segmented-control button[data-active="true"] {
    background: var(--opl-canvas);
    color: var(--opl-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .settings-page-summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--opl-space-4);
    margin-bottom: var(--opl-space-4);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--opl-border);
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .settings-page-summary-with-action > span:first-child {
    min-width: 0;
  }

  .settings-capability-directory {
    min-width: 0;
    display: grid;
    gap: 22px;
  }

  .settings-capability-toolbar,
  .settings-capability-summary,
  .settings-instruction-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-capability-summary {
    margin-top: -12px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .settings-inline-notice {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid var(--opl-border);
    border-bottom: 1px solid var(--opl-border);
    color: var(--opl-muted);
  }

  .settings-access-change {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }

  .settings-capability-group {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .settings-capability-group > h2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-capability-group > h2 span {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-regular);
  }

  .settings-capability-list {
    border-top: 1px solid var(--opl-border);
  }

  .settings-capability-row,
  .settings-instruction-source {
    border-bottom: 1px solid var(--opl-border);
  }

  .settings-capability-row > summary,
  .settings-instruction-source > summary {
    min-height: 60px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--opl-space-4);
    padding: 8px 0;
    list-style: none;
    cursor: pointer;
  }

  .settings-capability-row > summary::-webkit-details-marker,
  .settings-instruction-source > summary::-webkit-details-marker {
    display: none;
  }

  .settings-capability-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
    text-align: left;
  }

  .settings-capability-copy strong {
    overflow: hidden;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-capability-copy small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .settings-capability-state {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .settings-capability-state > svg {
    color: var(--opl-faint);
    transition: transform 140ms ease;
  }

  .settings-capability-row[open] .settings-capability-state > svg,
  .settings-instruction-source[open] .settings-capability-state > svg {
    transform: rotate(180deg);
  }

  .settings-capability-details,
  .settings-instruction-content {
    display: grid;
    gap: 8px;
    padding: 0 0 14px;
    color: var(--opl-muted);
    text-align: left;
  }

  .settings-capability-details small {
    color: var(--opl-faint);
  }

  .settings-instruction-toolbar small {
    min-width: 0;
    overflow: hidden;
    color: var(--opl-faint);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-instruction-content pre {
    max-height: 320px;
    overflow: auto;
    margin: 0;
    padding: 12px 0 0;
    border-top: 1px solid var(--opl-border);
    color: var(--opl-muted);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .settings-editor-block {
    min-width: 0;
    display: grid;
    gap: 12px;
    padding: 5px 0 13px;
  }

  .settings-editor-heading,
  .settings-editor-footer,
  .settings-default-row {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .settings-editor-heading > span,
  .settings-default-row > span,
  .settings-editor-label {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .settings-editor-heading strong,
  .settings-default-row strong {
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-editor-heading small,
  .settings-editor-footer small,
  .settings-default-row small,
  .settings-editor-label > span {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .settings-editor-block textarea {
    width: 100%;
    min-height: 168px;
    resize: vertical;
    padding: 11px 12px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    outline: 0;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .settings-editor-block textarea:focus {
    border-color: color-mix(in srgb, var(--opl-text) 45%, var(--opl-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--opl-text) 8%, transparent);
  }

  .settings-editor-footer > small {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .settings-default-row {
    padding-top: 11px;
    border-top: 1px solid var(--opl-border);
  }

  .settings-default-preview {
    border-top: 1px solid var(--opl-border);
    padding-top: 10px;
  }

  .settings-default-preview > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    list-style: none;
    cursor: pointer;
  }

  .settings-default-preview > summary::-webkit-details-marker {
    display: none;
  }

  .settings-default-preview > summary svg {
    flex: 0 0 auto;
    color: var(--opl-faint);
    transition: transform 140ms ease;
  }

  .settings-default-preview[open] > summary svg {
    transform: rotate(180deg);
  }

  .settings-default-preview > pre {
    max-height: 260px;
    overflow: auto;
    margin: 10px 0 0;
    padding: 11px 12px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    background: var(--opl-hover);
    color: var(--opl-muted);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .opl-first-run {
    width: min(680px, calc(100vw - 48px));
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 28px;
    padding: 64px 0;
    color: var(--opl-text);
  }

  .opl-first-run > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 18px;
  }

  .opl-first-run-mark {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--opl-border-strong);
    border-radius: 6px;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-first-run header p,
  .opl-first-run header h1,
  .opl-first-run header span {
    margin: 0;
  }

  .opl-first-run header p {
    margin-bottom: 5px;
    color: var(--opl-faint);
    font-size: var(--opl-text-sm);
  }

  .opl-first-run header h1 {
    font-size: var(--opl-text-2xl);
    font-weight: var(--opl-weight-semibold);
    letter-spacing: 0;
  }

  .opl-first-run header div > span {
    display: block;
    margin-top: 9px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .opl-first-run-checklist {
    border-top: 1px solid var(--opl-border);
  }

  .opl-first-run-checklist > div {
    min-height: 66px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--opl-border);
    color: var(--opl-warning);
  }

  .opl-first-run-checklist > div[data-ready="true"] {
    color: var(--opl-success);
  }

  .opl-first-run-checklist span {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .opl-first-run-checklist strong {
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-first-run-checklist small {
    color: var(--opl-muted);
    line-height: var(--opl-leading-normal);
  }

  .opl-first-run > footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .opl-first-run-error {
    margin: -12px 0 0;
    color: var(--opl-danger);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .agent-catalog,
  .agent-catalog-group,
  .agent-package-list {
    min-width: 0;
    display: grid;
  }

  .agent-catalog {
    gap: 22px;
  }

  .agent-catalog-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-inline-note {
    margin-top: -10px;
    padding: 8px 10px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .settings-search-field {
    width: min(100%, 360px);
    min-height: var(--opl-control-md);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-faint);
  }

  .settings-search-field:focus-within {
    border-color: color-mix(in srgb, var(--opl-text) 34%, var(--opl-border));
  }

  .settings-search-field input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--opl-text);
    font: inherit;
  }

  .agent-catalog-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    margin-top: -12px;
  }

  .agent-catalog-filters select {
    min-height: 29px;
    padding: 0 8px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    background: var(--opl-canvas);
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .agent-catalog-filters > span {
    margin-left: auto;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .agent-catalog-group {
    gap: 7px;
  }

  .agent-catalog-group > h2 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .agent-catalog-group > h2 span {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-medium);
  }

  .agent-package-list {
    border-top: 1px solid var(--opl-border);
  }

  .agent-package-row {
    border-bottom: 1px solid var(--opl-border);
  }

  .agent-package-row > summary {
    min-height: 76px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 11px 0;
    cursor: default;
    list-style: none;
  }

  .agent-package-row > summary::-webkit-details-marker {
    display: none;
  }

  .agent-package-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .agent-package-copy > strong {
    overflow: hidden;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-package-copy > small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .agent-package-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .agent-package-summary-actions,
  .runtime-setting-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .agent-package-chevron {
    color: var(--opl-faint);
    transition: transform 140ms ease;
  }

  .agent-package-row[open] .agent-package-chevron,
  .settings-advanced-actions[open] > summary svg,
  .agent-technical-details[open] > summary svg {
    transform: rotate(180deg);
  }

  .agent-package-details {
    display: grid;
    gap: 13px;
    padding: 2px 0 16px;
  }

  .agent-package-details > dl,
  .agent-technical-details dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  .agent-package-details > .agent-state-axis-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .agent-package-details dl div,
  .agent-technical-details dl div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .agent-package-details dt,
  .agent-technical-details dt {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .agent-package-details dd,
  .agent-technical-details dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .agent-package-actions,
  .settings-advanced-actions > div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .home-shortcut-preferences {
    display: grid;
    gap: 7px;
  }

  .home-shortcut-preference {
    min-height: 48px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
  }

  .home-shortcut-preference > label,
  .home-shortcut-order-actions {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .home-shortcut-preference > label {
    min-width: 0;
    align-items: flex-start;
  }

  .home-shortcut-copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .home-shortcut-copy strong {
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .home-shortcut-preference input {
    accent-color: var(--opl-text);
  }

  .home-shortcut-id {
    min-width: 0;
    overflow: hidden;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-shortcut-order-actions button {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-muted);
  }

  .home-shortcut-order-actions button:hover:not(:disabled) {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .home-shortcut-order-actions button:disabled {
    opacity: 0.35;
  }

  .settings-action-button {
    min-height: var(--opl-control-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
    white-space: nowrap;
  }

  .settings-action-button:hover:not(:disabled) {
    background: var(--opl-hover);
  }

  .settings-action-button.primary:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--opl-text) 88%, var(--opl-canvas));
    background: color-mix(in srgb, var(--opl-text) 88%, var(--opl-canvas));
    color: var(--opl-canvas);
  }

  .settings-action-button.primary {
    border-color: var(--opl-text);
    background: var(--opl-text);
    color: var(--opl-canvas);
  }

  .settings-action-button.danger {
    color: var(--opl-danger);
  }

  .settings-action-button:disabled {
    opacity: 0.52;
  }

  .agent-technical-details,
  .settings-advanced-actions {
    padding-top: 2px;
  }

  .agent-technical-details > summary,
  .settings-advanced-actions > summary {
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    list-style: none;
    cursor: default;
  }

  .agent-technical-details > summary::-webkit-details-marker,
  .settings-advanced-actions > summary::-webkit-details-marker {
    display: none;
  }

  .agent-technical-details dl,
  .settings-advanced-actions > div {
    margin-top: 10px;
  }

  .settings-empty-state {
    min-height: 120px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    color: var(--opl-faint);
  }

  .settings-action-feedback {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
    padding: 8px 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .settings-action-feedback[data-tone="success"] {
    border-color: color-mix(in srgb, var(--opl-success) 35%, var(--opl-border));
    color: var(--opl-success);
  }

  .settings-action-feedback[data-tone="attention"] {
    border-color: color-mix(in srgb, var(--opl-warning) 35%, var(--opl-border));
  }

  .settings-advanced-actions {
    margin-top: 26px;
    border-top: 1px solid var(--opl-border);
    padding-top: 13px;
  }

  .settings-action-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.22);
  }

  .settings-action-dialog {
    width: min(410px, calc(100vw - 32px));
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: var(--opl-space-3);
    padding: var(--opl-space-5);
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-surface);
    background: var(--opl-canvas);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
  }

  .settings-action-dialog-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--opl-hover);
    color: var(--opl-muted);
  }

  .settings-action-dialog h2 {
    margin: 2px 0 7px;
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-action-dialog p {
    margin: 0 0 5px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .settings-add-agent-dialog {
    grid-template-columns: 32px minmax(0, 1fr);
  }

  .settings-add-agent-fields {
    display: grid;
    gap: 10px;
  }

  .settings-add-agent-fields label {
    display: grid;
    gap: 5px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .settings-add-agent-fields input,
  .settings-add-agent-fields select {
    min-height: 32px;
    width: 100%;
    padding: 0 9px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font: inherit;
  }

  .settings-action-dialog-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 5px;
  }

  .settings-action-dialog-actions button {
    min-height: var(--opl-control-md);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .settings-action-dialog-actions button.primary {
    border-color: var(--opl-text);
    background: var(--opl-text);
    color: var(--opl-canvas);
  }

  .spin {
    animation: opl-spin 900ms linear infinite;
  }

  @keyframes opl-spin {
    to { transform: rotate(360deg); }
  }

  .context-inspector {
    position: absolute;
    top: 56px;
    right: 12px;
    bottom: auto;
    z-index: 30;
    width: min(318px, calc(100vw - 28px));
    max-height: min(680px, calc(100vh - 200px));
    display: none;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--opl-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.10);
  }

  .context-inspector.open {
    display: flex;
  }

  .inspector-header {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 12px;
  }

  .inspector-header h2 {
    margin: 0;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .environment-detail-header {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .environment-detail-header h2 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-header button {
    width: 28px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
  }

  .inspector-header button:hover {
    background: var(--opl-hover);
  }

  .context-summary {
    display: none;
  }

  .context-scroll {
    min-height: 0;
    overflow-y: auto;
  }

  .environment-menu {
    display: grid;
    gap: 2px;
    padding: 0 8px 10px;
  }

  .environment-menu-entry {
    display: grid;
  }

  .environment-menu-group {
    margin: 5px 8px 2px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-medium);
  }

  .environment-menu-entry:first-of-type .environment-menu-group {
    margin-top: 0;
  }

  .environment-menu[hidden] {
    display: none;
  }

  .environment-menu > p {
    margin: 0;
    padding: 0 8px 9px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .environment-menu-entry button {
    width: 100%;
    min-height: 44px;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 7px;
    padding: 5px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--opl-text);
    text-align: left;
  }

  .environment-menu-entry button:hover {
    background: var(--opl-hover);
  }

  .environment-menu-icon {
    width: 22px;
    height: 22px;
    display: inline-grid;
    place-items: center;
    color: var(--opl-muted);
  }

  .environment-menu-copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .environment-menu-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-medium);
  }

  .environment-menu-copy small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-tight);
  }

  .environment-menu-meta {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    white-space: nowrap;
  }

  .context-block {
    min-width: 0;
    padding: 14px;
  }

  .context-block *,
  .package-lifecycle-card *,
  .starter-form * {
    min-width: 0;
  }

  .context-block p,
  .context-block code,
  .context-block dd,
  .context-block button {
    overflow-wrap: anywhere;
  }

  .context-block header,
  .context-list-head,
  .delivery-head,
  .starter-form header,
  .package-lifecycle-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .context-block h3,
  .starter-form h3 {
    margin: 0;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .context-empty,
  .delivery-note,
  .runtime-note,
  .starter-form p,
  .starter-form small,
  .package-lifecycle-card p,
  .package-lifecycle-card small {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .context-list,
  .delivery-stack,
  .starter-stack,
  .utility-stack,
  .package-lifecycle-list {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .context-list {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }

  .context-list li,
  .starter-form,
  .package-lifecycle-card,
  .delivery-card,
  .confirmation-card,
  .action-receipt-summary {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--opl-border) !important;
    border-radius: 9px !important;
    background: var(--opl-canvas) !important;
  }

  .context-list li {
    display: grid;
    gap: 3px;
  }

  .context-list code,
  .context-code,
  .trace-list dd,
  .package-lifecycle-card code,
  output,
  pre {
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-wrap;
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
  }

  .context-quiet-action,
  .context-button,
  .provenance-actions button,
  .runtime-actions button,
  .starter-form button,
  .package-action-row button {
    min-height: 29px;
    padding: 0 8px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-size: var(--opl-text-xs);
  }

  .artifact-preview-tabs,
  .provenance-drawer,
  .starter-forms,
  .package-lifecycle-panel,
  .runtime-panel,
  .action-receipt-summary-list {
    min-width: 0;
  }

  .artifact-preview-tabs [role="tablist"] {
    display: flex;
    gap: 14px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--opl-border);
  }

  .artifact-preview-tabs [role="tab"] {
    min-height: 32px;
    padding: 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .artifact-preview-tabs [role="tab"][data-state="active"] {
    border-bottom-color: var(--opl-accent);
    color: var(--opl-text);
  }

  .artifact-preview-card {
    min-width: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .artifact-preview-card > header {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .artifact-preview-card h3 {
    margin: 0;
    font-size: var(--opl-text-md);
  }

  .artifact-preview-card .status-pill,
  .delivery-card .status-pill {
    white-space: nowrap;
  }

  .delivery-cards {
    margin-top: 14px;
  }

  .delivery-card dl {
    grid-template-columns: 1fr !important;
  }

  .trace-list,
  .package-filter-list,
  .package-axis-list,
  .package-detail-list,
  .package-ref-list {
    display: grid;
    gap: 7px;
    margin: 10px 0;
  }

  .trace-list div,
  .package-filter-list div,
  .package-axis-list div,
  .package-detail-list div,
  .package-ref-list div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .trace-list dt,
  .package-filter-list dt,
  .package-axis-list dt,
  .package-detail-list dt,
  .package-ref-list dt {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .trace-list dd,
  .package-filter-list dd,
  .package-axis-list dd,
  .package-detail-list dd,
  .package-ref-list dd {
    margin: 0;
  }

  .provenance-actions,
  .runtime-actions,
  .package-action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }

  .starter-form {
    display: grid;
    gap: 8px;
  }

  .starter-field {
    display: grid;
    gap: 4px;
    font-size: var(--opl-text-xs);
  }

  .starter-field input,
  .starter-field textarea,
  .starter-field select {
    width: 100%;
    padding: 7px 8px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-canvas);
  }

  .runtime-meta {
    display: grid;
    gap: 5px;
  }

  .session-chip,
  .status-pill {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 6px;
    border-radius: 5px;
    background: var(--opl-accent-soft);
    color: var(--opl-text);
    font-size: var(--opl-text-xs);
  }

  .project-directory {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .thread-scope-filter {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
    margin: 0 0 7px;
    padding: 2px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-surface-secondary);
  }

  .thread-scope-filter[hidden] {
    display: none;
  }

  .thread-scope-filter button {
    min-width: 0;
    min-height: 25px;
    padding: 0 5px;
    overflow: hidden;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--opl-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--opl-text-xs);
  }

  .thread-scope-filter button[data-active="true"] {
    background: var(--opl-canvas);
    color: var(--opl-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .project-directory-group {
    min-width: 0;
  }

  .project-directory-group[data-projectless="true"] .project-root {
    color: var(--opl-muted);
  }

  .project-directory-group[data-projectless="true"] .thread-directory-open {
    padding-left: 7px;
  }

  .thread-directory-state {
    margin: 6px 9px 10px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .thread-directory-state.error,
  .dialog-error {
    color: var(--opl-danger);
  }

  .thread-directory-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 26px;
    align-items: center;
    gap: 2px;
  }

  .history-list li .thread-directory-open {
    min-width: 0;
    max-width: 100%;
    display: block;
    overflow: hidden;
    padding: 4px 4px 4px 28px;
  }

  .history-list li .thread-directory-open .thread-directory-copy {
    min-width: 0;
    max-width: 100%;
    display: block;
    overflow: hidden;
  }

  .thread-directory-copy strong,
  .thread-directory-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-directory-copy strong {
    max-width: 100%;
    display: block;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-regular);
  }

  .thread-directory-copy small,
  .thread-directory-open time {
    display: none;
  }

  .history-list li .thread-directory-copy small {
    margin-left: 0;
  }

  .thread-directory-open time {
    white-space: nowrap;
  }

  .history-list li .thread-directory-detail {
    width: 26px;
    min-height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    opacity: 0;
  }

  .thread-directory-row:hover .thread-directory-detail,
  .thread-directory-detail:focus-visible {
    opacity: 1;
  }

  .current-project-context {
    display: none;
  }

  .current-project-context .project-root {
    min-height: 29px;
  }

  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(20, 21, 20, 0.28);
  }

  .thread-detail-popover,
  .thread-confirmation-dialog {
    position: fixed;
    z-index: 81;
    min-width: 0;
    overflow: auto;
    border: 1px solid var(--opl-border);
    border-radius: 8px;
    outline: 0;
    background: var(--opl-canvas);
    box-shadow: 0 18px 52px rgba(0, 0, 0, 0.18);
  }

  .thread-detail-popover {
    top: 64px;
    left: calc(var(--opl-sidebar-width) + 14px);
    width: min(390px, calc(100vw - var(--opl-sidebar-width) - 46px));
    max-height: calc(100vh - 88px);
    padding: 14px;
  }

  .thread-confirmation-dialog {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .thread-confirmation-dialog {
    width: min(430px, calc(100vw - 32px));
    padding: 16px;
  }

  .thread-detail-popover > header,
  .thread-confirmation-dialog > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 30px;
    align-items: center;
    gap: 9px;
    min-height: 34px;
  }

  .thread-detail-popover > header {
    grid-template-columns: minmax(0, 1fr) 30px;
  }

  .thread-detail-popover h2,
  .thread-confirmation-dialog h2 {
    margin: 0;
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-medium);
  }

  .thread-detail-title {
    display: block;
    margin: 12px 0 8px;
    overflow-wrap: anywhere;
    font-size: var(--opl-text-md);
  }

  .thread-detail-popover dl,
  .thread-confirmation-dialog dl {
    display: grid;
    gap: 0;
    margin: 0;
    border-top: 1px solid var(--opl-border);
  }

  .thread-detail-popover dl > div,
  .thread-confirmation-dialog dl > div {
    min-width: 0;
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--opl-border);
  }

  .thread-detail-popover dt,
  .thread-confirmation-dialog dt {
    color: var(--opl-muted);
  }

  .thread-detail-popover dd,
  .thread-confirmation-dialog dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .thread-detail-popover code,
  .thread-confirmation-dialog code {
    white-space: pre-wrap;
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
  }

  .thread-detail-actions,
  .thread-confirmation-dialog footer {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 14px;
  }

  .thread-detail-actions button,
  .thread-confirmation-dialog footer button {
    min-height: 31px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .thread-confirmation-dialog footer .primary {
    border-color: var(--opl-text);
    background: var(--opl-text);
    color: var(--opl-canvas);
  }

  .codex-server-request-panel {
    display: grid;
    gap: 10px;
    margin: 0 0 14px;
    padding: 12px;
    border: 1px solid var(--opl-border);
    border-left: 3px solid var(--opl-text);
    background: var(--opl-canvas);
  }

  .codex-server-request-panel > header,
  .codex-server-request-heading,
  .codex-server-request-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .codex-server-request-panel > header span {
    margin-left: auto;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .codex-server-request {
    display: grid;
    gap: 8px;
    padding-top: 9px;
    border-top: 1px solid var(--opl-border);
  }

  .codex-server-request-heading code {
    margin-left: auto;
    color: var(--opl-muted);
    font: 10px var(--opl-font-mono);
  }

  .codex-server-request-message {
    margin: 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    overflow-wrap: anywhere;
  }

  .codex-server-request-field {
    display: grid;
    gap: 4px;
    font-size: var(--opl-text-sm);
  }

  .codex-server-request-field small {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .codex-server-request-field input,
  .codex-server-request-field select {
    min-height: 31px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--opl-border);
    border-radius: 5px;
    background: var(--opl-canvas);
    color: var(--opl-text);
    padding: 0 8px;
  }

  .codex-server-request-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .codex-server-request-actions button,
  .codex-server-request > button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .codex-server-request-actions .primary {
    border-color: var(--opl-text);
    background: var(--opl-text);
    color: var(--opl-canvas);
  }

  .opl-primary-nav {
    display: grid;
    align-self: stretch;
    width: auto;
    margin: 0 2px 8px;
  }

  .opl-primary-nav button {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 9px;
    padding: 0 8px;
    box-sizing: border-box;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-regular);
    line-height: 20px;
    cursor: pointer;
    overflow: hidden;
  }

  .opl-primary-nav button:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .opl-primary-nav button[aria-current="page"] {
    background: var(--opl-selected);
  }

  .opl-studio-dsh-root button[class*="newSession"] {
    height: 32px;
    justify-content: flex-start;
    gap: 9px;
    margin: 0 2px 8px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-regular);
    line-height: 20px;
  }

  .opl-studio-dsh-root button[class*="newSession"]:hover {
    background: var(--opl-hover);
  }

  .opl-studio-dsh-root [class*="collapsed"] button[class*="newSession"] {
    width: 36px;
    height: 36px;
    justify-content: center;
    gap: 0;
    margin: 0 0 12px;
    padding: 0;
  }

  .opl-primary-nav[data-wide="false"] {
    width: 36px;
    margin: 0 0 12px;
  }

  .opl-primary-nav[data-wide="false"] button {
    width: 36px;
    height: 36px;
    justify-content: center;
    gap: 0;
    padding: 0;
    border-color: transparent;
    background: transparent;
  }

  .opl-primary-nav[data-wide="false"] button:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .opl-workspace-browser-seat {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .opl-workspace-browser-seat > div:first-child,
  .opl-workspace-browser-seat [role="tree"] {
    flex: none;
    min-height: auto;
  }

  .opl-workspace-browser-seat [role="tree"] {
    overflow: visible;
    scrollbar-gutter: auto;
  }

  .opl-recent-sessions {
    flex: none;
    min-width: 0;
    margin: 4px 0 6px;
    padding-right: var(--dsh-sidebar-inline-padding);
  }

  .opl-recent-sessions h2 {
    min-height: 36px;
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0 4px;
    color: var(--dsw-alias-label-tertiary);
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-regular);
    line-height: 20px;
  }

  .runtime-snapshot-note {
    margin: 8px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .runtime-snapshot-note[data-source="cached"] {
    color: var(--opl-muted);
  }

  .runtime-snapshot-note[data-source="live"]::before,
  .runtime-snapshot-note[data-source="cached"]::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 6px;
    border-radius: 50%;
    background: currentColor;
    vertical-align: 1px;
  }

  .opl-recent-session-list > * + * {
    margin-top: 2px;
  }

  .opl-runtime-overview {
    min-width: 0;
    min-height: 100%;
    overflow: auto;
    padding: var(--opl-space-6) clamp(20px, 3.2vw, 44px) 32px;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    line-height: var(--opl-leading-normal);
  }

  .runtime-overview-header,
  .runtime-overview-header > div,
  .runtime-list-heading,
  .runtime-list-heading > div,
  .runtime-list-controls,
  .runtime-work-identity > span,
  .runtime-work-identity > button > span,
  .runtime-stage-button,
  .runtime-stage-popover > header,
  .runtime-work-time {
    display: flex;
    align-items: center;
  }

  .runtime-overview-header {
    justify-content: space-between;
    gap: var(--opl-space-4);
    min-height: 36px;
  }

  .runtime-overview-header > div {
    gap: var(--opl-space-2);
    min-width: 0;
  }

  .runtime-overview-header h1 {
    margin: 0;
    font-size: var(--opl-text-xl);
    line-height: var(--opl-leading-tight);
    font-weight: var(--opl-weight-semibold);
    letter-spacing: 0;
  }

  .runtime-icon-button,
  .runtime-stage-popover > header button {
    flex: 0 0 var(--opl-control-md);
    width: var(--opl-control-md);
    height: var(--opl-control-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-muted);
  }

  .runtime-icon-button:hover,
  .runtime-stage-popover > header button:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .runtime-domain-view-header > div {
    flex: 1;
  }

  .runtime-domain-view-title {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .runtime-domain-view-title > span {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .runtime-domain-view-title h1 {
    overflow-wrap: anywhere;
  }

  .runtime-domain-detail-view {
    margin-top: 24px;
  }

  .runtime-domain-detail-view > header h4,
  .runtime-domain-view-entries > h4 {
    margin: 0;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .runtime-domain-detail-view > header h4 {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .runtime-domain-detail-view > nav,
  .runtime-domain-view-entry-list {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .runtime-domain-detail-view > nav button,
  .runtime-domain-view-entry-list > button {
    min-width: 0;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-canvas);
    color: var(--opl-text);
    overflow-wrap: anywhere;
    text-align: left;
  }

  .runtime-domain-detail-view > nav button[aria-selected="true"],
  .runtime-domain-detail-view > nav button:hover,
  .runtime-domain-view-entry-list > button:hover {
    border-color: var(--opl-border-heavy);
    background: var(--opl-hover);
  }

  .runtime-domain-detail-view > [role="tabpanel"] {
    min-width: 0;
    padding-top: 16px;
    border-top: 1px solid var(--opl-border);
  }

  .runtime-domain-detail-view > [role="tabpanel"] > p {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--opl-muted);
  }

  .runtime-domain-detail-view > [role="tabpanel"] > button {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 12px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    background: var(--opl-canvas);
    color: var(--opl-muted);
  }

  .runtime-domain-view-entries {
    grid-column: 1 / -1;
    padding-top: 12px;
    border-top: 1px solid var(--opl-border);
  }

  .runtime-scope-band {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(150px, 220px) minmax(150px, 240px) minmax(120px, 1fr);
    align-items: end;
    gap: var(--opl-space-4);
    margin-top: var(--opl-space-5);
    padding: 12px 0;
    border-block: 1px solid var(--opl-border);
  }

  .runtime-scope-band > strong {
    align-self: center;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .runtime-scope-band label {
    min-width: 0;
    display: grid;
    gap: var(--opl-space-1);
  }

  .runtime-scope-band label > span,
  .runtime-loaded-at,
  .runtime-list-heading span,
  .runtime-work-identity > span,
  .runtime-work-status small,
  .runtime-work-progress p,
  .runtime-stage-popover li small,
  .runtime-work-usage dt,
  .runtime-work-time {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .runtime-scope-band select,
  .runtime-list-controls select {
    min-width: 0;
    height: var(--opl-control-md);
    padding: 0 28px 0 9px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .runtime-loaded-at {
    justify-self: end;
    align-self: center;
    white-space: nowrap;
  }

  .runtime-summary-band {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
    border-bottom: 1px solid var(--opl-border);
  }

  .runtime-summary-band > div {
    min-width: 0;
    padding: 14px 0;
  }

  .runtime-summary-band > div + div {
    padding-left: 20px;
    border-left: 1px solid var(--opl-border);
  }

  .runtime-summary-band dt {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .runtime-summary-band dd {
    margin: var(--opl-space-1) 0 0;
    font-size: var(--opl-text-lg);
    font-weight: var(--opl-weight-semibold);
  }

  .runtime-summary-band dd[data-tone="success"] { color: var(--opl-success); }
  .runtime-summary-band dd[data-tone="active"] { color: var(--opl-accent); }
  .runtime-summary-band dd[data-tone="attention"] { color: var(--opl-warning); }
  .runtime-summary-band dd[data-tone="muted"] { color: var(--opl-muted); }

  .runtime-recovery-band {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(220px, 1.1fr) minmax(240px, 1fr) minmax(220px, auto);
    align-items: center;
    gap: var(--opl-space-4);
    padding: 14px 0;
    border-bottom: 1px solid var(--opl-border);
  }

  .runtime-recovery-heading,
  .runtime-recovery-action,
  .runtime-recovery-confirmation {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .runtime-recovery-heading {
    gap: 9px;
  }

  .runtime-recovery-heading > svg {
    flex: 0 0 auto;
    color: var(--opl-muted);
  }

  .runtime-recovery-band[data-status="attention"] .runtime-recovery-heading > svg,
  .runtime-recovery-band[data-status="blocked"] .runtime-recovery-heading > svg {
    color: var(--opl-warning);
  }

  .runtime-recovery-heading h2,
  .runtime-recovery-heading p,
  .runtime-recovery-action p {
    margin: 0;
  }

  .runtime-recovery-heading h2 {
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .runtime-recovery-heading p,
  .runtime-recovery-band dt,
  .runtime-recovery-action > span,
  .runtime-recovery-action p {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .runtime-recovery-band dl {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  .runtime-recovery-band dd {
    margin: 3px 0 0;
    overflow-wrap: anywhere;
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-medium);
  }

  .runtime-recovery-action {
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 7px;
  }

  .runtime-recovery-action button,
  .runtime-recovery-confirmation button {
    min-height: var(--opl-control-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
  }

  .runtime-recovery-action button:hover:not(:disabled),
  .runtime-recovery-confirmation button:hover:not(:disabled) {
    background: var(--opl-hover);
  }

  .runtime-recovery-confirmation {
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 7px;
  }

  .runtime-recovery-confirmation > span {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .runtime-recovery-confirmation button.primary {
    border-color: var(--opl-text);
    background: var(--opl-text);
    color: var(--opl-canvas);
  }

  .runtime-recovery-action p {
    flex-basis: 100%;
    text-align: right;
  }

  .runtime-recovery-action p[data-tone="attention"] {
    color: var(--opl-warning);
  }

  .runtime-list-heading {
    justify-content: space-between;
    gap: var(--opl-space-4);
    margin-top: var(--opl-space-5);
  }

  .runtime-list-heading > div:first-child {
    gap: var(--opl-space-2);
    min-width: 0;
  }

  .runtime-list-heading h2 {
    margin: 0;
    font-size: var(--opl-text-lg);
    font-weight: var(--opl-weight-semibold);
  }

  .runtime-list-controls {
    gap: 8px;
  }

  .runtime-archive-button {
    min-height: var(--opl-control-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .runtime-archive-button:hover,
  .runtime-archive-button[aria-pressed="true"] {
    background: var(--opl-hover);
  }

  .runtime-overview-error,
  .runtime-overview-empty {
    margin: 22px 0 0;
    padding: 20px 0;
    color: var(--opl-muted);
    text-align: center;
  }

  .runtime-overview-error {
    color: var(--opl-danger);
  }

  .runtime-work-list {
    display: grid;
    gap: var(--opl-space-3);
    margin-top: var(--opl-space-3);
  }

  .runtime-work-row {
    min-width: 0;
    position: relative;
    display: grid;
    grid-template-columns: minmax(190px, 1.15fr) minmax(92px, .55fr) minmax(260px, 1.5fr) minmax(150px, .8fr);
    align-items: center;
    gap: var(--opl-space-4);
    padding: var(--opl-space-4);
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-surface);
    background: var(--opl-surface-elevated);
  }

  .runtime-work-row:hover {
    border-color: var(--opl-border-heavy);
  }

  .runtime-work-row[data-selected="true"] {
    border-color: var(--opl-accent);
  }

  .runtime-work-identity,
  .runtime-work-progress,
  .runtime-work-usage {
    min-width: 0;
  }

  .runtime-work-identity > strong,
  .runtime-work-identity > button > strong {
    display: block;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-medium);
  }

  .runtime-work-identity > button {
    display: grid;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .runtime-work-identity > button:hover h3,
  .runtime-work-identity > button:focus-visible h3 {
    color: var(--opl-accent);
  }

  .runtime-work-identity h3 {
    margin: var(--opl-space-1) 0 var(--opl-space-2);
    overflow-wrap: anywhere;
    font-size: var(--opl-text-md);
    line-height: var(--opl-leading-normal);
    font-weight: var(--opl-weight-semibold);
    letter-spacing: 0;
  }

  .runtime-work-identity > span,
  .runtime-work-identity > button > span {
    gap: 5px;
  }

  .runtime-work-status {
    min-width: 0;
    display: grid;
    gap: var(--opl-space-1);
    justify-items: start;
  }

  .runtime-work-status > span {
    display: inline-flex;
    max-width: 100%;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--opl-surface-secondary);
    color: var(--opl-muted);
    overflow-wrap: anywhere;
    font-size: var(--opl-text-sm);
  }

  .runtime-work-row[data-status="running"] .runtime-work-status > span {
    background: color-mix(in oklab, var(--opl-accent) 13%, transparent);
    color: var(--opl-accent);
  }

  .runtime-work-row[data-status="attention"] .runtime-work-status > span {
    background: var(--opl-warning-soft);
    color: var(--opl-warning);
  }

  .runtime-stage-button {
    width: 100%;
    min-height: var(--opl-control-sm);
    justify-content: space-between;
    gap: 9px;
    padding: 0 8px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
    text-align: left;
  }

  .runtime-stage-button > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--opl-text-sm);
  }

  .runtime-stage-button[aria-expanded="true"] svg {
    transform: rotate(180deg);
  }

  .runtime-work-progress p {
    margin: var(--opl-space-2) 0 0;
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
    overflow-wrap: anywhere;
  }

  .runtime-work-progress p strong {
    color: var(--opl-text);
    font-weight: var(--opl-weight-medium);
  }

  .runtime-stage-popover {
    position: absolute;
    z-index: 12;
    top: calc(100% - 8px);
    right: 152px;
    width: min(360px, calc(100% - 28px));
    max-height: 320px;
    overflow: auto;
    padding: var(--opl-space-3);
    border: 1px solid var(--opl-border-heavy);
    border-radius: var(--opl-radius-surface);
    background: var(--opl-canvas);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
  }

  .runtime-stage-popover > header {
    justify-content: space-between;
    gap: 12px;
  }

  .runtime-stage-popover > header button {
    flex-basis: 26px;
    width: 26px;
    height: 26px;
  }

  .runtime-stage-popover ol {
    display: grid;
    gap: 0;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .runtime-stage-popover li {
    min-width: 0;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 7px;
    padding: 7px 0;
  }

  .runtime-stage-popover li > span {
    width: 8px;
    height: 8px;
    margin-top: 4px;
    border: 2px solid var(--opl-border-heavy);
    border-radius: 50%;
  }

  .runtime-stage-popover li[data-state="completed"] > span {
    border-color: var(--opl-success);
    background: var(--opl-success);
  }

  .runtime-stage-popover li[data-state="running"] > span {
    border-color: var(--opl-accent);
    background: var(--opl-accent);
  }

  .runtime-stage-popover li div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .runtime-stage-popover li strong {
    overflow-wrap: anywhere;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-medium);
  }

  .runtime-work-usage {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .runtime-work-usage > div:not(.runtime-work-time) {
    min-width: 0;
    padding-left: 8px;
    border-left: 1px solid var(--opl-border);
  }

  .runtime-work-usage dt,
  .runtime-work-usage dd {
    overflow-wrap: anywhere;
  }

  .runtime-work-usage dd {
    margin: var(--opl-space-1) 0 0;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-medium);
  }

  .runtime-work-time {
    grid-column: 1 / -1;
    gap: 5px;
  }


  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 980px) {
    .conversation-inner {
      padding-inline: 18px;
    }

    .context-inspector {
      right: 10px;
      width: min(340px, calc(100vw - 24px));
    }

    .runtime-scope-band {
      grid-template-columns: auto repeat(2, minmax(130px, 1fr));
    }

    .runtime-loaded-at {
      grid-column: 2 / -1;
      justify-self: start;
    }

    .runtime-recovery-band {
      grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr);
    }

    .runtime-recovery-action {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }

    .runtime-recovery-action p {
      text-align: left;
    }

    .runtime-work-row {
      grid-template-columns: minmax(180px, 1fr) minmax(90px, .5fr) minmax(230px, 1.35fr);
    }

    .runtime-work-usage {
      grid-column: 1 / -1;
      grid-template-columns: repeat(2, minmax(120px, 180px)) minmax(140px, 1fr);
      align-items: center;
    }

    .runtime-work-time {
      grid-column: auto;
    }

    .runtime-stage-popover {
      right: 14px;
    }
  }

  @media (max-width: 760px) {
    .startup-readiness {
      place-items: start center;
      padding: calc(32px + var(--opl-native-titlebar-inset)) 20px 28px;
    }

    .startup-readiness-content {
      width: 100%;
      margin: auto 0;
    }

    .startup-readiness h1 {
      font-size: var(--opl-text-2xl);
    }

    .startup-readiness-count {
      margin-bottom: 22px;
    }

    .startup-readiness-stages li {
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 10px;
      min-height: 62px;
    }

    .startup-readiness-stage-status {
      grid-column: 2;
      margin-top: -7px;
    }

    .startup-readiness-actions button {
      flex: 1 1 140px;
    }

    .opl-studio,
    .opl-studio.sidebar-closed {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 40;
      width: min(236px, 88vw);
      box-shadow: 12px 0 32px rgba(0, 0, 0, 0.10);
    }

    .sidebar-closed .sidebar {
      display: none;
    }

    .sidebar-resizer {
      display: none;
    }

    .opl-runtime-overview {
      padding: 18px 14px 28px;
    }

    .runtime-scope-band {
      grid-template-columns: 1fr;
    }

    .runtime-scope-band > strong,
    .runtime-loaded-at {
      grid-column: 1;
      justify-self: start;
    }

    .runtime-summary-band > div + div {
      padding-left: 12px;
    }

    .runtime-recovery-band {
      grid-template-columns: minmax(0, 1fr);
    }

    .runtime-recovery-action {
      grid-column: auto;
    }

    .runtime-list-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .runtime-list-controls {
      width: 100%;
      flex-wrap: wrap;
    }

    .runtime-list-controls select,
    .runtime-archive-button {
      flex: 1 1 150px;
    }

    .runtime-work-row {
      grid-template-columns: 1fr;
      gap: 11px;
    }

    .runtime-work-status {
      justify-items: start;
    }

    .runtime-work-usage {
      grid-column: 1;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .runtime-work-time {
      grid-column: 1 / -1;
    }

    .runtime-stage-popover {
      position: fixed;
      inset: auto 12px 12px;
      width: auto;
      max-height: min(440px, 62dvh);
    }

    .sidebar-search {
      display: none;
    }

    .sidebar-close-mobile {
      display: inline-grid;
    }

    .settings-page {
      display: block;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) {
      flex-direction: column;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav {
      width: 100%;
      height: 148px;
      gap: 8px;
      padding: 14px 12px 0;
      overflow: hidden;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav > div:last-child {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      flex-direction: row;
      overflow: visible;
      padding-bottom: 8px;
      gap: 4px;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav button {
      width: 100%;
      min-width: 0;
      padding-inline: 8px;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav + div {
      width: 100%;
      min-height: 0;
    }

    .settings-page::-webkit-scrollbar {
      display: none;
    }

    .settings-detail {
      overflow: visible;
    }

    .settings-detail-header,
    .settings-content {
      padding-right: 18px;
      padding-left: 18px;
    }

    .settings-detail-header {
      padding-top: 22px;
      padding-bottom: 16px;
    }

    .settings-subnav {
      gap: 4px;
    }

    .settings-detail-title-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }

    .settings-row {
      grid-template-columns: 1fr;
      gap: 7px;
    }

    .settings-row-value {
      justify-content: flex-start;
      text-align: left;
    }

    .settings-capability-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .settings-capability-toolbar .settings-search-field {
      width: 100%;
    }

    .settings-capability-toolbar .settings-icon-button {
      align-self: flex-end;
    }

    .settings-editor-heading,
    .settings-editor-footer,
    .settings-default-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .gateway-login-form,
    .settings-api-key-form {
      grid-template-columns: 1fr;
    }

    .settings-access-setup-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .gateway-login-form .settings-action-button,
    .settings-api-key-form .settings-action-button {
      justify-self: end;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav button {
      font-size: var(--opl-text-sm);
    }

    .settings-workspace-location {
      width: 100%;
      align-items: flex-start;
      flex-direction: column;
    }

    .settings-workspace-location code {
      width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .settings-editor-footer .settings-row-actions,
    .settings-default-row .settings-action-button {
      align-self: flex-end;
    }

    .opl-first-run {
      width: min(100% - 32px, 680px);
      justify-content: flex-start;
      gap: 22px;
      padding: 42px 0 24px;
      overflow-y: auto;
    }

    .opl-first-run > header {
      grid-template-columns: 1fr;
    }

    .opl-first-run > footer {
      flex-wrap: wrap;
    }

    .settings-capability-row > summary,
    .settings-instruction-source > summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 7px;
    }

    .settings-capability-state {
      justify-content: space-between;
    }

    .gateway-identity {
      grid-template-columns: 42px minmax(0, 1fr);
    }

    .gateway-identity > .settings-status {
      grid-column: 2;
    }

    .agent-catalog-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .settings-search-field {
      width: 100%;
    }

    .agent-catalog-toolbar .segmented-control {
      width: 100%;
    }

    .agent-catalog-toolbar .segmented-control button {
      flex: 1;
    }

    .agent-catalog-filters select {
      max-width: 100%;
      flex: 1 1 120px;
    }

    .agent-package-row > summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 9px;
    }

    .agent-package-summary-actions,
    .runtime-setting-control {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .agent-package-details > dl,
    .agent-technical-details dl {
      grid-template-columns: 1fr;
    }

    .settings-action-dialog {
      grid-template-columns: 1fr;
    }

    .settings-action-dialog-actions {
      grid-column: 1;
    }

    .composer-select select {
      max-width: 74px;
    }

    .composer-palette {
      position: fixed;
      inset: 54px 0 0 56px;
      width: auto;
      max-height: none;
      border-radius: 0;
    }

    .history-list li .thread-directory-detail {
      opacity: 1;
    }

    .thread-detail-popover,
    .thread-confirmation-dialog {
      inset: 0;
      width: 100%;
      height: 100dvh;
      max-height: none;
      padding: 16px;
      transform: none;
      border: 0;
      border-radius: 0;
    }

    .thread-confirmation-dialog footer button {
      width: 100%;
      min-height: 42px;
    }
  }

  @media (max-width: 480px) {
    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav {
      flex: 0 0 226px;
      height: 226px;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav > div:last-child {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

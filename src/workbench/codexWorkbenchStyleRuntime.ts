export const codexWorkbenchStyleRuntime = `  @keyframes opl-spin {
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
    border-radius: var(--dsw-radius-md);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-md) !important;
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
    background: var(--opl-accent-soft);
    color: var(--opl-text);
    font-size: var(--opl-text-xs);
  }

`;

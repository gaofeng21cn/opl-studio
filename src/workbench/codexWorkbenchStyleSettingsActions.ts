export const codexWorkbenchStyleSettingsActions = `  .settings-action-button {
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
    /* The confirmation dialog is mounted in the root shell overlay, a sibling of
       the settings modal (SettingsRoot/DSH Modal at z-index 1000). It must sit
       above that modal or it is painted behind it and looks like the confirm
       step never appeared. */
    z-index: 1100;
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
  .settings-action-target-location { overflow-wrap: anywhere; }

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

`;

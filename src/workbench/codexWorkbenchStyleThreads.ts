export const codexWorkbenchStyleThreads = `  .project-directory {
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

  .dialog-warning {
    margin: 12px 0 0;
    color: var(--opl-warning, #9a6700);
    font-size: var(--opl-text-sm);
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


`;

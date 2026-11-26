export const codexWorkbenchStyleComposer = `  .composer {
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
    border-radius: var(--dsw-radius-xl);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-md);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-md);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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

`;

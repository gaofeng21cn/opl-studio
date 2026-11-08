export const codexWorkbenchStyleSettingsCore = `  .settings-detail::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .settings-detail {
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--opl-border) transparent;
  }

  .settings-detail::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: var(--opl-border);
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
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
  }

  .settings-detail-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .settings-detail-description {
    max-width: 680px;
    margin: 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
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
    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
  }

  .settings-rows {
    border: 0;
  }

  .settings-row {
    min-height: 56px;
    display: grid;
    grid-template-columns: minmax(150px, 0.9fr) minmax(230px, 1.35fr);
    align-items: center;
    gap: 24px;
    padding: 16px 0;
    border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  }

  .settings-row:last-child { border-bottom: 0; }

  .settings-row-label,
  .settings-inline-identity > span:last-child,
  .gateway-identity > span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-row-label > span {
    font-size: 14px;
    font-weight: 400;
    line-height: 22px;
  }

  .settings-page small {
    color: var(--dsw-alias-label-tertiary);
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
  }

  .settings-row-value {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--opl-muted);
    font-size: 14px;
    line-height: 22px;
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

  .settings-detail-title-row > .settings-page-refresh {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 6px;
    border: 0;
    border-radius: var(--dsw-radius-md, 12px);
    background: transparent;
    color: var(--dsw-alias-label-secondary, var(--opl-muted));
  }
  .settings-detail-title-row > .settings-page-refresh:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, var(--opl-hover));
  }
  .settings-page-refresh:focus-visible {
    outline: 2px solid var(--dsw-alias-label-secondary, var(--opl-text));
    outline-offset: 2px;
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

`;

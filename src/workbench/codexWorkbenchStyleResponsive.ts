export const codexWorkbenchStyleResponsive = `  @media (max-width: 980px) {
    .conversation-inner {
      padding-inline: 18px;
    }

    .context-inspector {
      right: 10px;
      width: min(340px, calc(100vw - 24px));
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
      height: auto;
      flex: none;
      gap: 8px;
      padding: 14px 12px 0;
      overflow: visible;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav > div:last-child {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 8px;
      gap: 4px;
    }

    .opl-studio-dsh-root [role="dialog"][aria-labelledby]:has(> nav) > nav button {
      width: auto;
      flex: none;
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

    .opl-first-run-surface {
      padding: 16px;
    }

    .opl-first-run {
      width: 100%;
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

  [data-shortcut-modal="settings"] .sss-pop { background: var(--opl-canvas); z-index: 100; min-width: 220px; }
`;

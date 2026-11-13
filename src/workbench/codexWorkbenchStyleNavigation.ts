export const codexWorkbenchStyleNavigation = `  .opl-studio {
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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

`;

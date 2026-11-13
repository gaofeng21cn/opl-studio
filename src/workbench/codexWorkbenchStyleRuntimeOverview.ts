export const codexWorkbenchStyleRuntimeOverview = `  .runtime-snapshot-note {
    margin: 8px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .runtime-overview-intro {
    margin: 8px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-body);
    line-height: var(--opl-leading-normal);
  }

  .opl-recent-session-list > * + * {
    margin-top: 2px;
  }

  .opl-runtime-overview {
    container: runtime-page / inline-size;
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

  .runtime-domain-view {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
  }

  .runtime-domain-view-header {
    flex: none;
    padding: var(--opl-space-6) clamp(20px, 3.2vw, 44px) var(--opl-space-3);
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
    border-radius: var(--dsw-radius-sm);
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
    border-radius: var(--dsw-radius-sm);
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
    grid-template-columns: max-content minmax(0, 240px) minmax(0, 280px);
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

  .runtime-service-notice {
    display: flex;
    align-items: flex-start;
    gap: var(--opl-space-3);
    margin-top: var(--opl-space-5);
    padding: var(--opl-space-4);
    border-radius: var(--opl-radius-surface);
    background: var(--opl-surface-secondary);
  }

  .runtime-service-notice > svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--opl-muted);
  }

  .runtime-service-notice[data-tone="attention"] > svg {
    color: var(--opl-warning);
  }

  .runtime-service-notice > div {
    flex: 1;
    min-width: 0;
  }

  .runtime-service-notice h2 {
    margin: 0;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
    overflow-wrap: anywhere;
  }

  .runtime-service-notice p {
    margin: var(--opl-space-1) 0 0;
    max-width: 72ch;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .runtime-refresh-button,
  .runtime-maintenance-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--opl-space-2);
    min-height: var(--opl-control-md);
    padding: 0 var(--opl-space-3);
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
    white-space: nowrap;
  }

  .runtime-refresh-button:hover:not(:disabled),
  .runtime-maintenance-button:hover:not(:disabled) {
    background: var(--opl-hover);
  }

  .opl-runtime-overview :is(button, select, summary):focus-visible {
    outline: 2px solid var(--opl-accent);
    outline-offset: 2px;
    box-shadow: none;
  }

  .runtime-list-summary {
    flex-wrap: wrap;
    font-variant-numeric: tabular-nums;
  }

  .runtime-empty-state {
    padding: 48px var(--opl-space-4);
    text-align: center;
    color: var(--opl-muted);
  }

  .runtime-empty-state h3 {
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
  }

  .runtime-empty-state p {
    margin: var(--opl-space-2) 0 var(--opl-space-4);
  }

  .runtime-empty-state > button {
    margin-top: var(--opl-space-4);
  }

  .runtime-empty-state > div:not(.runtime-loading-placeholder) {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--opl-space-2);
  }

  .runtime-loading-placeholder {
    display: grid;
    gap: var(--opl-space-3);
    margin-top: var(--opl-space-5);
  }

  .runtime-loading-placeholder span {
    height: var(--opl-control-md);
    background: var(--opl-surface-secondary);
    border-radius: var(--opl-radius-control);
  }

  @container runtime-page (max-width: 640px) {
    .runtime-service-notice {
      flex-wrap: wrap;
    }
    .runtime-service-notice > div {
      flex-basis: calc(100% - 32px);
    }
    .runtime-service-notice > button {
      margin-left: 30px;
    }
    .runtime-scope-band {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .runtime-scope-band > strong {
      grid-column: 1 / -1;
    }
    .runtime-list-heading {
      flex-wrap: wrap;
    }
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
    margin-top: var(--opl-space-3);
    border-top: 1px solid var(--opl-border);
  }

  .runtime-work-row {
    min-width: 0;
    position: relative;
    display: grid;
    grid-template-columns: minmax(190px, 1.15fr) minmax(92px, .55fr) minmax(260px, 1.5fr) minmax(150px, .8fr);
    align-items: center;
    gap: var(--opl-space-4);
    padding: var(--opl-space-5) var(--opl-space-2);
    border-bottom: 1px solid var(--opl-border);
    background: var(--opl-canvas);
  }

  .runtime-work-row:hover {
    background: var(--opl-hover);
  }

  .runtime-work-row[data-selected="true"] {
    background: var(--opl-selected);
  }

  .opl-runtime-overview .runtime-thread-links button {
    margin: var(--opl-space-2) var(--opl-space-2) 0 0;
    min-height: var(--opl-control-sm);
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    color: var(--opl-text);
    background: var(--opl-canvas);
  }

  @container runtime-page (max-width: 1040px) {
    .runtime-work-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    .runtime-work-status {
      justify-self: end;
    }
    .runtime-stage-popover {
      right: var(--opl-space-3);
    }
  }

  @container runtime-page (max-width: 600px) {
    .runtime-work-row {
      grid-template-columns: minmax(0, 1fr);
    }
    .runtime-work-status {
      justify-self: start;
    }
    .runtime-overview-header > div > svg {
      display: none;
    }
    .runtime-overview-header .runtime-refresh-button {
      flex-shrink: 0;
    }
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
    color: var(--opl-text);
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

`;

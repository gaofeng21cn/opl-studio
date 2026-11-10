export const codexWorkbenchStyleApplicationManagement = `  .opl-app-management {
    min-width: 0;
    min-height: 100%;
    overflow-y: auto;
    padding: 28px clamp(24px, 4vw, 48px) 48px;
    background: var(--opl-canvas);
    color: var(--opl-text);
  }

  .opl-app-management-header,
  .opl-app-management-title,
  .opl-app-management-environment,
  .opl-app-management-summary,
  .opl-app-management-tabs,
  .opl-app-management-resources .runtime-setting-control {
    display: flex;
    align-items: center;
  }

  .opl-app-management-header {
    width: min(100%, 960px);
    justify-content: space-between;
    gap: 24px;
    margin: 0 auto;
  }

  .opl-app-management-title {
    gap: 9px;
  }

  .opl-app-management-title svg {
    color: var(--opl-muted);
  }

  .opl-app-management-title h1 {
    margin: 0;
    font-size: var(--opl-text-xl);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .opl-app-management-header > div:first-child > p {
    max-width: 680px;
    margin: 8px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .opl-app-management-environment {
    flex: 0 0 auto;
    gap: 8px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    white-space: nowrap;
  }

  .opl-app-management-environment > span {
    color: var(--opl-faint);
  }

  .opl-app-management-environment strong {
    color: var(--opl-text);
    font-weight: var(--opl-weight-medium);
  }

  .opl-app-management-environment .settings-icon-button {
    margin-left: 4px;
  }

  .opl-app-management-summary,
  .opl-app-management-tabs,
  .opl-app-management-content {
    width: min(100%, 960px);
    margin-right: auto;
    margin-left: auto;
  }

  .opl-app-management-summary {
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 24px;
    padding: 12px 0;
    border-block: 1px solid var(--opl-border);
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .opl-app-management-summary > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .opl-app-management-summary strong {
    color: var(--opl-text);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-app-management-summary .attention {
    color: var(--opl-warning);
  }

  .opl-app-management-feedback,
  .opl-app-management-receipt {
    width: min(100%, 960px);
    margin: 12px auto 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .opl-app-management-feedback {
    padding: 8px 0;
  }

  .opl-app-management-feedback[data-tone="success"] {
    color: var(--opl-success);
  }

  .opl-app-management-feedback[data-tone="attention"] {
    color: var(--opl-warning);
  }

  .opl-app-management-receipt {
    padding: 10px 0;
    border-block: 1px solid var(--opl-border);
  }

  .opl-app-management-receipt summary {
    cursor: pointer;
    color: var(--opl-text);
  }

  .opl-app-management-receipt p {
    margin: 6px 0 0;
  }

  .opl-app-management-receipt small {
    display: block;
    margin-top: 6px;
    color: var(--opl-faint);
  }

  .opl-app-management-tabs {
    gap: 4px;
    margin-top: 20px;
    border-bottom: 1px solid var(--opl-border);
  }

  .opl-app-management-tabs button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .opl-app-management-tabs button:hover {
    color: var(--opl-text);
    background: var(--opl-hover);
  }

  .opl-app-management-tabs button[aria-selected="true"] {
    border-bottom-color: var(--opl-text);
    color: var(--opl-text);
  }

  .opl-app-management-tabs button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--opl-text) 38%, transparent);
    outline-offset: -2px;
  }

  .opl-app-management-content {
    padding-top: 20px;
  }

  .opl-app-management-content > section > .settings-page,
  .opl-app-management-content > section > .settings-page-summary,
  .opl-app-management-content > section > .settings-group {
    width: 100%;
  }

  .opl-app-management-content > section > .settings-page {
    padding: 0;
  }

  .opl-app-management-content > section > .settings-page .settings-page-summary {
    margin-top: 0;
  }

  .opl-app-management .agent-catalog-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin: 0 0 14px;
  }

  .opl-app-management .agent-catalog-heading h2 {
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-lg);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .opl-app-management .agent-catalog-heading p {
    max-width: 680px;
    margin: 5px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
  }

  .opl-app-management .agent-catalog-source {
    flex: 0 0 auto;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    white-space: nowrap;
  }

  .opl-app-management .agent-catalog-inventory {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin: 0 0 16px;
    padding: 10px 0;
    border-block: 1px solid var(--opl-border);
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .opl-app-management .agent-catalog-inventory span {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
  }

  .opl-app-management .agent-catalog-inventory strong {
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
    font-variant-numeric: tabular-nums;
  }

  .opl-app-management .agent-catalog-inventory .has-update {
    color: var(--opl-warning);
  }

  .opl-app-management .agent-catalog-inventory .has-update strong {
    color: var(--opl-warning);
  }

  .opl-app-management-resources {
    min-width: 0;
  }

  .opl-app-management-resources .settings-group + .settings-group {
    margin-top: 28px;
  }

  .opl-app-management-resources .settings-inline-note {
    margin: 0 0 8px;
  }

  .opl-app-management-resources .runtime-setting-control {
    flex-wrap: wrap;
  }

  .opl-app-management-resource-details {
    flex-basis: 100%;
    min-width: 220px;
    margin-top: 2px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    text-align: left;
  }

  .opl-app-management-resource-details summary {
    width: fit-content;
    cursor: pointer;
    color: var(--opl-muted);
  }

  .opl-app-management-resource-details summary:hover {
    color: var(--opl-text);
  }

  .opl-app-management-resource-details dl {
    display: grid;
    gap: 4px;
    margin: 8px 0 0;
  }

  .opl-app-management-resource-details dl > div {
    display: grid;
    grid-template-columns: minmax(110px, 0.7fr) minmax(0, 1.3fr);
    gap: 10px;
  }

  .opl-app-management-resource-details dt {
    color: var(--opl-faint);
  }

  .opl-app-management-resource-details dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--opl-muted);
  }

  @media (max-width: 680px) {
    .opl-app-management {
      padding-right: 16px;
      padding-left: 16px;
    }

    .opl-app-management-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }

    .opl-app-management-environment {
      width: 100%;
      justify-content: flex-end;
    }

    .opl-app-management-tabs {
      overflow-x: auto;
    }

    .opl-app-management-tabs button {
      flex: 0 0 auto;
    }

    .opl-app-management .agent-catalog-heading {
      flex-direction: column;
      gap: 5px;
    }

    .opl-app-management .agent-catalog-source {
      white-space: normal;
    }
  }
`;

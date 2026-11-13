export const codexWorkbenchStyleContributions = `  .opl-contribution-slot {
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

  /* Contributions are declarative App-owned content, so their internal
     headings must stay inside the Studio typography boundary instead of
     inheriting browser defaults (for example h3 = 1.17em / 700). */
  .opl-contribution :where(h1, h2, h3, h4, h5, h6) {
    margin: 8px 0 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .opl-contribution :where(p) {
    margin: 0;
    font-size: var(--opl-text-body);
    line-height: var(--opl-leading-normal);
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

`;

export const codexWorkbenchStyleApplicationManagement = `  .opl-app-management {
    min-width: 0;
    min-height: 100%;
    padding: 0;
  }

  .opl-app-management-header,
  .opl-app-management-title,
  .opl-app-management-environment,
  .opl-app-management-summary,
  .opl-app-management-resources .runtime-setting-control {
    display: flex;
    align-items: center;
  }

  .opl-app-management-status {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .opl-app-management-overview {
    width: min(100%, 960px);
    margin-inline: auto;
  }

  .opl-app-management-overview .opl-app-management-summary {
    width: 100%;
  }

  .opl-app-management-status .opl-app-management-summary { margin: 0; box-sizing: border-box; }

  .opl-app-management-summary > span { min-width: 0; white-space: normal; overflow-wrap: anywhere; }

  .opl-dsh-plugin-manager {
    min-width: 0;
    height: 100%;
  }

  .opl-dsh-plugin-manager [data-plugin-owner-package] span:has(> .opl-catalog-summary) { display: block; -webkit-line-clamp: unset; overflow: visible; }
  .opl-dsh-plugin-manager [data-plugin-owner-detail] .opl-catalog-id,
  .opl-dsh-plugin-manager [data-plugin-owner-detail] .opl-catalog-summary > .software-catalog-versions { display: none; }
  .opl-dsh-owner-section > button + h4 { margin-top: 24px; }
  .opl-dsh-owner-section .agent-package-row { background: transparent; border-radius: 0; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l3); }
  .opl-catalog-summary { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .opl-catalog-id { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
  .opl-catalog-id > span { margin-right: 4px; }
  .opl-catalog-id code { font-size: inherit; font-variant-numeric: tabular-nums; }
  .opl-catalog-description { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
  .opl-catalog-summary .software-catalog-versions { display: flex; flex-wrap: wrap; gap: 6px 20px; padding: 3px 0 0; font-size: 12px; line-height: 18px; }
  .opl-catalog-summary .software-catalog-versions > span { display: inline-flex; gap: 7px; align-items: baseline; }
  .opl-catalog-summary .software-catalog-versions strong { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
  .opl-catalog-summary .software-catalog-versions strong[data-unknown] { font-weight: 400; color: var(--dsw-alias-label-secondary); }

  .opl-dsh-owner-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .opl-dsh-owner-filters > :first-child { flex: 1 1 280px; min-width: 160px; }
  .opl-dsh-owner-filters input { width: 100%; }
  .opl-dsh-owner-filters input::placeholder { color: var(--dsw-alias-label-secondary); opacity: 1; }
  .opl-dsh-owner-filters select { min-height: 32px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 4px 8px; }
  .opl-dsh-owner-section { min-width: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
  .opl-software-installation { padding: 16px 0; border-top: 1px solid var(--dsw-alias-border-l3); }
  .opl-software-installation-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .opl-software-installation-heading strong { color: var(--dsw-alias-label-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
  .opl-software-installation-heading > span:last-child { margin-left: auto; }
  .opl-software-installation-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .opl-software-installation code { white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  .opl-dsh-owner-section h4 { margin: 0 0 12px; font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
  .opl-dsh-owner-section p { margin: 0 0 12px; }
  .opl-dsh-owner-section dl { display: grid; gap: 10px; margin: 0 0 16px; }
  .opl-dsh-owner-section dl > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; }
  .opl-dsh-owner-section dt { color: var(--dsw-alias-label-tertiary); }
  .opl-dsh-owner-section dd { margin: 0; overflow-wrap: anywhere; }
  .opl-dsh-owner-shortcut { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 8px; }

  @media (max-width: 680px) {
    .opl-dsh-plugin-manager .page { --plugin-page-inset: 16px; }
    .opl-dsh-plugin-manager .pageBody { width: 100%; margin-inline: 0; padding-inline: 0; }
    .opl-dsh-owner-filters { width: 100%; }
    .opl-dsh-owner-filters > :first-child { flex-basis: 100%; }
    .opl-dsh-plugin-manager [data-plugin-owner-package] > div { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px 12px; align-items: start; padding-block: 14px; }
    .opl-dsh-plugin-manager [data-plugin-owner-package] > div > :first-child { width: 36px; height: 36px; }
    .opl-dsh-plugin-manager [data-plugin-owner-package] > div > :last-child { grid-column: 2; justify-content: flex-start; flex-wrap: wrap; }
    .opl-dsh-plugin-manager [data-plugin-owner-package] button[aria-describedby] { white-space: normal; text-overflow: clip; overflow-wrap: anywhere; }
    .opl-catalog-summary .software-catalog-versions { gap: 4px 16px; }
    .opl-dsh-owner-section dl > div { grid-template-columns: 90px minmax(0, 1fr); }
    .opl-dsh-owner-filters .segmented-control { flex: 1 1 auto; }
    .opl-dsh-owner-filters select { flex: 1 1 auto; max-width: 100%; }
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

  .opl-software-sources {
    min-width: 0;
  }

  .opl-software-sources-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin: 0 0 16px;
  }

  .opl-software-sources-heading h2,
  .opl-software-sources-empty h3 {
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-lg);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .opl-software-sources-heading p,
  .opl-software-sources-empty p,
  .opl-software-sources-note {
    max-width: 680px;
    margin: 6px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
  }

  .opl-software-source-list {
    display: grid;
    gap: 12px;
  }

  .opl-software-source {
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid var(--opl-border);
    background: var(--opl-surface);
  }

  .opl-software-source[aria-busy="true"] {
    opacity: .72;
  }

  .opl-software-source-heading,
  .opl-software-source-footer,
  .opl-software-source-actions,
  .opl-software-source-meta {
    display: flex;
    align-items: center;
  }

  .opl-software-source-heading {
    justify-content: space-between;
    gap: 16px;
  }

  .opl-software-source-heading h3 {
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-software-source-meta {
    flex-wrap: wrap;
    gap: 5px 12px;
    margin-top: 4px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .opl-software-source-description {
    max-width: 720px;
    margin: 10px 0 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
  }

  .opl-software-source-location {
    min-width: 0;
    margin-top: 7px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .opl-software-source-location a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 100%;
    color: var(--opl-muted);
  }

  .opl-software-source-location a span,
  .opl-software-source-location code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opl-software-source-footer {
    justify-content: space-between;
    gap: 16px;
    margin-top: 12px;
  }

  .opl-software-source-checked {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .opl-software-source-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .opl-software-source-advanced {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--opl-border);
  }

  .opl-software-source-form {
    max-width: 620px;
    margin-top: 8px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .opl-software-source-form label {
    display: block;
    color: var(--opl-text);
    font-weight: var(--opl-weight-medium);
  }

  .opl-software-source-form p {
    margin: 4px 0 8px;
    line-height: var(--opl-leading-relaxed);
  }

  .opl-software-source-form > div {
    display: flex;
    gap: 8px;
  }

  .opl-software-source-form select {
    min-width: 0;
    flex: 1;
    padding: 7px 9px;
    border: 1px solid var(--opl-border);
    background: var(--opl-canvas);
    color: var(--opl-text);
    font: inherit;
  }

  .opl-software-source-form select:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--opl-text) 38%, transparent);
    outline-offset: 1px;
  }

  .opl-software-source-error {
    color: var(--opl-warning);
  }

  .opl-software-sources-empty {
    padding: 20px 0;
  }

  .opl-software-sources-note {
    margin-top: 14px;
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

  .opl-app-management-state { width: min(100%, 960px); margin: 12px auto 0; padding: 12px 0; color: var(--opl-muted); font-size: var(--opl-text-sm); line-height: var(--opl-leading-relaxed); }
  .opl-app-management-state[data-tone="attention"] { color: var(--opl-warning); }
  .opl-app-management-state p { margin: 0 0 8px; overflow-wrap: anywhere; }
  .opl-app-management-state details { margin-top: 8px; }
  .opl-app-management-state summary, .opl-resource-details summary { cursor: pointer; }
  .opl-resource-intro { margin: 0 0 24px; max-width: 72ch; color: var(--opl-muted); font-size: var(--opl-text-sm); line-height: var(--opl-leading-relaxed); }
  .opl-resource-section { margin: 30px 0; }
  .opl-resource-section-heading h2 { margin: 0; font-size: var(--opl-text-lg); font-weight: var(--opl-weight-semibold); }
  .opl-resource-section-heading p, .opl-resource-group-heading p { margin: 5px 0 12px; max-width: 72ch; color: var(--opl-muted); font-size: var(--opl-text-sm); line-height: var(--opl-leading-relaxed); }
  .opl-resource-section > .settings-group { margin-top: 18px; }
  .opl-resource-group-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .opl-resource-group-heading > p { flex: 1; }
  .opl-resource-group-heading > .runtime-setting-control { flex: 0 0 auto; }
  .opl-shared-resource-list { min-width: 0; }
  .opl-shared-resource-row { padding: 16px 0; border-top: 1px solid var(--opl-border); }
  .opl-shared-resource-heading, .opl-shared-resource-footer { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .opl-shared-resource-heading > div { min-width: 0; }
  .opl-shared-resource-heading h3 { margin: 0; font-size: var(--opl-text-sm); font-weight: var(--opl-weight-semibold); overflow-wrap: anywhere; }
  .opl-shared-resource-heading p { margin: 5px 0 0; color: var(--opl-muted); font-size: var(--opl-text-xs); line-height: var(--opl-leading-relaxed); overflow-wrap: anywhere; }
  .opl-shared-resource-footer { margin-top: 12px; align-items: center; }
  .opl-shared-resource-footer > span { color: var(--opl-muted); font-size: var(--opl-text-xs); }
  .opl-resource-details { margin-top: 12px; color: var(--opl-muted); font-size: var(--opl-text-xs); }
  .opl-resource-details summary { width: fit-content; }
  .opl-resource-details dl { display: grid; gap: 6px; margin: 10px 0; }
  .opl-resource-details dl > div { display: grid; grid-template-columns: minmax(100px, .4fr) minmax(0, 1fr); gap: 12px; }
  .opl-resource-details dd { margin: 0; overflow-wrap: anywhere; }
  .opl-resource-form { margin: 18px 0 8px; padding-top: 20px; border-top: 1px solid var(--opl-border); max-width: 720px; color: var(--opl-text); font-size: var(--opl-text-sm); }
  .opl-resource-form-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
  .opl-resource-form h3 { margin: 0; font-size: var(--opl-text-sm); font-weight: var(--opl-weight-semibold); }
  .opl-resource-form > label, .opl-resource-form .opl-resource-details > label { display: grid; gap: 7px; margin: 14px 0; }
  .opl-resource-form input:not([type="checkbox"]), .opl-resource-form select { min-width: 0; width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--opl-border); border-radius: 6px; background: var(--opl-canvas); color: var(--opl-text); font: inherit; }
  .opl-resource-form input::placeholder { color: var(--opl-muted); }
  .opl-resource-form :is(input, select, button, summary):focus-visible, .opl-resource-details summary:focus-visible { outline: 2px solid color-mix(in srgb, var(--opl-text) 55%, transparent); outline-offset: 2px; }
  .opl-resource-form input[type="checkbox"] { accent-color: var(--opl-text); width: 16px; height: 16px; }
  .opl-resource-form fieldset { min-width: 0; margin: 22px 0 0; padding: 0; border: 0; }
  .opl-resource-form legend { padding: 0; font-weight: var(--opl-weight-medium); }
  .opl-resource-form fieldset > p { margin: 6px 0 12px; color: var(--opl-muted); line-height: var(--opl-leading-relaxed); }
  .opl-resource-consumers > div { display: flex; justify-content: space-between; align-items: center; gap: 18px; min-height: 40px; border-bottom: 1px solid var(--opl-border); }
  .opl-resource-consumers label { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .opl-resource-consumers label:first-child { flex: 1; }
  .opl-resource-consumers label > span { overflow-wrap: anywhere; }
  .opl-resource-consumers label:last-child { color: var(--opl-muted); font-size: var(--opl-text-xs); flex: 0 0 auto; }
  .opl-resource-form-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
  .opl-resource-form-error { color: var(--opl-warning); line-height: var(--opl-leading-relaxed); }
  @media (max-width: 680px) {
    .opl-resource-group-heading, .opl-shared-resource-footer { flex-direction: column; gap: 10px; align-items: flex-start; }
    .opl-resource-group-heading > p { margin-bottom: 0; }
    .opl-resource-group-heading { margin-bottom: 16px; }
    .opl-resource-form-actions { justify-content: flex-start; }
    .opl-app-management-resources .runtime-setting-control { justify-content: flex-start; }
  }

  @media (max-width: 680px) {
    .opl-app-management {
      padding: 0;
    }

    .opl-app-management-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }

    .opl-app-management-environment {
      width: 100%;
      justify-content: flex-start;
    }

    .opl-app-management-status .opl-app-management-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
    .opl-app-management-status .opl-app-management-summary > span { min-width: 0; }
    .opl-dsh-owner-filters { align-items: stretch; }
    .opl-dsh-owner-filters > input { flex-basis: 100%; min-width: 0; }
    .opl-dsh-owner-filters select { max-width: 100%; }

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

    .opl-software-sources-heading,
    .opl-software-source-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .opl-software-source-actions {
      justify-content: flex-start;
    }
  }
  @media (max-width: 480px) {
    .opl-app-management-tabs button { flex: 1 0 auto; padding-inline: 8px; }
    .opl-app-management-tabs button svg { display: none; }
  }

  .opl-catalog-controls { display: grid; gap: 16px; }
  .opl-catalog-scope { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 20px; }
  .opl-catalog-scope-options { display: flex; gap: 2px; padding: 4px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-interactive-bg-hover); }
  .opl-catalog-scope-options button { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
  .opl-catalog-scope-options button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l3); color: var(--dsw-alias-label-primary); }
  .opl-catalog-scope p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 18px; }
  .opl-catalog-external-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
  .opl-catalog-external-status > span { flex: 1; }
  .opl-catalog-row-facts { flex-basis: 100%; display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
  .opl-catalog-cell-version { white-space: nowrap; }
  .opl-catalog-cell-version::before { content: attr(data-label) " "; color: var(--dsw-alias-label-tertiary); }
  .opl-catalog-state { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
  .opl-catalog-row-actions { display: inline-flex; align-items: center; }
  .opl-software-center:has([data-plugin-owner-detail]) .opl-catalog-controls { display: none; }
  .opl-software-source-group + .opl-software-source-group { margin-top: 32px; }
  .opl-software-source-group-heading { margin-bottom: 16px; }
  .opl-software-source-group-heading h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
  .opl-software-source-group-heading p { max-width: 72ch; margin: 7px 0 0; font-size: 13px; line-height: 21px; color: var(--dsw-alias-label-secondary); }
  .opl-package-updates { margin-top: 28px; }
  .opl-package-updates h2 { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
  .opl-package-updates > p { margin: 0 0 16px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
  .opl-package-update-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; padding: 14px 0; border-top: 1px solid var(--dsw-alias-border-l3); font-size: 13px; }
  .opl-package-update-row > div { display: grid; gap: 5px; flex: 1; min-width: 180px; }
  .opl-package-update-row > div > span { color: var(--dsw-alias-label-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
  .opl-update-owner-note { max-width: 30ch; color: var(--dsw-alias-label-secondary); font-size: 12px; }
  @media (max-width: 680px) {
    .opl-catalog-scope { align-items: flex-start; }
    .opl-dsh-owner-filters { gap: 8px; }
    .opl-dsh-owner-filters > select { flex: 1; min-width: 0; }
    .opl-catalog-external-status > span { flex-basis: 100%; }
  }

`;

export const codexWorkbenchStyleSettingsCapabilities = `  .settings-capability-directory {
    min-width: 0;
    display: grid;
    gap: 22px;
  }

  .settings-capability-toolbar,
  .settings-capability-summary,
  .settings-instruction-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-capability-summary {
    margin-top: -12px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .settings-inline-notice {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid var(--opl-border);
    border-bottom: 1px solid var(--opl-border);
    color: var(--opl-muted);
  }

  .settings-access-change {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }

  .settings-capability-group {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .settings-capability-group > h2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-capability-group > h2 span {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-regular);
  }

  .settings-capability-list {
    border-top: 1px solid var(--opl-border);
  }

  .settings-capability-row,
  .settings-instruction-source {
    border-bottom: 1px solid var(--opl-border);
  }

  .settings-capability-row > summary,
  .settings-instruction-source > summary {
    min-height: 60px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--opl-space-4);
    padding: 8px 0;
    list-style: none;
    cursor: pointer;
  }

  .settings-capability-row > summary::-webkit-details-marker,
  .settings-instruction-source > summary::-webkit-details-marker {
    display: none;
  }

  .settings-capability-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
    text-align: left;
  }

  .settings-capability-copy strong {
    overflow: hidden;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-capability-copy small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .settings-capability-state {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .settings-capability-state > svg {
    color: var(--opl-faint);
    transition: transform 140ms ease;
  }

  .settings-capability-row[open] .settings-capability-state > svg,
  .settings-instruction-source[open] .settings-capability-state > svg {
    transform: rotate(180deg);
  }

  .settings-capability-details,
  .settings-instruction-content {
    display: grid;
    gap: 8px;
    padding: 0 0 14px;
    color: var(--opl-muted);
    text-align: left;
  }

  .settings-capability-details small {
    color: var(--opl-faint);
  }

  .settings-instruction-toolbar small {
    min-width: 0;
    overflow: hidden;
    color: var(--opl-faint);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-instruction-content pre {
    max-height: 320px;
    overflow: auto;
    margin: 0;
    padding: 12px 0 0;
    border-top: 1px solid var(--opl-border);
    color: var(--opl-muted);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .settings-editor-block {
    min-width: 0;
    display: grid;
    gap: 12px;
    padding: 5px 0 13px;
  }

  .settings-editor-heading,
  .settings-editor-footer,
  .settings-default-row {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .settings-editor-heading > span,
  .settings-default-row > span,
  .settings-editor-label {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .settings-editor-heading strong,
  .settings-default-row strong {
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .settings-editor-heading small,
  .settings-editor-footer small,
  .settings-default-row small,
  .settings-editor-label > span {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
  }

  .settings-editor-block textarea {
    width: 100%;
    min-height: 168px;
    resize: vertical;
    padding: 11px 12px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    outline: 0;
    background: var(--opl-canvas);
    color: var(--opl-text);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .settings-editor-block textarea:focus {
    border-color: color-mix(in srgb, var(--opl-text) 45%, var(--opl-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--opl-text) 8%, transparent);
  }

  .settings-editor-footer > small {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .settings-default-row {
    padding-top: 11px;
    border-top: 1px solid var(--opl-border);
  }

  .settings-default-preview {
    border-top: 1px solid var(--opl-border);
    padding-top: 10px;
  }

  .settings-default-preview > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    list-style: none;
    cursor: pointer;
  }

  .settings-default-preview > summary::-webkit-details-marker {
    display: none;
  }

  .settings-default-preview > summary svg {
    flex: 0 0 auto;
    color: var(--opl-faint);
    transition: transform 140ms ease;
  }

  .settings-default-preview[open] > summary svg {
    transform: rotate(180deg);
  }

  .settings-default-preview > pre {
    max-height: 260px;
    overflow: auto;
    margin: 10px 0 0;
    padding: 11px 12px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    background: var(--opl-hover);
    color: var(--opl-muted);
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-relaxed);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .opl-first-run-surface {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: auto;
    background: var(--opl-canvas);
  }

  .opl-first-run {
    box-sizing: border-box;
    width: min(680px, 100%);
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 28px;
    padding: 32px 0;
    color: var(--opl-text);
  }

  .opl-first-run > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 18px;
  }

  .opl-first-run:focus {
    outline: none;
  }

  .opl-first-run-mark {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--opl-border-strong);
    border-radius: 6px;
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-first-run header p,
  .opl-first-run header h1,
  .opl-first-run header span {
    margin: 0;
  }

  .opl-first-run header p {
    margin-bottom: 5px;
    color: var(--opl-faint);
    font-size: var(--opl-text-sm);
  }

  .opl-first-run header h1 {
    font-size: var(--opl-text-2xl);
    font-weight: var(--opl-weight-semibold);
    letter-spacing: 0;
  }

  .opl-first-run header div > span {
    display: block;
    margin-top: 9px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .opl-first-run-checklist {
    border-top: 1px solid var(--opl-border);
  }

  .opl-first-run-checklist > div {
    min-height: 66px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--opl-border);
    color: var(--opl-warning);
  }

  .opl-first-run-checklist > div[data-ready="true"] {
    color: var(--opl-success);
  }

  .opl-first-run-checklist span {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .opl-first-run-checklist strong {
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .opl-first-run-checklist small {
    color: var(--opl-muted);
    line-height: var(--opl-leading-normal);
  }

  .opl-first-run > footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .opl-first-run-error {
    margin: -12px 0 0;
    color: var(--opl-danger);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .agent-catalog,
  .agent-catalog-group,
  .agent-package-list {
    min-width: 0;
    display: grid;
  }

  .agent-catalog {
    gap: 16px;
  }

  .agent-catalog-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-inline-note {
    margin-top: -10px;
    padding: 8px 10px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  .settings-search-field {
    width: min(100%, 360px);
    min-height: var(--opl-control-md);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    background: var(--opl-canvas);
    color: var(--opl-faint);
  }

  .settings-search-field:focus-within {
    border-color: color-mix(in srgb, var(--opl-text) 34%, var(--opl-border));
  }

  .settings-search-field input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--opl-text);
    font: inherit;
  }

  .agent-catalog-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .agent-catalog-filters select {
    min-height: 29px;
    padding: 0 8px;
    border: 1px solid var(--opl-border);
    border-radius: 6px;
    background: var(--opl-canvas);
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .agent-catalog-filters > span {
    margin-left: auto;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .agent-catalog-group {
    gap: 7px;
  }

  .agent-catalog-group > h2 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--opl-text);
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .agent-catalog-group > h2 span {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    font-weight: var(--opl-weight-medium);
  }

  .agent-package-list {
    border-top: 1px solid var(--opl-border);
  }

  .agent-package-row {
    border-bottom: 1px solid var(--opl-border);
  }

  .agent-package-row > summary {
    min-height: 76px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 11px 0;
    cursor: default;
    list-style: none;
  }

  .agent-package-row > summary::-webkit-details-marker {
    display: none;
  }

  .agent-package-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .agent-package-copy > strong {
    color: var(--opl-text);
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-normal);
    overflow-wrap: anywhere;
  }

  .agent-package-copy > small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .agent-package-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .agent-package-summary-actions,
  .runtime-setting-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .agent-package-app-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    white-space: nowrap;
  }

  .agent-catalog > .settings-inline-note,
  .settings-page .agent-catalog-recovery {
    margin: 0;
  }

  .agent-package-chevron {
    color: var(--opl-faint);
    transition: transform 140ms ease;
  }

  .agent-package-row[open] .agent-package-chevron,
  .settings-advanced-actions[open] > summary svg,
  .agent-technical-details[open] > summary svg {
    transform: rotate(180deg);
  }

  .agent-package-details {
    display: grid;
    gap: 13px;
    padding: 2px 0 16px;
  }

  .agent-package-row.software-catalog-row > summary {
    grid-template-columns: minmax(0, 1fr) minmax(145px, 180px) minmax(115px, auto);
    gap: 24px;
    min-height: 118px;
    padding: 18px 12px;
    margin-inline: -12px;
    cursor: pointer;
    border-radius: var(--opl-radius-control);
  }

  .agent-package-row.software-catalog-row > summary:hover {
    background: var(--opl-hover);
  }

  .agent-package-row.software-catalog-row > summary:focus-visible {
    outline: 2px solid var(--opl-accent);
    outline-offset: 2px;
  }

  .software-catalog-row .agent-package-copy {
    gap: 5px;
  }

  .software-catalog-title {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }

  .software-catalog-channel {
    padding: 2px 6px;
    border: 1px solid var(--opl-border);
    border-radius: var(--opl-radius-control);
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    line-height: var(--opl-leading-normal);
    white-space: nowrap;
  }

  .software-catalog-identity {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 7px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .software-catalog-identity code {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .software-catalog-kind::before {
    content: "·";
    margin-right: 7px;
  }

  .software-catalog-description {
    max-width: 70ch;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .software-catalog-publisher {
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .software-catalog-versions {
    min-width: 0;
    display: grid;
    gap: 7px;
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
    font-variant-numeric: tabular-nums;
  }

  .software-catalog-versions > span {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 3px 8px;
  }

  .software-catalog-versions > span > span {
    flex: 0 0 4em;
  }

  .software-catalog-versions strong {
    min-width: 0;
    color: var(--opl-text);
    font-weight: var(--opl-weight-medium);
    overflow-wrap: anywhere;
  }

  .software-catalog-versions strong[data-unknown="true"] {
    color: var(--opl-muted);
    font-weight: var(--opl-weight-regular);
  }

  .software-catalog-row .agent-package-summary-actions {
    flex-wrap: wrap;
    max-width: 180px;
    row-gap: 10px;
  }

  .software-catalog-update {
    margin: 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .software-catalog-row .agent-package-details {
    padding: 0 0 20px;
  }

  @media (max-width: 900px) {
    .agent-package-row.software-catalog-row > summary {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px 18px;
    }

    .software-catalog-row .agent-package-copy { grid-column: 1; }
    .software-catalog-row .agent-package-summary-actions { grid-column: 2; grid-row: 1 / 3; }
    .software-catalog-versions { grid-column: 1; display: flex; flex-wrap: wrap; gap: 6px 18px; }
    .software-catalog-versions > span > span { flex-basis: auto; }
  }

  @media (max-width: 760px) {
    .agent-catalog .agent-catalog-toolbar .settings-search-field { flex: 0 0 auto; min-height: 40px; }
  }

  @media (max-width: 560px) {
    .agent-package-row.software-catalog-row > summary { display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding-block: 18px; }
    .software-catalog-versions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .software-catalog-versions > span { display: grid; gap: 4px; }
    .software-catalog-row .agent-package-summary-actions { max-width: none; justify-content: flex-end; }
    .software-catalog-row .agent-package-summary-actions > .settings-status { margin-right: auto; }
    .software-catalog-row .agent-package-summary-actions .settings-action-button { min-height: 36px; }
  }

  .agent-package-details > dl,
  .agent-technical-details dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  .agent-package-details > .agent-state-axis-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .agent-package-details dl div,
  .agent-technical-details dl div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .agent-package-details dt,
  .agent-technical-details dt {
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
  }

  .agent-package-details dd,
  .agent-technical-details dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .agent-package-actions,
  .settings-advanced-actions > div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .home-shortcut-preferences {
    display: grid;
    gap: 7px;
  }

  .home-shortcut-preference {
    min-height: 48px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    border: 1px solid var(--opl-border);
    border-radius: 7px;
  }

  .home-shortcut-preference > label,
  .home-shortcut-order-actions {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .home-shortcut-preference > label {
    min-width: 0;
    align-items: flex-start;
  }

  .home-shortcut-copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .home-shortcut-copy strong {
    color: var(--opl-text);
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-semibold);
  }

  .home-shortcut-preference input {
    accent-color: var(--opl-text);
  }

  .home-shortcut-id {
    min-width: 0;
    overflow: hidden;
    color: var(--opl-faint);
    font-size: var(--opl-text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-shortcut-order-actions button {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--opl-muted);
  }

  .home-shortcut-order-actions button:hover:not(:disabled) {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .home-shortcut-order-actions button:disabled {
    opacity: 0.35;
  }

`;

export const codexWorkbenchStyleSettingsIntegration = `  /* OPL navigation content inside the unchanged DSH settings shell. */
  [data-shortcut-modal="settings"][role="dialog"] > nav + div > div:last-child { padding: 0 0 24px; }
  [data-shortcut-modal="settings"][role="dialog"] > nav button > svg { display: none; }
  [data-shortcut-modal="settings"][role="dialog"] > nav button { min-height: 40px; height: auto; }
  .settings-state-notice { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding: 14px 16px; background: var(--opl-hover); border: 1px solid var(--opl-border); border-radius: 10px; color: var(--opl-muted); }
  .settings-state-notice > svg { flex: none; }
  .settings-state-notice > span { flex: 1; }
  .settings-state-notice > button { flex: none; border: 1px solid var(--opl-border); border-radius: 6px; padding: 6px 12px; color: var(--opl-text); background: var(--opl-canvas); }
  .opl-settings-nav-label { display: flex; align-items: center; gap: 10px; white-space: normal; line-height: 20px; }
  .opl-settings-nav-label > svg { flex: none; }
  .settings-appearance button { flex: 1 1 0; min-width: 0; padding: 14px 8px; border-radius: 8px; }
  .settings-font-size [class*="arrows_"] { opacity: 1; }
  .settings-font-size [class*="stepper_"] { min-width: 88px; padding-right: 20px; }
  .settings-detail-header, .settings-content { padding-left: 24px; padding-right: 24px; }
  .settings-detail-title-row { flex-wrap: nowrap; align-items: center; }
  .settings-subnav { flex-wrap: wrap; }
  .settings-subnav button { white-space: nowrap; }
  .settings-subnav button[aria-current="page"] { color: var(--opl-text); background: var(--opl-hover); border-color: transparent; }
  .agent-catalog-toolbar { flex-wrap: wrap; }
  .agent-catalog-toolbar .settings-search-field { flex: 1 1 190px; width: auto; }
  .segmented-control { flex-shrink: 0; max-width: 100%; }
  .segmented-control button { white-space: nowrap; flex-shrink: 0; }
  .workspace-file-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 10px; }
  .workspace-file-selection { display: flex; flex-wrap: wrap; gap: 8px; overflow-wrap: anywhere; }
  .workspace-file-status { color: var(--opl-muted); overflow-wrap: anywhere; }
  .workspace-file-row.is-selected { background: var(--opl-hover); outline: 1px solid var(--opl-border); }
  .workspace-file-actions button { border: 1px solid var(--opl-border); background: var(--opl-canvas); color: var(--opl-text); border-radius: 7px; padding: 6px 9px; }
  @media (max-width: 640px) {
    [data-shortcut-modal="settings"][role="dialog"] { width: 100vw; max-width: 100vw; height: 100dvh; border-radius: 0; flex-direction: column; }
    [data-shortcut-modal="settings"][role="dialog"] > nav { width: 100%; padding: 12px 44px 8px 12px; gap: 0; }
    [data-shortcut-modal="settings"][role="dialog"] > nav > div:first-child { position: relative; width: auto; height: auto; overflow: visible; padding: 0 0 8px; }
    [data-shortcut-modal="settings"] .sss-wrap { margin-right: 34px; }
    [data-shortcut-modal="settings"] .sss-title { display: none; }
    [data-shortcut-modal="settings"][role="dialog"] > nav > div:last-child { display: flex; flex-direction: row; overflow-x: auto; gap: 4px; }
    [data-shortcut-modal="settings"][role="dialog"] > nav button { flex: none; padding: 8px 10px; height: 38px; }
    .opl-settings-nav-label > svg { display: none; }
    .opl-settings-nav-label { white-space: nowrap; }
    [data-shortcut-modal="settings"][role="dialog"] > nav + div { min-height: 0; width: 100%; }
    [data-shortcut-modal="settings"][role="dialog"] > nav + div > div:first-child { position: absolute; right: 8px; top: 14px; height: auto; padding: 0; }
    .settings-detail-header { padding-top: 12px; padding-bottom: 16px; }
    .settings-detail-header, .settings-content { padding-left: 16px; padding-right: 16px; }
    .settings-detail-title-row { gap: 12px; }

    /* DSH mounts its settings dialog through a portal, outside the local
       settings slot root. Keep the same mobile layout for that shell. */
    /* DSH renders this panel in a body portal. Its accessible name is supplied
       by aria-labelledby, so data-shortcut-modal is the stable hook. */
    [data-shortcut-modal="settings"][role="dialog"] {
      width: 100vw !important;
      max-width: none !important;
      height: 100dvh !important;
      max-height: none !important;
      margin: 0 !important;
      border-radius: 0 !important;
      flex-direction: column !important;
    }
    [data-shortcut-modal="settings"][role="dialog"] > nav {
      width: 100%;
      height: auto;
      flex: none;
      padding: 12px 44px 8px 12px;
      gap: 0;
      overflow: visible;
    }
    [data-shortcut-modal="settings"][role="dialog"] > nav > div:last-child {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
      gap: 4px;
      padding-bottom: 0;
    }
    [data-shortcut-modal="settings"][role="dialog"] > nav button {
      width: auto;
      min-width: 0;
      flex: none;
      padding: 8px 10px;
      height: 38px;
    }
    [data-shortcut-modal="settings"][role="dialog"] > div:last-child {
      width: 100%;
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }
    [data-shortcut-modal="settings"][role="dialog"] > div:last-child > * {
      min-width: 0;
    }
  }

  .feature-status-panel { margin-top: 24px; border-top: 0.5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
  .feature-status-panel header, .workspace-git-panel header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .feature-status-panel summary { cursor: pointer; padding: 12px 0; }
  .feature-status-heading { font-weight: 400; }
  .feature-status-heading small { margin-left: 12px; }
  .feature-status-content { padding-bottom: 12px; }
  .feature-status-content > header { align-items: flex-start; margin-bottom: 12px; }
  .feature-status-content > header > p { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
  .feature-status-content > header > button { flex: none; margin: 0; }
  .feature-status-row { border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
  .feature-status-row:last-child { border-bottom: 0; }
  .feature-status-row > summary strong { font-weight: 400; }
  .feature-status-row > summary span { margin-left: 12px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
  .feature-status-source { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
  .feature-status-source dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; }
  .feature-status-source dd { margin: 0; }
  .feature-status-panel p, .feature-status-panel dd { overflow-wrap: anywhere; }
  .feature-action { margin: 12px 0; }
  .feature-action label { display: block; margin: 6px 0; }
  .feature-action input { max-width: 100%; border: 1px solid #8886; padding: 6px; }
  .feature-status-panel button, .workspace-git-panel button, .runtime-thread-links button { padding: 6px 10px; border: 1px solid #8886; border-radius: 6px; margin: 4px; }
  .workspace-git-panel { min-width: 0; padding: 8px; }
  .workspace-git-panel pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; }
  .workspace-git-panel li { overflow-wrap: anywhere; }
  .feature-status-panel input { max-width: 100%; }
  .feature-status-content > input { width: 100%; padding: 8px 12px; border: 0; border-radius: 10px; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font: inherit; }
  .feature-status-panel button { border: 0; border-radius: 18px; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font: inherit; }

  /* Keep host-owned settings on the same quiet, row-based rhythm as DSH.
     These pages are projections inside the DSH modal, so they should not add
     a second card system or oversized section spacing. */
  .settings-page .settings-detail-header { display: grid; gap: 8px; padding: 20px 24px 14px; }
  .settings-page .settings-detail-title-row { flex-direction: row; align-items: center; gap: 12px; }
  .settings-page .settings-detail-header h1 { color: var(--dsw-alias-label-primary); font-size: 16px; line-height: 24px; font-weight: 500; }
  .settings-page .settings-detail-description { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }
  .settings-page .settings-subnav { gap: 4px; padding-top: 4px; }
  .settings-page .settings-subnav button { min-height: 32px; padding: 5px 12px; font-size: 14px; line-height: 22px; border-radius: var(--dsw-radius-md, 12px); }
  .settings-page .settings-capability-filters { display: flex; flex-wrap: wrap; gap: 4px; margin: 12px 0; }
  .settings-page .settings-capability-filters button { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; min-height: 32px; border: 0; border-radius: var(--dsw-radius-md, 12px); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; }
  .settings-page .settings-capability-filters button:hover { background: var(--dsw-alias-interactive-bg-hover); }
  .settings-page .settings-capability-filters button[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
  .settings-page .settings-capability-filters button > span { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
  .settings-page .settings-upstream-details { margin-top: 24px; border-top: 0.5px solid var(--dsw-alias-border-l2); padding-top: 12px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
  .settings-page .settings-upstream-details > summary, .settings-page .settings-secondary-details > summary { cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 22px; padding: 8px 0; }
  .settings-page .settings-upstream-details .settings-capability-row > summary { display: flex; justify-content: space-between; gap: 12px; }

  .settings-page .settings-content { padding: 0 24px 32px; }
  .settings-page .settings-group + .settings-group,
  .settings-page .gateway-identity + .settings-group,
  .settings-page .about-mark + .settings-group { margin-top: 20px; }
  .settings-page .settings-group h2 { margin-bottom: 4px; font-size: 14px; line-height: 22px; }
  .settings-page .settings-row { min-height: 48px; padding: 12px 0; gap: 20px; }
  .settings-page .settings-page-summary { min-height: 32px; margin-bottom: 12px; padding-bottom: 8px; }
  .settings-page .settings-subnav button { border-color: transparent; background: transparent; }
  .settings-page .settings-subnav button[aria-current="page"] { border-color: transparent; background: var(--dsw-alias-interactive-bg-active); }
  .settings-page .feature-status-panel { margin-top: 16px; }
  .settings-page .workbench-services { margin-top: 16px; }
  .settings-page .workbench-services > p { margin: 0 0 8px; color: var(--opl-muted); font-size: var(--opl-text-sm); }
  @media (max-width: 640px) {
    .settings-page .settings-detail-header,
    .settings-page .settings-content { padding-left: 16px; padding-right: 16px; }
  }

  /* DSH settings primitives apply inside the Portal and plugin contributions. */
  .settings-page .settings-issue { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: .5px solid var(--dsw-alias-border-l2); }
  .settings-page .settings-issue > svg { flex-shrink: 0; margin-top: 3px; color: var(--opl-warning); }
  .settings-page .settings-issue > div { flex: 1; min-width: 0; }
  .settings-page .settings-issue strong { font-size: 14px; font-weight: 500; }
  .settings-page .settings-issue p, .settings-page .settings-inline-note { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 21px; margin: 4px 0 8px; }
  .settings-page .settings-quick-links { display: flex; gap: 8px; flex-wrap: wrap; padding-block: 10px; }
  .settings-page .settings-path { overflow-wrap: anywhere; text-align: right; }
  .settings-page .settings-support-link { display: flex; align-items: center; min-height: 44px; padding: 10px 0; color: var(--dsw-alias-label-primary); text-decoration: none; border-bottom: .5px solid var(--dsw-alias-border-l2); }
  .settings-page .settings-support-link:hover { text-decoration: underline; }
  .settings-page .settings-contribution-section { margin-top: 24px; }
  .settings-page .settings-contribution-package { border: 0; border-bottom: .5px solid var(--dsw-alias-border-l2); border-radius: 0; padding: 14px 0; box-shadow: none; background: transparent; }
  .settings-page .opl-contribution { background: transparent; border: 0; border-radius: 0; padding: 0; box-shadow: none; }
  .settings-page .opl-contribution-header { margin-bottom: 10px; }
  .settings-page .opl-contribution-title { font-size: 14px; font-weight: 500; }
  .settings-page .opl-contribution-title > svg { display: none; }
  .settings-page .opl-contribution-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .settings-page .opl-contribution-result h3 { font-size: 13px; font-weight: 500; margin: 16px 0 8px; }
  .settings-page .opl-contribution-result p { font-size: 13px; line-height: 21px; color: var(--dsw-alias-label-secondary); }
  .settings-page :is(button, input, select, textarea, summary, a):focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 3px; }
  .settings-page .settings-secondary-details { margin-block: 12px; }
  .settings-page .settings-action-receipt { padding-bottom: 12px; border-bottom: .5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 21px; }
  .settings-page .settings-action-receipt p { margin: 4px 0; overflow-wrap: anywhere; }
  .settings-page .settings-action-button, .settings-page .settings-inline-command { white-space: normal; }
  @media (max-width: 640px) {
    .settings-page .settings-issue { flex-wrap: wrap; }
    .settings-page .settings-issue > div { flex-basis: calc(100% - 40px); }
    .settings-page .settings-issue > button { margin-left: 28px; }
    .settings-page .settings-path { text-align: left; }
    .settings-page .settings-subnav { flex-wrap: wrap; }
  }

  .settings-page .settings-inline-note { border: 0; border-radius: 0; padding: 0; background: transparent; }
  [data-shortcut-modal="settings"] .sss-item { gap: 10px; }
  [data-shortcut-modal="settings"] .sss-item-kind { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: normal; text-align: right; }
  .settings-page .settings-row .settings-inline-command { background: transparent; border: 0; padding: 3px 0; }
`;

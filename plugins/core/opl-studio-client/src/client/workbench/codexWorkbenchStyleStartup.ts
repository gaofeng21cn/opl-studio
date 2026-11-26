export const codexWorkbenchStyleStartup = `  .startup-readiness {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 100dvh;
    padding: calc(40px + var(--opl-native-titlebar-inset)) 32px 40px;
    overflow: auto;
    color: var(--opl-text, rgb(15, 17, 21));
    background: var(--opl-canvas, rgb(250, 250, 249));
    font-family: var(--opl-font-sans);
  }

  .startup-readiness-content {
    width: min(100%, 620px);
    min-width: 0;
  }

  .startup-readiness-wordmark {
    min-width: 0;
    margin-bottom: 26px;
    color: var(--opl-text, rgb(15, 17, 21));
    overflow-wrap: anywhere;
    font-size: var(--opl-text-display);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .startup-readiness h1 {
    margin: 0;
    font-size: var(--opl-text-display-sm);
    font-weight: var(--opl-weight-semibold);
    line-height: var(--opl-leading-tight);
  }

  .startup-readiness-count {
    margin: 10px 0 30px;
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-lg);
    font-variant-numeric: tabular-nums;
  }

  .startup-readiness-stages {
    margin: 0;
    padding: 0;
    border-bottom: 1px solid var(--opl-border, rgba(0, 0, 0, 0.1));
    list-style: none;
  }

  .startup-readiness-stages li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    min-height: 58px;
    padding: 10px 2px;
    border-top: 1px solid var(--opl-border, rgba(0, 0, 0, 0.1));
  }

  .startup-readiness-stage-icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: var(--opl-muted, rgb(97, 102, 107));
  }

  .startup-readiness-stages li[data-status="ready"] .startup-readiness-stage-icon {
    color: var(--opl-success, rgb(34, 197, 94));
  }

  .startup-readiness-stages li[data-status="error"] .startup-readiness-stage-icon,
  .startup-readiness-stages li[data-status="timeout"] .startup-readiness-stage-icon {
    color: var(--opl-danger, rgb(236, 19, 19));
  }

  .startup-readiness-stage-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .startup-readiness-stage-copy strong {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--opl-text-body);
    font-weight: var(--opl-weight-semibold);
  }

  .startup-readiness-stage-copy > span {
    min-width: 0;
    overflow: hidden;
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .startup-readiness-stage-status {
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-md);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .startup-readiness-stages li[data-status="error"] .startup-readiness-stage-status,
  .startup-readiness-stages li[data-status="timeout"] .startup-readiness-stage-status {
    color: var(--opl-danger, rgb(236, 19, 19));
  }

  .startup-readiness-spinner {
    animation: startup-readiness-spin 900ms linear infinite;
  }

  .startup-readiness-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 22px;
  }

  .startup-readiness-actions button {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 8px 13px;
    border: 1px solid var(--opl-border, rgba(0, 0, 0, 0.12));
    border-radius: var(--dsw-radius-sm);
    background: transparent;
    color: inherit;
    font-size: var(--opl-text-md);
    font-weight: var(--opl-weight-semibold);
  }

  .startup-readiness-actions button:hover {
    background: var(--opl-hover, rgba(38, 49, 72, 0.06));
  }

  .startup-readiness-actions .startup-readiness-retry {
    border-color: var(--dsw-alias-button-primary-fill, rgb(15, 17, 21));
    background: var(--dsw-alias-button-primary-fill, rgb(15, 17, 21));
    color: var(--dsw-alias-label-primary-foreground, white);
  }

  .startup-readiness-actions .startup-readiness-retry:hover {
    background: var(--dsw-alias-button-primary-hover, rgb(67, 69, 74));
  }

  .startup-readiness-actions p {
    flex-basis: 100%;
    margin: 2px 0 0;
    color: var(--opl-muted, rgb(97, 102, 107));
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-normal);
  }

  @keyframes startup-readiness-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .startup-readiness-spinner {
      animation: none;
    }
  }

`;

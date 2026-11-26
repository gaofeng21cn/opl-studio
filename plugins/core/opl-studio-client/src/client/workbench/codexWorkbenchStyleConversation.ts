export const codexWorkbenchStyleConversation = `  .conversation {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .conversation::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  .settings-page {
    min-height: 0;
    flex: 1;
    display: block;
    overflow: hidden;
  }

  .conversation-inner {
    width: min(100%, 780px);
    min-height: 100%;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    padding: 28px 24px 0;
  }

  .workflow-strip,
  .thread-intro {
    display: none;
  }

  .thread {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 20px;
  }

  .thread-read-error {
    margin: 0;
    padding: 9px 11px;
    border-radius: var(--dsw-radius-sm);
    background: color-mix(in oklab, var(--opl-danger) 7%, transparent);
    color: var(--opl-danger);
    font-size: var(--opl-text-sm);
  }

  .empty-thread {
    min-height: calc(100vh - 210px);
    display: grid;
    place-items: center;
    text-align: center;
  }

  .empty-thread-inner {
    display: grid;
    gap: 9px;
    max-width: 520px;
  }

  .empty-thread-inner strong {
    font-size: var(--opl-text-lg);
    font-weight: var(--opl-weight-semibold);
  }

  .empty-thread-inner p {
    margin: 0;
    color: var(--opl-muted);
    font-size: var(--opl-text-md);
  }

  .empty-starters {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 8px;
  }

  .empty-starters button {
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid var(--opl-border);
    border-radius: var(--dsw-radius-sm);
    background: var(--opl-canvas);
    color: var(--opl-muted);
  }

  .empty-starters button:hover {
    background: var(--opl-sidebar);
  }

  .message {
    width: 100%;
    display: grid;
    gap: 7px;
  }

  .message-label {
    display: none;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
    font-weight: var(--opl-weight-medium);
  }

  .message.assistant .message-label {
    color: var(--opl-muted);
  }

  .message-frame {
    font-size: var(--dsh-content-font-size, 14px);
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .message.user .message-frame {
    width: fit-content;
    max-width: 86%;
    justify-self: end;
    padding: 9px 12px;
    border-radius: var(--dsw-radius-md);
    background: var(--opl-surface-secondary);
  }

  .message.system .message-frame {
    padding-left: 12px;
    border-left: 2px solid color-mix(in oklab, var(--opl-danger) 35%, transparent);
    color: var(--opl-danger);
  }

  .message.system.subagent .message-label {
    display: block;
    color: var(--opl-accent);
  }

  .message.system.subagent .message-frame {
    border-left-color: var(--opl-accent);
    color: var(--opl-text);
  }

  .message.system.execution-message .message-frame {
    border-left-color: var(--opl-border);
    color: var(--opl-text);
  }

  .execution-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 8px 0;
  }

  .execution-toggle, .execution-controls button {
    width: fit-content;
    min-height: 32px;
    border: 0;
    border-radius: var(--dsw-radius-sm);
    background: transparent;
    color: var(--opl-muted);
    font: inherit;
    cursor: pointer;
  }

  .execution-toggle:hover, .execution-controls button:hover {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .execution-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 6px 8px;
    color: var(--opl-muted);
    text-align: left;
  }

  .execution-toggle:focus-visible, .execution-controls button:focus-visible {
    outline: 2px solid var(--opl-accent);
    outline-offset: 3px;
  }

  .execution-status { font-size: var(--dsw-font-xxs-12-font-size); }
  .execution-failure { color: var(--opl-danger); overflow-wrap: anywhere; }
  .conversation-progress { margin: 12px 0; }
  .conversation-progress p { margin: 4px 0; overflow-wrap: anywhere; }

  .message-frame p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--dsh-content-font-size, 14px);
    line-height: var(--opl-leading-relaxed);
  }

  .message-frame > div,
  .message-frame > div > div {
    max-width: 100%;
  }

  .message.assistant .message-frame :where(p, ul, ol, blockquote, pre, table) {
    margin-top: 0;
    margin-bottom: 14px;
  }

  .message.assistant .message-frame :where(h1, h2, h3, h4) {
    margin: 22px 0 9px;
    font-size: var(--opl-text-lg);
    line-height: var(--opl-leading-normal);
    font-weight: var(--opl-weight-semibold);
  }

  .message.assistant .message-frame :where(ul, ol) {
    padding-left: 21px;
  }

  .message.assistant .message-frame :where(li + li) {
    margin-top: 5px;
  }

  .message.assistant .message-frame :where([data-streamdown="inline-code"]) {
    padding: 1px 3px;
    border-radius: var(--dsw-radius-sm);
    background: color-mix(in srgb, var(--opl-text) 6%, transparent);
    font-family: var(--opl-font-mono);
    font-size: 0.9em;
    font-weight: var(--opl-weight-regular);
  }

  .message.assistant .message-frame :where([data-streamdown="link"]) {
    display: inline;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: var(--opl-weight-medium);
    text-decoration-line: underline;
    text-decoration-color: color-mix(in oklab, var(--opl-text) 28%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .message.assistant .message-frame :where([data-streamdown="link"]:hover) {
    color: var(--opl-text);
    text-decoration-color: color-mix(in oklab, var(--opl-text) 58%, transparent);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block"]) {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    margin: 14px 0;
    border: 1px solid var(--opl-border);
    border-radius: var(--dsw-radius-sm);
    background: var(--opl-canvas);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-header"]) {
    min-height: 31px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid var(--opl-border-light);
    background: color-mix(in srgb, var(--opl-sidebar) 72%, var(--opl-canvas));
    color: var(--opl-muted);
    font-size: var(--opl-text-xs);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-actions"]) {
    position: absolute;
    z-index: 1;
    top: 3px;
    right: 5px;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-actions"] button) {
    width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: var(--dsw-radius-sm);
    background: transparent;
    color: var(--opl-muted);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-actions"] button:hover) {
    background: var(--opl-hover);
    color: var(--opl-text);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block-body"]) {
    overflow-x: auto;
    padding: 10px 12px 11px;
    border: 0;
    border-radius: 0;
    background: var(--opl-canvas);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block"] pre) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: var(--opl-font-mono);
    font-size: var(--opl-text-sm);
    line-height: var(--opl-leading-relaxed);
  }

  .message.assistant .message-frame :where([data-streamdown="code-block"] code) {
    padding: 0;
    background: transparent;
  }

  .message.assistant .message-frame :where(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--opl-text-md);
  }

  .message.assistant .message-frame :where(th, td) {
    padding: 7px 8px;
    border-bottom: 1px solid var(--opl-border);
    text-align: left;
    vertical-align: top;
  }

  .message-meta {
    display: none;
  }

  .run-events {
    display: grid;
    gap: 5px;
    margin-top: 3px;
    color: var(--opl-muted);
    font-size: var(--opl-text-sm);
  }

  .run-event {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .run-event::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--opl-faint);
  }

`;

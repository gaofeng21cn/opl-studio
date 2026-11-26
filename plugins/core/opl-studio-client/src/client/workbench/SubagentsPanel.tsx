import { useState } from 'react';
import type { WorkbenchThreadItem, WorkbenchThreadMessage } from './workbenchModel';

export function SubagentsPanel({ threadId, threads, messages, locale, onOpen }: {
  threadId?: string; threads: WorkbenchThreadItem[]; messages: WorkbenchThreadMessage[]; locale: 'zh' | 'en'; onOpen(id: string): Promise<string | null>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const children = threads.filter(thread => threadId && thread.parentThreadId === threadId);
  const items = new Map(children.map(thread => [thread.id, { id: thread.id, title: thread.agentNickname ?? thread.agentRole ?? thread.title, status: thread.status, text: thread.preview }]));
  for (const message of messages) for (const id of message.subagent?.childThreadIds ?? []) {
    if (!items.has(id)) items.set(id, { id, title: message.subagent?.agentNickname ?? message.subagent?.agentRole ?? id, status: message.subagent?.status ?? 'unknown', text: message.text });
  }
  if (!items.size) return null;
  const zh = locale === 'zh';
  const done = (status: string) => ['completed', 'done', 'closed', 'failed', 'interrupted', 'shutdown', 'cancelled'].includes(status);
  return <section data-testid="opl-subagents-panel" className="feature-status-panel">
    <h3>{zh ? '子 Agent' : 'Subagents'}</h3>
    {error && <p role="alert">{error} · {zh ? '保留当前会话，可重试打开。' : 'Current conversation retained; retry opening.'}</p>}
    {['active', 'done'].map(group => <div key={group}><h4>{group === 'done' ? 'Done' : 'Active'}</h4>
      {[...items.values()].filter(item => done(item.status) === (group === 'done')).map(item => <details key={item.id}>
        <summary>{item.title} · {item.status}</summary><p>{item.text}</p>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setError(await onOpen(item.id) ?? ''); } catch (reason) { setError(String(reason)); } finally { setBusy(false); } }}>{zh ? '打开会话' : 'Open thread'}</button>
      </details>)}
    </div>)}
  </section>;
}

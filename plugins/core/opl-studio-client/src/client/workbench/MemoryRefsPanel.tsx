import { useState } from 'react';
import type { OplFullDrilldownReadback } from '../bridge/oplBridge';

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function readMemoryRefs(readback: OplFullDrilldownReadback): { ref: string; role: string }[] {
  const envelope = record(readback.drilldown);
  const root = record(envelope.app_operator_drilldown ?? envelope);
  const refs = record(record(root.ref_family_refs).memory_refs).refs;
  return Array.isArray(refs) ? refs.flatMap(value => {
    const row = record(value);
    return typeof row.ref === 'string' && typeof row.role === 'string' ? [{ ref: row.ref, role: row.role }] : [];
  }) : [];
}
export function MemoryRefsPanel({ locale, read }: { locale: 'zh' | 'en'; read(): Promise<OplFullDrilldownReadback> }) {
  const [refs, setRefs] = useState<{ ref: string; role: string }[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <section data-testid="opl-memory-refs" className="feature-status-panel"><h3>{locale === 'zh' ? '记忆引用' : 'Memory references'}</h3>
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const value = await read(); if (value.readback?.exitCode !== 0) throw Error(locale === 'zh' ? 'Owner 读取失败，请重试。' : 'Owner read failed; retry.'); setRefs(readMemoryRefs(value)); } catch (reason) { setError(String(reason)); } finally { setBusy(false); } }}>{locale === 'zh' ? '读取 Owner 记忆引用' : 'Read owner memory refs'}</button>
    {error && <p role="alert">{error}</p>}
    {refs && !refs.length && <p>{locale === 'zh' ? '本次回读没有记忆引用；不代表记忆功能缺失。' : 'No memory refs in this readback; this does not imply missing memory capability.'}</p>}
    {refs?.map((item, index) => <p key={`${item.ref}:${index}`}><code>{item.ref}</code> · {item.role}</p>)}
    <small>{locale === 'zh' ? '引用来自 Framework 的领域详情；正文、写入与清理由所属 owner 管理。会话草稿不是长期记忆。' : 'Refs come from Framework drilldown. The owner manages memory content, writes and cleanup; drafts are not long-term memory.'}</small>
  </section>;
}

import { useState } from 'react';
import { Button, Input, ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives';
import { readShortcuts, resetShortcuts, shortcutFromEvent, writeShortcut, type ShortcutAction } from '../shortcuts';
import { SettingRow, SettingsGroup } from './primitives';
export function ShortcutSettings({ zh }: { zh: boolean }) {
 const [bindings, setBindings] = useState(readShortcuts); const [recording, setRecording] = useState<ShortcutAction | null>(null); const [query, setQuery] = useState(''); const [error, setError] = useState('');
 const labels = { newChat: zh ? '新建对话' : 'New conversation', settings: zh ? '打开设置' : 'Open settings', schedules: zh ? '计划任务' : 'Scheduled tasks' };
 const entries = Object.entries(bindings);
 const showSearch = entries.length > 5;
 return <SettingsGroup title={zh ? '快捷键' : 'Keyboard shortcuts'}>{showSearch ? <Input aria-label={zh ? '搜索快捷键' : 'Search shortcuts'} value={query} onChange={e => setQuery(e.currentTarget.value)} placeholder={zh ? '搜索快捷键' : 'Search shortcuts'} /> : null}
 {entries.filter(([id]) => !showSearch || labels[id as ShortcutAction].toLowerCase().includes(query.toLowerCase())).map(([id, binding]) => <SettingRow key={id} label={labels[id as ShortcutAction]}><Button variant="outline" size="sm" data-shortcut-recording={recording === id} onClick={() => {setRecording(id as ShortcutAction); setError('');}} onBlur={() => setRecording(null)} onKeyDown={e => { if (recording !== id) return; e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') return setRecording(null); const next = shortcutFromEvent(e.nativeEvent); if (!next) return setError(zh ? '请包含 Command 或 Ctrl 键。' : 'Include Command or Ctrl.'); try {setBindings(writeShortcut(id as ShortcutAction, next)); setRecording(null); setError('');} catch (error) {setError(error instanceof Error && error.message === 'reserved' ? (zh ? '此快捷键由系统或浏览器保留。' : 'This shortcut is reserved by the system or browser.') : (zh ? '快捷键已被其他操作使用。' : 'Another command uses this shortcut.'));} }}>{recording === id ? (zh ? '按下新快捷键…' : 'Press a shortcut…') : <ShortcutKeys keys={binding.replace('Mod', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl').replace('Comma', ',').replace('Slash', '/').split('+')} />}</Button></SettingRow>)}
 {error && <p role="alert">{error}</p>}<Button variant="outline" size="sm" onClick={() => {setBindings(resetShortcuts());setError('');setRecording(null);}}>{zh ? '恢复默认快捷键' : 'Restore defaults'}</Button></SettingsGroup>;
}

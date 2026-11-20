import { useEffect } from 'react';
export const shortcutDefaults = { newChat: 'Mod+Shift+O', settings: 'Mod+Comma', schedules: 'Mod+Shift+J' };
export type ShortcutAction = keyof typeof shortcutDefaults;
const key = 'opl.studio.shortcuts.v1';
export function readShortcuts(): Record<ShortcutAction, string> {
  try { const stored = JSON.parse(localStorage.getItem(key) ?? '{}'); return Object.fromEntries(Object.entries(shortcutDefaults).map(([id, fallback]) => [id, typeof stored[id] === 'string' ? stored[id] : fallback])) as Record<ShortcutAction, string>; } catch { return { ...shortcutDefaults }; }
}
export function shortcutFromEvent(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'code'>): string | null {
  if (!(event.metaKey || event.ctrlKey) || /^(Meta|Control|Alt|Shift)/.test(event.code)) return null;
  return ['Mod', ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), event.code.replace(/^Key/, '')].join('+');
}
export function writeShortcut(action: ShortcutAction, binding: string) {
  if (/^Mod\+(?:[ACFNPQRTVWXZ]|Tab|Space|F[0-9]+)$/.test(binding)) throw Error("reserved");
  const next = readShortcuts();
  if (Object.entries(next).some(([id, value]) => id !== action && value === binding)) throw Error('conflict');
  next[action] = binding; localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event('opl-shortcuts-changed')); return next;
}
export function resetShortcuts() { localStorage.removeItem(key); window.dispatchEvent(new Event('opl-shortcuts-changed')); return readShortcuts(); }
export function useWorkbenchShortcuts(actions: Record<ShortcutAction, () => void>) {
  useEffect(() => { const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.isComposing || document.querySelector('[data-shortcut-recording="true"]') || document.querySelector('[role="dialog"]')) return;
    const binding = shortcutFromEvent(event); if (!binding) return;
    const match = Object.entries(readShortcuts()).find(([, value]) => value === binding)?.[0] as ShortcutAction | undefined;
    if (match) { event.preventDefault(); actions[match](); }
  }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [actions]);
}

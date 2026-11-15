import { useState, type ReactNode } from "react";
import { groupSettingsContributions, type OplUiContribution } from "./contributionProjection";

/** Settings consumes the same native contribution renderer as the rest of the App. */
export function SettingsPluginSections({ entries, labels, renderEntry, collapsible }: {
  entries: readonly OplUiContribution[];
  labels: ReadonlyMap<string, string>;
  renderEntry(entry: OplUiContribution): ReactNode;
  collapsible: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  if (!entries.length) return null;
  if (!collapsible) return <>{entries.map(entry => <div key={entry.contributionKey}>{renderEntry(entry)}</div>)}</>;
  return <div className="opl-contribution-slot">{groupSettingsContributions(entries).map(group => {
    const open = expanded.has(group.packageId);
    const label = labels.get(group.packageId) ?? Object.values(group.entries[0]?.view?.title ?? {})[0] ?? group.packageId;
    return <details key={group.packageId} className="settings-secondary-details" open={open} onToggle={event => {
      const nextOpen = event.currentTarget.open;
      setExpanded(current => {
        if (current.has(group.packageId) === nextOpen) return current;
        const next = new Set(current);
        if (nextOpen) next.add(group.packageId); else next.delete(group.packageId);
        return next;
      });
    }}><summary>{label}</summary>{open ? group.entries.map(entry => <div key={entry.contributionKey}>{renderEntry(entry)}</div>) : null}</details>;
  })}</div>;
}

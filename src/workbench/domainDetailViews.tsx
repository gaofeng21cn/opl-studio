import { Route } from "lucide-react";
import type { DomainDetailViewDescriptor, WorkItemRuntimeItem } from "./workbenchModel";
import { useMcpAppsClient } from "../../plugins/opl-mcp-apps/src/client/plugin";
import type { McpAppProps } from "../../plugins/opl-mcp-apps/src/client/McpAppWorkspace";

export type DomainDetailViewEntryListProps = {
  item: WorkItemRuntimeItem;
  locale: "zh" | "en";
  onOpen(view: DomainDetailViewDescriptor): void;
};

export function DomainDetailViewEntryList({ item, locale, onOpen }: DomainDetailViewEntryListProps) {
  const views = item.domainDetailViews ?? [];
  if (!views.length) return null;
  return (
    <div className="opl-runtime-detail-result runtime-domain-view-entries" data-testid="opl-domain-detail-view-entries">
      <h4>{locale === "zh" ? "任务详情视图" : "Work item detail views"}</h4>
      <div className="runtime-domain-view-entry-list" role="list">
        {views.map((view) => (
          <button
            key={view.viewId}
            type="button"
            role="listitem"
            data-view-id={view.viewId}
            data-view-kind={view.viewKind}
            aria-label={`${locale === "zh" ? "打开" : "Open"} ${view.title ?? view.viewId}`}
            onClick={() => onOpen(view)}
          >
            <Route aria-hidden="true" size={14} />
            {view.title ?? view.viewId}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DomainDetailViews({ item, locale, mcpApps, initialViewId }: {
  item: WorkItemRuntimeItem; locale: "zh" | "en";
  mcpApps?: Omit<McpAppProps, "locale">; initialViewId?: string;
}) {
  const client = useMcpAppsClient();
  return client && mcpApps
    ? <client.TaskWorkbench {...mcpApps} locale={locale} itemId={item.id} viewId={initialViewId}/>
    : <p role="status">{locale === "zh" ? "任务工作台暂不可用" : "Task workbench is unavailable"}</p>;
}

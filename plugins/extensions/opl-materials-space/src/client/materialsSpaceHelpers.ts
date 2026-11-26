import type {
  DeliverableCategory,
  MaterialDeliverableEntry,
  MaterialSpaceProject
} from "@gaofeng21cn/opl-host-contracts";

export type MaterialsLocale = "zh" | "en";

export function formatMaterialSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMaterialTime(iso: string | undefined, locale: MaterialsLocale): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins >= 0 && mins < 60) return locale === "zh" ? `${Math.max(1, mins)} 分钟前` : `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours >= 0 && hours < 24) return locale === "zh" ? `${hours} 小时前` : `${hours}h ago`;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}

export function categoryLabel(category: DeliverableCategory | "all", locale: MaterialsLocale): string {
  const zh = locale === "zh";
  switch (category) {
    case "all": return zh ? "全部" : "All";
    case "document": return zh ? "文档与文稿" : "Documents";
    case "media": return zh ? "图表与音视频" : "Media";
    case "data": return zh ? "数据表格" : "Data";
    case "archive": return zh ? "打包交付" : "Packages";
    case "code": return zh ? "脚本与代码" : "Code";
    case "other": return zh ? "其他" : "Other";
  }
}

export type BreadcrumbSegment = {
  label: string;
  relativePath: string;
};

export function buildBreadcrumbs(rootLabel: string, relativePath: string): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [{ label: rootLabel, relativePath: "" }];
  if (!relativePath) return segments;
  const parts = relativePath.split("/").filter(Boolean);
  let cursor = "";
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part;
    segments.push({ label: part, relativePath: cursor });
  }
  return segments;
}

export function pickInitialDeliverable(entries: readonly MaterialDeliverableEntry[]): MaterialDeliverableEntry | undefined {
  if (!entries.length) return undefined;
  return entries.find((entry) => entry.previewable) ?? entries[0];
}

export function filterSpaceProjects(
  projects: readonly MaterialSpaceProject[],
  query: string
): MaterialSpaceProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...projects];
  return projects.filter(
    (project) =>
      project.displayName.toLowerCase().includes(q)
      || project.agentDisplayName.toLowerCase().includes(q)
      || project.workspacePath.toLowerCase().includes(q)
      || project.workItems.some((item) => item.title.toLowerCase().includes(q))
  );
}

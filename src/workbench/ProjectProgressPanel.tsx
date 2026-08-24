import { AlertTriangle, CheckCircle2, CircleDot, Clock3 } from "lucide-react";
import type { ProjectProgressViewModel } from "./projectProgress";

type ProjectProgressPanelProps = {
  locale: "zh" | "en";
  progress: ProjectProgressViewModel;
  refreshing: boolean;
};

function attentionLabel(value: string, locale: "zh" | "en"): string {
  const labels: Record<string, [string, string]> = {
    user: ["需要你处理", "Needs your attention"],
    system: ["系统正在处理", "System attention"],
    agent: ["智能体正在处理", "Agent attention"]
  };
  return labels[value]?.[locale === "zh" ? 0 : 1] ?? value;
}

export function ProjectProgressPanel({ locale, progress, refreshing }: ProjectProgressPanelProps) {
  const copy = locale === "zh"
    ? {
        noProjection: "项目进度暂时不可用。",
        noWorkspace: "当前对话还没有工作区。",
        noMatch: "当前对话未关联 OPL 智能体项目。",
        stageProgress: "阶段进度",
        currentStage: "当前阶段",
        attempt: "本次执行",
        next: "下一步",
        owner: "负责人"
      }
    : {
        noProjection: "Project progress is currently unavailable.",
        noWorkspace: "The current task has no workspace yet.",
        noMatch: "This task is not linked to an OPL agent project.",
        stageProgress: "Stage progress",
        currentStage: "Current stage",
        attempt: "Current attempt",
        next: "Next action",
        owner: "Owner"
      };
  const empty = progress.emptyReason === "projection_unavailable"
    ? copy.noProjection
    : progress.emptyReason === "workspace_missing"
      ? copy.noWorkspace
      : copy.noMatch;

  if (!progress.matchedProject) {
    return <p className="context-empty" data-testid="opl-project-progress-empty">{empty}</p>;
  }

  return (
    <div className="project-progress" data-testid="opl-project-progress">
      <header className="project-progress-header">
        <div><strong>{progress.matchedProject.label}</strong><span>{refreshing ? (locale === "zh" ? "正在刷新" : "Refreshing") : `${progress.items.length} ${locale === "zh" ? "个工作项" : "work items"}`}</span></div>
      </header>
      {progress.items.length ? <div className="project-progress-items">
        {progress.items.map((item) => (
          <article className="project-progress-item" key={item.id} data-status={item.lifecycleStatus}>
            <header>
              <div><strong>{item.workItemLabel}</strong><span>{item.agentLabel}</span></div>
              <span className="project-progress-status"><CircleDot aria-hidden="true" size={12} />{item.lifecycleStatusLabel}</span>
            </header>
            <dl>
              <div><dt><CheckCircle2 aria-hidden="true" size={13} />{copy.stageProgress}</dt><dd>{item.completedStages}/{item.totalStages}</dd></div>
              {item.currentStage ? <div><dt><Clock3 aria-hidden="true" size={13} />{copy.currentStage}</dt><dd>{item.currentStage.label}</dd></div> : null}
              {item.attempt ? <div><dt>{copy.attempt}</dt><dd><code>{item.attempt.id}</code></dd></div> : null}
            </dl>
            {item.attention || item.blocker ? <div className="project-progress-attention"><AlertTriangle aria-hidden="true" size={14} /><span><strong>{item.attention ? attentionLabel(item.attention, locale) : item.lifecycleStatusLabel}</strong>{item.blocker ? <small>{item.blocker}</small> : null}</span></div> : null}
            {item.nextAction ? <div className="project-progress-next"><strong>{copy.next}</strong><span>{item.nextAction.title ?? item.nextAction.summary}</span>{item.nextAction.title && item.nextAction.summary ? <small>{item.nextAction.summary}</small> : null}{item.nextAction.owner ? <small>{copy.owner}: {item.nextAction.owner}</small> : null}</div> : null}
          </article>
        ))}
      </div> : <p className="context-empty">{copy.noMatch}</p>}
    </div>
  );
}

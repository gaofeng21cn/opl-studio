import { useEffect, useId, useRef } from "react";
import { Check, ChevronDown, CircleAlert, CircleDot, CirclePause, Clock3, X } from "lucide-react";
import type { WorkItemRuntimeItem } from "@gaofeng21cn/opl-host-contracts";
import {
  computeStageProgress,
  formatTokens,
  isStageActive,
  isStageAttention,
  isStageCompleted,
  localizeStageState,
  localizedStageName,
  normalizeStageStateKey,
  type RuntimeLocale
} from "./runtimeStatusHelpers";

export type StageProgressStepperProps = {
  item: WorkItemRuntimeItem;
  locale: RuntimeLocale;
  open: boolean;
  onToggle(): void;
  onClose(): void;
};

export function StageProgressStepper({
  item,
  locale,
  open,
  onToggle,
  onClose
}: StageProgressStepperProps) {
  const zh = locale === "zh";
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = computeStageProgress(item);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [open, onClose]);

  const stageLabel = progress.terminalDelivered
    ? (zh ? `已交付 (${progress.completedCount}/${progress.totalCount || 0})` : `Delivered (${progress.completedCount}/${progress.totalCount || 0})`)
    : item.currentStageId
      ? localizedStageName(
          item.stages.find((candidate) => candidate.stageId === item.currentStageId),
          locale,
          item.currentStageName ?? item.currentStageId
        )
      : item.currentStageName ?? (zh ? "暂无当前阶段" : "No current stage");

  return (
    <div className="runtime-stage-stepper-wrap" ref={containerRef}>
      <button
        type="button"
        className="runtime-stage-button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={onToggle}
      >
        <span className="runtime-stage-button-label">
          {zh ? "当前阶段" : "Current stage"}: <strong>{stageLabel}</strong>
        </span>
        {progress.totalCount > 0 ? (
          <span className="runtime-stage-track" aria-hidden="true">
            {progress.displayStages.map((stage) => {
              const tone = isStageCompleted(stage.state)
                ? "completed"
                : isStageActive(stage.state)
                  ? "active"
                  : isStageAttention(stage.state)
                    ? "attention"
                    : "pending";
              return <span key={stage.stageId} className="runtime-stage-segment" data-tone={tone} />;
            })}
            <small>{progress.completedCount}/{progress.totalCount}</small>
          </span>
        ) : null}
        <ChevronDown aria-hidden="true" size={14} />
      </button>

      {open ? (
        <section
          id={popoverId}
          className="runtime-stage-popover"
          aria-label={zh ? "阶段进度" : "Stage progress"}
        >
          <header>
            <div>
              <strong>{zh ? "阶段进度" : "Stage progress"}</strong>
              {item.attemptId ? (
                <code className="runtime-attempt-chip" title={item.attemptId}>
                  {zh ? "本次执行" : "Attempt"}: {item.attemptId}
                </code>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={zh ? "关闭阶段进度" : "Close stage progress"}
              title={zh ? "关闭阶段进度" : "Close stage progress"}
              onClick={onClose}
            >
              <X aria-hidden="true" size={14} />
            </button>
          </header>

          {progress.displayStages.length ? (
            <ol>
              {progress.displayStages.map((stage, index) => {
                const stateKey = normalizeStageStateKey(stage.state);
                const tone = isStageCompleted(stateKey)
                  ? "completed"
                  : isStageActive(stateKey)
                    ? "active"
                    : isStageAttention(stateKey)
                      ? "attention"
                      : stateKey === "paused" || stateKey === "stopped"
                        ? "stopped"
                        : "pending";
                const isCurrent = item.currentStageId === stage.stageId;
                return (
                  <li key={stage.stageId} data-state={tone} data-current={isCurrent || undefined}>
                    <span className="runtime-stage-node" aria-hidden="true">
                      {tone === "completed" ? (
                        <Check size={12} />
                      ) : tone === "active" ? (
                        <CircleDot size={12} />
                      ) : tone === "attention" ? (
                        <CircleAlert size={12} />
                      ) : tone === "stopped" ? (
                        <CirclePause size={12} />
                      ) : (
                        <Clock3 size={11} />
                      )}
                    </span>
                    <div className="runtime-stage-meta">
                      <strong>
                        {index + 1}. {localizedStageName(stage, locale)}
                      </strong>
                      <div className="runtime-stage-sub">
                        <span className="runtime-stage-state-badge" data-tone={tone}>
                          {localizeStageState(stage.state, locale)}
                        </span>
                        {stage.elapsedSeconds !== null ? (
                          <small>{Math.round(stage.elapsedSeconds)}s</small>
                        ) : null}
                        {stage.totalTokens !== null ? (
                          <small>{formatTokens(stage.totalTokens, "observed", locale)} tok</small>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="runtime-stage-empty">
              {zh ? "暂无阶段明细记录" : "No stage details recorded"}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

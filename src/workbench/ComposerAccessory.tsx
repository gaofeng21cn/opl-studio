import { AlertTriangle, FileText, LoaderCircle, Puzzle, X } from "lucide-react";
import type { AgentPackageSelectionIntent } from "./workbenchModel";
import type { ComposerSelection } from "./ComposerCapabilityPalette";
import { uiCopy } from "./appCopy";
import { codexModelPolicy } from "./modelPolicy";

type ComposerAccessoryProps = {
  locale: "zh" | "en";
  recoveredDrafts?: Record<string, string>;
  prompt: string;
  selections: readonly ComposerSelection[];
  selectedAgent: AgentPackageSelectionIntent | null;
  sendState: "idle" | "running" | "error";
  submissionError: string;
  unavailableFixedModel: boolean;
  customModelSelected?: boolean;
  onUpdatePrompt(value: string): void;
  onRemoveSelection(id: string): void;
  onClearAgent(): void;
};

export function ComposerAccessory({
  locale,
  recoveredDrafts,
  prompt,
  selections,
  selectedAgent,
  sendState,
  submissionError,
  unavailableFixedModel,
  customModelSelected,
  onUpdatePrompt,
  onRemoveSelection,
  onClearAgent
}: ComposerAccessoryProps) {
  const copy = uiCopy[locale];
  return (
    <>
      {Object.keys(recoveredDrafts ?? {}).length > 0 ? <details data-testid="opl-recovered-drafts">
        <summary>{locale === "zh" ? "从 Preview 保留的其他草稿" : "Additional drafts recovered from Preview"}</summary>
        {Object.entries(recoveredDrafts ?? {}).map(([id, text]) => <div key={id}>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>{text}</pre>
          <button type="button" onClick={() => onUpdatePrompt(prompt ? `${prompt}\n\n${text}` : text)}>{locale === "zh" ? "追加到当前草稿" : "Append to current draft"}</button>
        </div>)}
      </details> : null}
      {selections.length ? (
        <div className="composer-selections" aria-label={locale === "zh" ? "已添加的内容" : "Added content"}>
          {selections.map((selection) => <span key={selection.id} className="composer-selection" data-status={selection.attachment?.status} title={selection.detail}>{selection.attachment?.status === "pending" ? <LoaderCircle aria-hidden="true" size={13} className="spin" /> : selection.attachment?.status === "error" ? <AlertTriangle aria-hidden="true" size={13} /> : <FileText aria-hidden="true" size={13} />}<span>{selection.label}</span><button type="button" aria-label={`${locale === "zh" ? "移除" : "Remove"} ${selection.label}`} onClick={() => onRemoveSelection(selection.id)}><X aria-hidden="true" size={12} /></button></span>)}
        </div>
      ) : null}
      {selectedAgent ? (
        <div className="composer-selections" aria-label={locale === "zh" ? "已选择的标准智能体" : "Selected standard Agent"}>
          <span className="composer-selection" title={selectedAgent.description}>
            <Puzzle aria-hidden="true" size={13} />
            <span>{locale === "zh" ? selectedAgent.displayNameI18n.zh ?? selectedAgent.label : selectedAgent.displayNameI18n.en ?? selectedAgent.label}</span>
            <button type="button" aria-label={locale === "zh" ? "移除智能体" : "Remove Agent"} onClick={onClearAgent}><X aria-hidden="true" size={12} /></button>
          </span>
        </div>
      ) : null}
      {customModelSelected ? <p className="settings-inline-note" data-testid="opl-custom-model-notice" role="status">{codexModelPolicy.customModelAccess.description[locale]}</p> : null}
      <span
        className={`composer-status ${sendState === "error" || unavailableFixedModel ? "error" : sendState}`}
        data-testid="opl-composer-run-state"
        aria-live="polite"
      >
        {submissionError || (sendState === "running" ? copy.working : sendState === "error" ? copy.sendFailed : unavailableFixedModel ? copy.modelSelectionUnavailable : "")}
      </span>
    </>
  );
}

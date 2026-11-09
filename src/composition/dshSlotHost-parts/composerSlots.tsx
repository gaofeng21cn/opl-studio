import { Check, ChevronDown, ChevronRight, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IconChevronDownOutlineMedium, Menu, RiskConfirmation, UserTextRun, type MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import { InputBar } from "@opl-vendor/dsh-input-bar";
import { QueueDock } from "@opl-vendor/dsh-queue-dock";
import { AgentPresetSeat } from "@opl-vendor/dsh-agent-preset-seat";
import { createSnapshotStore } from "../../integrations/deepseek-harness/runtimeShim";
import { autoModelLabel, reasoningLabel } from "../../workbench/modelPolicy";
import { useComposerEditor } from "../../integrations/deepseek-harness/useComposerEditor";
import {
  loadStudioQueueImage,
  translate,
  useDshSnapshot,
  useStudio,
  useStudioBusyEnter,
  useStudioDeveloperTools,
  useStudioStopShortcut
} from "./studioContext";

function StudioPermissionSelect({
  value,
  options,
  locked,
  locale,
  command
}: {
  value: string;
  options: Array<{ value: string; name: string; description: string }>;
  locked: boolean;
  locale: "zh" | "en";
  command: (line: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const current = options.find((option) => option.value === value);
  const currentLabel = current?.name ?? value;
  const busy = pending !== null || confirmation !== null;
  const iconFor = (permission: string) => permission === "danger-full-access"
    ? <ShieldAlert aria-hidden="true" size={14} />
    : permission === "workspace-write"
      ? <ShieldCheck aria-hidden="true" size={14} />
      : <Shield aria-hidden="true" size={14} />;
  const items: MenuEntry[] = options.filter((option) => option.value !== "custom").map((option) => ({
    id: option.value,
    label: option.name,
    icon: iconFor(option.value)
  }));
  const submit = (next: string) => {
    setPending(next);
    void command(`/permission ${next}`).catch(() => false).finally(() => setPending(null));
  };
  const choose = (next: string) => {
    setOpen(false);
    if (next === value) return;
    if (next === "danger-full-access") {
      setAcknowledged(false);
      setConfirmation(next);
      return;
    }
    submit(next);
  };
  const closeConfirmation = () => {
    setAcknowledged(false);
    setConfirmation(null);
  };
  const confirmFullAccess = () => {
    if (locked || !acknowledged || confirmation === null) return;
    const next = confirmation;
    closeConfirmation();
    submit(next);
  };
  return <>
    <Menu
      open={open}
      items={items}
      selectedId={value}
      onSelect={choose}
      onClose={() => setOpen(false)}
      side="top"
      anchor={<button
        type="button"
        className="opl-dsh-permission-trigger"
        aria-label={locale === "zh" ? `权限：${currentLabel}` : `Access: ${currentLabel}`}
        title={current?.description}
        disabled={locked || busy}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="opl-dsh-permission-icon">{iconFor(value)}</span>
        <span className="opl-dsh-permission-label">{currentLabel}</span>
        <span className={`opl-dsh-permission-chevron${open ? " is-open" : ""}`} aria-hidden="true"><IconChevronDownOutlineMedium /></span>
      </button>}
    />
    <RiskConfirmation
      open={confirmation !== null}
      title={locale === "zh" ? "启用完整权限" : "Enable full access"}
      description={locale === "zh" ? "完整权限允许任务修改本机文件。" : "Full access allows the task to modify local files."}
      acknowledgeLabel={locale === "zh" ? "我了解此权限" : "I understand this access"}
      cancelLabel={locale === "zh" ? "取消" : "Cancel"}
      closeLabel={locale === "zh" ? "关闭" : "Close"}
      confirmLabel={locale === "zh" ? "启用" : "Enable"}
      acknowledged={acknowledged}
      disabled={locked}
      onAcknowledgedChange={setAcknowledged}
      onCancel={closeConfirmation}
      onConfirm={confirmFullAccess}
    />
  </>;
}
export function OplBrandNameSlot() { return <>One Person Lab</>; }
export function EmptyAttachmentSlot() { return null; }
export function HeroActionsSlot() {
  const studio = useStudio();
  const store = useMemo(() => createSnapshotStore<{
    showPicker: boolean;
    options: Array<{ id: string; trust: "system"; name: string; description: string }>;
    current: string;
    error: string | null;
    busy: boolean;
    introduce: boolean;
  }>({ showPicker: true, options: [], current: "", error: null, busy: false, introduce: false }), []);
  useEffect(() => {
    store.set({
      ...store.getSnapshot(),
      options: studio.agentPresets.map((preset) => ({ id: preset.id, trust: "system" as const, name: preset.name, description: preset.description })),
      current: studio.selectedAgentPresetId,
    });
  }, [store, studio.agentPresets, studio.selectedAgentPresetId]);
  return <AgentPresetSeat
    useShowPresetPicker={(selector: any) => selector(true)}
    useSessionRetainInfo={(selector: any) => selector({ retainedBy: { mainView: 1 } })}
    load={async () => undefined}
    select={(id: string) => studio.selectAgentPreset(id)}
    introduced={() => undefined}
    useAgentPresetSeat={(selector: any) => useDshSnapshot(store, selector)}
    useDeveloperTools={useStudioDeveloperTools}
    t={(key: string) => translate(studio.locale, key)}
  />;
}
export function ComposerOverlaySlot() { return <>{useStudio().composerOverlay}</>; }
export function ComposerModelSlot() {
  const studio = useStudio();
  const [open, setOpen] = useState(false);
  const currentOption = studio.modelOptions.find((option) => option.id === studio.resolvedModelId);
  const modelLabel = studio.modelSelection === "__auto"
    ? autoModelLabel(studio.locale)
    : studio.locale === "zh" ? currentOption?.label_zh ?? studio.modelSelection : currentOption?.label_en ?? studio.modelSelection;
  const effortLabel = reasoningLabel(studio.reasoningSelection, studio.locale, true);
  const summary = (label: string, value: string) => <span className="opl-model-menu-summary"><span>{label}</span><span className="opl-model-menu-value">{value}</span><ChevronRight aria-hidden="true" size={14} /></span>;
  const choice = (label: string, selected: boolean) => <span className="opl-model-menu-choice"><span>{label}</span>{selected ? <Check aria-hidden="true" size={14} /> : null}</span>;
  const items: MenuEntry[] = [
    {
      id: "model",
      label: summary(studio.locale === "zh" ? "模型" : "Model", modelLabel),
      disabled: !studio.modelOptions.some((option) => option.available),
      submenu: studio.modelOptions.filter((option) => option.available).map((option) => ({
        id: `model:${option.id}`,
        label: choice(studio.locale === "zh" ? option.label_zh : option.label_en, studio.modelSelection === option.id)
      }))
    },
    {
      id: "reasoning",
      label: summary(studio.locale === "zh" ? "推理等级" : "Reasoning", effortLabel),
      disabled: !studio.resolvedModelId || studio.reasoningOptions.length === 0,
      submenu: studio.reasoningOptions.map((effort) => ({
        id: `reasoning:${effort}`,
        label: choice(reasoningLabel(effort, studio.locale, true), studio.reasoningSelection === effort)
      }))
    },
    {
      id: "automatic",
      label: autoModelLabel(studio.locale)
    }
  ];
  const select = (id: string) => {
    setOpen(false);
    if (id === "automatic") {
      void studio.selectModel("__auto");
      return;
    }
    if (id.startsWith("model:")) {
      const modelId = id.slice("model:".length);
      const option = studio.modelOptions.find((candidate) => candidate.id === modelId);
      void studio.selectModel(modelId, option?.defaultReasoningEffort);
      return;
    }
    if (id.startsWith("reasoning:") && studio.resolvedModelId) {
      void studio.selectModel(studio.resolvedModelId, id.slice("reasoning:".length));
    }
  };
  return <Menu
    open={open}
    side="top"
    align="end"
    items={items}
    selectedIds={studio.modelSelection === "__auto" ? ["automatic"] : []}
    onSelect={select}
    onClose={() => setOpen(false)}
    anchor={<button
      type="button"
      className="opl-model-trigger"
      data-testid="opl-model-trigger"
      aria-label={`${studio.locale === "zh" ? "选择模型" : "Select model"}: ${modelLabel}, ${effortLabel}`}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={studio.sending}
      title={`${modelLabel} · ${effortLabel}`}
      onClick={() => setOpen((value) => !value)}
    ><span>{modelLabel}</span><span className="opl-model-trigger-effort">{effortLabel}</span><ChevronDown aria-hidden="true" size={14} /></button>}
  />;
}

export function InputBarSlot({ renderSlot, ...owner }: Record<string, any>) {
  const studio = useStudio();
  const composer = useComposerEditor(studio.prompt, studio.updatePrompt, studio.currentThreadId);
  const input = { draft: studio.prompt, attachmentIds: studio.composerImages.map((image) => image.id), draftRev: studio.promptRevision, phase: "plain", occurrences: [], queue: studio.queue };
  const permissionValue = studio.agentPermissions === ":danger-full-access"
    ? "danger-full-access"
    : studio.agentPermissions === ":workspace" ? "workspace-write" : "read-only";
  const permissionName = (value: string) => value === "danger-full-access"
    ? (studio.locale === "zh" ? "完全访问" : "Full access")
    : value === "workspace-write"
      ? (studio.locale === "zh" ? "工作区访问" : "Workspace access")
      : (studio.locale === "zh" ? "只读" : "Read only");
  const permissionOptions = [
    { value: "read-only", name: permissionName("read-only"), description: studio.locale === "zh" ? "仅读取，不修改文件。" : "Read without modifying files." },
    { value: "workspace-write", name: permissionName("workspace-write"), description: studio.locale === "zh" ? "允许修改当前工作区。" : "Allow changes in the current workspace." },
    { value: "danger-full-access", name: permissionName("danger-full-access"), description: studio.locale === "zh" ? "允许执行更广泛的本机操作。" : "Allow broader local operations." }
  ];
  const command = async (line: string) => {
    const match = /^\/permission\s+(\S+)\s*$/.exec(line.trim());
    const value = match?.[1];
    const next = value === "danger-full-access" ? ":danger-full-access" : value === "workspace-write" ? ":workspace" : value === "read-only" ? ":read-only" : undefined;
    if (!next) return false;
    studio.setAgentPermissions(next);
    return true;
  };
  const keyboard = {
    ...composer,
    caretSpan: () => ({ start: studio.prompt.length, end: studio.prompt.length }),
    snapshot: input, setDraft: studio.updatePrompt, submit: studio.submitPrompt, steerQueue: studio.steerQueue,
    undo: () => undefined, redo: () => undefined,
    pasteBegin: (text: string, selection: { start: number; end: number }) => studio.updatePrompt(`${studio.prompt.slice(0, selection.start)}${text}${studio.prompt.slice(selection.end)}`),
    invalidatePaste: () => undefined, track: () => undefined, arbitrate: () => "pass", space: () => false, dismissPopup: () => undefined
  };
  const inputRenderSlot = (key: string, props: Record<string, unknown>) => key === "conversation.input.permission"
    ? <StudioPermissionSelect value={permissionValue} options={permissionOptions} locked={studio.sending} locale={studio.locale} command={command} />
    : renderSlot(key, props);
  return <InputBar {...owner} sessionId="opl-current" useSession={(selector: any) => selector({ promptError: null, running: studio.sending, subagent: null, removed: false })} useInput={(selector: any) => selector(input)} inputActions={{ setDraft: studio.updatePrompt, addAttachments: () => true, removeAttachment: studio.removeComposerImage, pruneAttachments: () => undefined, submit: studio.submitPrompt }} keyboard={keyboard} addFiles={studio.addComposerImages} removeAttachment={studio.removeComposerImage} resolveDraftAttachments={(ids: readonly string[]) => ids.flatMap((id) => { const image = studio.composerImages.find((candidate) => candidate.id === id); return image ? [{ kind: "image", ...image }] : []; })} useBusyEnter={useStudioBusyEnter} useStopShortcut={useStudioStopShortcut} toggleCommandMenu={studio.openComposerPalette} stop={studio.stopTurn} t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)} renderSlot={inputRenderSlot} useFileUploads={(selector: any) => selector({})} useNotices={(selector: any) => selector(null)} useLexicon={(selector: any) => selector(new Map())} useMenuLauncher={(selector: any) => selector(undefined)} useProjection={(_key: string, selector?: (value: undefined) => unknown) => selector ? selector(undefined) : undefined} accessory={studio.composerAccessory} />;
}

export function QueueDockSlot() {
  const studio = useStudio();
  const inbox = {
    "next-turn": studio.queue.map((row) => ({
      id: row.id,
      source: { kind: "user" },
      content: row.text === null ? [] : [{ type: "text", text: row.text }]
    }))
  };
  const session = {
    queue: studio.queue.map((row) => ({ ...row, content: row.text === null ? [] : [{ type: "text", text: row.text }] })),
    pendingSubmissions: [], running: studio.sending, subagent: null
  };
  return <QueueDock
    useSession={(selector: any) => selector(session)}
    useProjection={() => inbox}
    updateQueue={studio.updateQueue}
    notify={studio.notifyQueue}
    loadImage={loadStudioQueueImage}
    renderFactorySlot={(name: string, props: { text?: string }) => name === "conversation.user.text"
      ? <UserTextRun text={props.text ?? ""} />
      : null}
    t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)}
  />;
}

export function DetailsSlot(): null { return null; }

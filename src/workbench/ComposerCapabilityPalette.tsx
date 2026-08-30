import { Bot, Check, FilePlus2, FolderPlus, Plug, Search, Sparkles, X } from "lucide-react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  CodexCapabilityCatalog,
  CodexComposerInput,
  CodexSkillCapability
} from "../bridge/oplBridge";
import type { AgentPackageSelectionIntent } from "./workbenchModel";

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

export type ComposerAttachment = {
  id: string;
  kind: "file" | "folder" | "image";
  source: "picker" | "paste" | "drop";
  name: string;
  path: string;
  status: "pending" | "ready" | "error";
  progress: number;
  error?: string;
  cleanupToken?: string;
  previewUrl?: string;
  previewFile?: File;
};

export type ComposerSelection = {
  id: string;
  kind: "file" | "folder" | "image" | "skill";
  label: string;
  detail: string;
  input: CodexComposerInput;
  attachment?: ComposerAttachment;
};

export type ComposerAgentOption = {
  id: string;
  name: string;
  description: string;
  selection: AgentPackageSelectionIntent;
};

export type ComposerOplCapabilityOption = {
  id: string;
  name: string;
  description: string;
  skill: CodexSkillCapability;
};

type ComposerCapabilityPaletteProps = {
  open: boolean;
  locale: "zh" | "en";
  catalog: CodexCapabilityCatalog;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  selections: ComposerSelection[];
  standardAgents: ComposerAgentOption[];
  oplCapabilities: ComposerOplCapabilityOption[];
  selectedAgentId?: string;
  contributions?: ReactNode;
  onClose(): void;
  onPickFiles(): void;
  onPickDirectory(): void;
  onToggleSkill(skill: CodexSkillCapability): void;
  onSelectOplCapability(capability: ComposerOplCapabilityOption): void;
  onSelectAgent(agent: ComposerAgentOption): void;
};

export function ComposerCapabilityPalette({
  open,
  locale,
  catalog,
  status,
  error,
  selections,
  standardAgents,
  oplCapabilities,
  selectedAgentId,
  contributions,
  onClose,
  onPickFiles,
  onPickDirectory,
  onToggleSkill,
  onSelectOplCapability,
  onSelectAgent
}: ComposerCapabilityPaletteProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const copy = locale === "zh" ? {
    title: "添加到对话",
    search: "搜索文件、智能体、Skill 和连接",
    local: "本地输入",
    files: "添加文件",
    filesHelp: "图片和文件",
    folder: "添加文件夹",
    folderHelp: "将文件夹作为上下文",
    agents: "OPL 智能体",
    oplCapabilities: "OPL 能力",
    skills: "Skills",
    connections: "应用与连接",
    loaded: "已加载",
    loading: "正在读取能力",
    empty: "没有匹配的能力"
  } : {
    title: "Add to conversation",
    search: "Search files, Agents, Skills, and connections",
    local: "Local input",
    files: "Add files",
    filesHelp: "Images and files",
    folder: "Add folder",
    folderHelp: "Use a folder as context",
    agents: "OPL agents",
    oplCapabilities: "OPL capabilities",
    skills: "Skills",
    connections: "Apps and connections",
    loaded: "Loaded",
    loading: "Loading capabilities",
    empty: "No matching capabilities"
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOrTrapFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = focusableElements(rootRef.current);
        if (focusable.length === 0) {
          event.preventDefault();
          rootRef.current?.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (!rootRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("keydown", closeOrTrapFocus);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOrTrapFocus);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open, onClose]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const skills = useMemo(() => {
    const seenSkillNames = new Set<string>();
    return catalog.skills.filter((skill) => {
      const key = skill.name.toLocaleLowerCase();
      if (!skill.enabled || seenSkillNames.has(key)) return false;
      const matches = [skill.name, skill.description]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      if (matches) seenSkillNames.add(key);
      return matches;
    });
  }, [catalog.skills, normalizedQuery]);
  const agents = useMemo(() => standardAgents.filter((agent) =>
    [agent.name, agent.description, agent.selection.packageId, agent.selection.route?.codexVisibleEntry ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
  ), [normalizedQuery, standardAgents]);
  const visibleOplCapabilities = useMemo(() => oplCapabilities.filter((capability) =>
    [capability.name, capability.description, capability.id]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
  ), [normalizedQuery, oplCapabilities]);
  const connections = useMemo(() => [...catalog.plugins, ...catalog.apps]
    .filter((item, index, items) => item.enabled && items.findIndex((candidate) => candidate.id === item.id) === index)
    .filter((item) => [item.name, item.description].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))), [catalog.apps, catalog.plugins, normalizedQuery]);
  const localVisible = !normalizedQuery || [copy.files, copy.filesHelp, copy.folder, copy.folderHelp]
    .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));

  if (!open) return null;
  return (
    <div ref={rootRef} className="composer-palette" role="dialog" aria-modal="true" aria-label={copy.title} tabIndex={-1}>
      <header>
        <strong>{copy.title}</strong>
        <Button
          variant="ghost"
          size="sm"
          aria-label={locale === "zh" ? "关闭" : "Close"}
          icon={<X aria-hidden="true" size={14} />}
          onClick={onClose}
        />
      </header>
      <Input
        className="composer-palette-search"
        icon={<Search aria-hidden="true" size={14} />}
        value={query}
        placeholder={copy.search}
        aria-label={copy.search}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="composer-palette-scroll">
        {localVisible ? (
          <section>
            <strong className="composer-palette-group">{copy.local}</strong>
            <Button variant="ghost" className="composer-palette-row" onClick={onPickFiles}>
              <span className="composer-palette-icon"><FilePlus2 aria-hidden="true" size={16} /></span>
              <span><strong>{copy.files}</strong><small>{copy.filesHelp}</small></span>
            </Button>
            <Button variant="ghost" className="composer-palette-row" onClick={onPickDirectory}>
              <span className="composer-palette-icon"><FolderPlus aria-hidden="true" size={16} /></span>
              <span><strong>{copy.folder}</strong><small>{copy.folderHelp}</small></span>
            </Button>
          </section>
        ) : null}
        {status === "loading" ? <p className="composer-palette-state">{copy.loading}</p> : null}
        {agents.length ? (
          <section data-testid="opl-standard-agents">
            <strong className="composer-palette-group">{copy.agents}</strong>
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.id;
              return (
                <Button key={agent.id} variant="ghost" className="composer-palette-row" aria-pressed={selected} onClick={() => onSelectAgent(agent)}>
                  <span className="composer-palette-icon"><Bot aria-hidden="true" size={16} /></span>
                  <span><strong>{agent.name}</strong><small>{agent.description}</small></span>
                  {selected ? <Check aria-hidden="true" size={15} /> : null}
                </Button>
              );
            })}
          </section>
        ) : null}
        {visibleOplCapabilities.length ? (
          <section data-testid="opl-capability-shortcuts">
            <strong className="composer-palette-group">{copy.oplCapabilities}</strong>
            {visibleOplCapabilities.map((capability) => {
              const selected = selections.some((item) => item.kind === "skill" && item.input.path === capability.skill.path);
              return (
                <Button key={capability.id} variant="ghost" className="composer-palette-row" aria-pressed={selected} onClick={() => onSelectOplCapability(capability)}>
                  <span className="composer-palette-icon"><Sparkles aria-hidden="true" size={16} /></span>
                  <span><strong>{capability.name}</strong><small>{capability.description}</small></span>
                  {selected ? <Check aria-hidden="true" size={15} /> : null}
                </Button>
              );
            })}
          </section>
        ) : null}
        {skills.length ? (
          <section>
            <strong className="composer-palette-group">{copy.skills}</strong>
            {skills.map((skill) => {
              const selected = selections.some((item) => item.kind === "skill" && item.input.path === skill.path);
              return (
                <Button key={skill.path} variant="ghost" className="composer-palette-row" aria-pressed={selected} onClick={() => onToggleSkill(skill)}>
                  <span className="composer-palette-icon"><Sparkles aria-hidden="true" size={16} /></span>
                  <span><strong>{skill.name}</strong><small>{skill.description}</small></span>
                  {selected ? <Check aria-hidden="true" size={15} /> : null}
                </Button>
              );
            })}
          </section>
        ) : null}
        {connections.length ? (
          <section>
            <strong className="composer-palette-group">{copy.connections}</strong>
            {connections.map((item) => (
              <div key={item.id} className="composer-palette-row loaded">
                <span className="composer-palette-icon"><Plug aria-hidden="true" size={16} /></span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                <small className="composer-palette-loaded">{copy.loaded}</small>
              </div>
            ))}
          </section>
        ) : null}
        {contributions ? (
          <section data-testid="opl-composer-contributions">
            <strong className="composer-palette-group">
              {locale === "zh" ? "其他模块" : "Other modules"}
            </strong>
            <div className="opl-contribution-slot">{contributions}</div>
          </section>
        ) : null}
        {status === "error" ? <p className="composer-palette-state error">{error}</p> : null}
        {status !== "loading" && !localVisible && !agents.length && !visibleOplCapabilities.length && !skills.length && !connections.length ? <p className="composer-palette-state">{copy.empty}</p> : null}
      </div>
    </div>
  );
}

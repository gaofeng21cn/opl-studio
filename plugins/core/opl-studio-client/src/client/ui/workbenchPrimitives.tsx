import {
  AlertCircle,
  ClipboardCheck,
  FileCode,
  FileText,
  Info,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShieldQuestion
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  previewKindRendererModuleMap,
  rendererModuleBindings,
  rendererModuleForPreviewKind,
  rendererModuleRegistry,
  rendererPreviewDescriptorForKind
} from "../renderers/moduleRegistry";
import type {
  ActionReceiptSummary as ActionReceiptSummaryModel,
  ArtifactPreview,
  ConfirmationCard as ConfirmationCardModel,
  InterviewQuestion,
  WorkbenchArtifactRef
} from "../workbench/workbenchModel";

const sectionStyle = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 8,
  padding: 12,
  background: "rgba(15, 23, 42, 0.03)"
} as const;

const keyValueGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  margin: "12px 0"
} as const;

const stackedListStyle = {
  display: "grid",
  gap: 8,
  margin: 0,
  paddingLeft: 18
} as const;

const inlineMetaListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  margin: 0,
  padding: 0,
  listStyle: "none"
} as const;

const shellStyle = {
  display: "grid",
  gap: 12
} as const;

const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12
} as const;

const denseCodeStyle = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: "rgba(15, 23, 42, 0.05)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  overflowX: "auto",
  fontSize: "0.82rem",
  lineHeight: 1.55
} as const;

function compactRef(value: string): string {
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

function refsOnlyBoundaryText(preview: ArtifactPreview): string {
  return preview.authorityBoundary
    ?? `${preview.title} stays refs-only. The workbench renders a richer local view but does not claim artifact body authority.`;
}

function previewMarkdown(preview: ArtifactPreview): string {
  if (preview.content?.trim()) return preview.content;
  return [
    `### ${preview.title}`,
    "",
    preview.summary,
    "",
    ...(preview.fields?.map((field) => `- ${field.label}: ${field.value}`) ?? []),
    ...(preview.bullets?.length ? ["", "#### Notes", ...preview.bullets.map((item) => `- ${item}`)] : []),
    "",
    `- Ref: \`${compactRef(preview.ref)}\``,
    ...(preview.sourceRefs?.slice(0, 3).map((ref) => `- Source: \`${compactRef(ref)}\``) ?? []),
    `- Boundary: ${refsOnlyBoundaryText(preview)}`
  ].join("\n");
}

function mermaidSource(preview: ArtifactPreview): string {
  if (preview.traceSteps?.length) {
    const steps = preview.traceSteps.slice(0, 6).map((step, index) => ({
      id: `s${index}`,
      label: step.replaceAll('"', "'")
    }));
    return [
      "flowchart TD",
      ...steps.map((step) => `  ${step.id}["${step.label}"]`),
      ...steps.slice(1).map((step, index) => `  s${index} --> ${step.id}`)
    ].join("\n");
  }
  const refLabel = compactRef(preview.ref).replaceAll('"', "'");
  const titleLabel = preview.title.replaceAll('"', "'");
  return [
    "flowchart LR",
    `  ref["Ref<br/>${refLabel}"] --> preview["${titleLabel}"]`,
    '  preview --> summary["Refs-only preview shell"]',
    '  summary --> boundary["No artifact body authority"]'
  ].join("\n");
}

function previewCode(preview: ArtifactPreview): string {
  if (preview.content?.trim()) return preview.content;
  return [
    "export const previewRef = {",
    `  title: ${JSON.stringify(preview.title)},`,
    `  previewKind: ${JSON.stringify(preview.previewKind)},`,
    `  rendererModuleId: ${JSON.stringify(preview.rendererModuleId)},`,
    `  ref: ${JSON.stringify(preview.ref)},`,
    `  summary: ${JSON.stringify(preview.summary)},`,
    `  sourceRefs: ${JSON.stringify(preview.sourceRefs ?? [], null, 2)},`,
    '  authorityBoundary: "refs-only preview; no artifact body ownership"',
    "};"
  ].join("\n");
}

function previewJson(preview: ArtifactPreview): string {
  if (preview.content?.trim()) return preview.content;
  return JSON.stringify({
    title: preview.title,
    preview_kind: preview.previewKind,
    renderer_module: preview.rendererModuleId,
    ref: preview.ref,
    summary: preview.summary,
    fields: preview.fields ?? [],
    source_refs: preview.sourceRefs ?? [],
    authority_boundary: "refs-only preview"
  }, null, 2);
}

function previewFormula(preview: ArtifactPreview): string {
  const title = preview.title.replace(/[\\{}]/g, "");
  return String.raw`\displaylines{\text{${title}}\\\mathrm{preview(ref)} \neq \mathrm{artifact\ authority}}`;
}

function PreviewMeta({ preview }: { preview: ArtifactPreview }) {
  const descriptor = rendererPreviewDescriptorForKind(preview.previewKind);
  const moduleRegistration = rendererModuleForPreviewKind(preview.previewKind);
  return (
    <section style={sectionStyle}>
      <div style={panelHeaderStyle}>
        <strong>{descriptor.surface}</strong>
        <StatusPill status={preview.label || descriptor.label} />
      </div>
      <p>{descriptor.refsOnlyNote}</p>
      <dl style={keyValueGridStyle}>
        {preview.fields?.map((field) => (
          <div key={`${preview.id}-${field.label}`}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
        <div>
          <dt>Renderer</dt>
          <dd>{preview.rendererModuleId}</dd>
        </div>
        <div>
          <dt>Ref</dt>
          <dd><code>{preview.ref}</code></dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>{moduleRegistration?.authorityBoundary ?? "Refs-only preview"}</dd>
        </div>
      </dl>
      {preview.sourceRefs?.length ? (
        <>
          <p><strong>Source refs</strong></p>
          <ul style={stackedListStyle}>
            {preview.sourceRefs.slice(0, 4).map((ref) => (
              <li key={`${preview.id}-${ref}`}><code>{compactRef(ref)}</code></li>
            ))}
          </ul>
        </>
      ) : null}
      {preview.bullets?.length ? (
        <>
          <p><strong>Preview notes</strong></p>
          <ul style={stackedListStyle}>
            {preview.bullets.map((item) => <li key={`${preview.id}-${item}`}>{item}</li>)}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function MarkdownPreview({ preview }: { preview: ArtifactPreview }) {
  const Streamdown = rendererModuleBindings.streamdown.Streamdown;
  return (
    <section style={shellStyle}>
      <div style={sectionStyle}>
        <Streamdown mode="static">{previewMarkdown(preview)}</Streamdown>
      </div>
      <PreviewMeta preview={preview} />
    </section>
  );
}

function MathPreview({ preview }: { preview: ArtifactPreview }) {
  const markup = useMemo(
    () => rendererModuleBindings.katex.renderToString(previewFormula(preview), {
      displayMode: true,
      output: "mathml",
      throwOnError: false
    }),
    [preview]
  );

  return (
    <section style={shellStyle}>
      <div style={sectionStyle}>
        <div dangerouslySetInnerHTML={{ __html: markup }} />
        <p>{preview.summary}</p>
      </div>
      <PreviewMeta preview={preview} />
    </section>
  );
}

function MermaidPreview({ preview }: { preview: ArtifactPreview }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chartId = useId().replaceAll(":", "-");

  useEffect(() => {
    let active = true;
    type MermaidApi = {
      initialize(config: { startOnLoad: boolean; securityLevel: string; theme: string }): void;
      render(id: string, source: string): Promise<{ svg: string }>;
    };
    const mermaidModule = rendererModuleBindings.mermaid as unknown as Partial<MermaidApi> & {
      default?: MermaidApi;
    };
    const mermaidApi = (mermaidModule.default ?? mermaidModule) as MermaidApi;
    mermaidApi.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
    mermaidApi.render(`preview-${chartId}`, mermaidSource(preview))
      .then((result: { svg: string }) => {
        if (!active) return;
        setSvg(result.svg);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSvg("");
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [chartId, preview]);

  return (
    <section style={shellStyle}>
      <div style={sectionStyle}>
        {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <p>{preview.summary}</p>}
        {error ? (
          <p>
            <AlertCircle aria-hidden="true" size={14} />
            {" "}
            {error}
          </p>
        ) : null}
        {preview.traceSteps?.length ? (
          <ol style={stackedListStyle}>
            {preview.traceSteps.map((step) => <li key={`${preview.id}-${step}`}>{step}</li>)}
          </ol>
        ) : null}
      </div>
      <PreviewMeta preview={preview} />
    </section>
  );
}

function CodeMirrorPreview({ preview, content }: { preview: ArtifactPreview; content: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    rootRef.current.replaceChildren();
    const { EditorView, lineNumbers } = rendererModuleBindings.codeMirrorView;
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          lineNumbers(),
          EditorView.theme({
            "&": {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.85rem",
              borderRadius: "8px",
              backgroundColor: "rgba(15, 23, 42, 0.03)"
            },
            ".cm-content": { padding: "12px 0" },
            ".cm-scroller": { overflow: "auto" }
          })
        ]
      }),
      parent: rootRef.current
    });
    return () => view.destroy();
  }, [content]);

  return (
    <section style={shellStyle}>
      <div style={sectionStyle}>
        <div ref={rootRef} />
      </div>
      <PreviewMeta preview={preview} />
    </section>
  );
}

function PdfPreview({ preview }: { preview: ArtifactPreview }) {
  const pdfRef = useMemo(() => {
    const pdfJs = rendererModuleBindings.pdfJs;
    const baseUrl = typeof window !== "undefined" ? window.location.href : "https://preview.local/";
    const resolved = pdfJs.createValidAbsoluteUrl(preview.ref, baseUrl)?.href ?? preview.ref;
    const fileName = pdfJs.getFilenameFromUrl(resolved) || compactRef(preview.ref);
    return { resolved, fileName, version: pdfJs.version };
  }, [preview]);

  return (
    <section style={shellStyle}>
      <div style={sectionStyle}>
        <div style={{ border: "1px solid rgba(148, 163, 184, 0.35)", borderRadius: 8, padding: 16, background: "white", minHeight: 220 }}>
          <strong>{preview.title}</strong>
          <p>{preview.summary}</p>
          <dl style={keyValueGridStyle}>
            <div>
              <dt>File</dt>
              <dd>{pdfRef.fileName}</dd>
            </div>
            <div>
              <dt>Engine</dt>
              <dd>PDF.js {pdfRef.version}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd><code>{pdfRef.resolved}</code></dd>
            </div>
          </dl>
          <p>PDF export preview remains local and refs-only; page truth and final artifact body stay outside this workbench shell.</p>
        </div>
      </div>
      <PreviewMeta preview={preview} />
    </section>
  );
}

function PreviewBody({ preview }: { preview: ArtifactPreview }) {
  if (preview.previewKind === "markdown") return <MarkdownPreview preview={preview} />;
  if (preview.previewKind === "math") return <MathPreview preview={preview} />;
  if (preview.previewKind === "mermaid") return <MermaidPreview preview={preview} />;
  if (preview.previewKind === "json") return <CodeMirrorPreview preview={preview} content={previewJson(preview)} />;
  if (preview.previewKind === "pdf") return <PdfPreview preview={preview} />;
  return <CodeMirrorPreview preview={preview} content={previewCode(preview)} />;
}

export function StatusPill({ status }: { status: string }) {
  return <span className="status-pill">{status.replaceAll("_", " ")}</span>;
}

export function DeliveryCard({ item }: { item: WorkbenchArtifactRef }) {
  const Icon = item.kind === "receipt" ? ReceiptText : item.kind === "deliverable" ? PackageCheck : FileText;
  return (
    <article className="delivery-card" data-kind={item.kind} style={sectionStyle}>
      <header>
        <Icon aria-hidden="true" size={18} />
        <div>
          <h3>{item.title}</h3>
          <StatusPill status={item.status} />
        </div>
      </header>
      <p>{item.summary}</p>
      <dl style={keyValueGridStyle}>
        <dt>Ref</dt>
        <dd><code>{compactRef(item.ref)}</code></dd>
        <dt>Trace</dt>
        <dd>{item.provenance.length ? item.provenance.slice(0, 3).join(" / ") : "No trace refs"}</dd>
      </dl>
      <ul style={inlineMetaListStyle}>
        {item.actions.map((action) => (
          <li key={action}><code>{action}</code></li>
        ))}
      </ul>
    </article>
  );
}

export type QuestionCardProps = {
  question: InterviewQuestion;
};

export function QuestionCard({ question }: QuestionCardProps) {
  return (
    <article data-testid="opl-question-card" className="question-card">
      <header>
        <ShieldQuestion aria-hidden="true" size={18} />
        <h4>{question.question}</h4>
      </header>
      <p>{question.whyItMatters}</p>
      <small>{question.answerType}</small>
    </article>
  );
}

export function ArtifactPreviewCard({ preview }: { preview: ArtifactPreview }) {
  return (
    <article data-testid="opl-artifact-preview-card" className="artifact-preview-card" style={{ display: "grid", gap: 12 }}>
      <header>
        <FileCode aria-hidden="true" size={18} />
        <div>
          <h3>{preview.title}</h3>
          <StatusPill status={preview.previewKind} />
        </div>
      </header>
      <p>{preview.summary}</p>
      <PreviewBody preview={preview} />
    </article>
  );
}

export function ActionReceiptSummary({ receipt }: { receipt: ActionReceiptSummaryModel }) {
  const statusNotes: Record<ActionReceiptSummaryModel["status"], string[]> = {
    preview: [
      "Dry-run route is ready to inspect in the current workbench shell.",
      "Receipt stays separate from real execution until an explicit submit step."
    ],
    payload_required: [
      "The preview lane exists, but it still needs a typed payload before the shell can ask for a receipt.",
      "Use the route and receipt ref below to bind the missing payload fields."
    ],
    unavailable: [
      "The receipt lane is not currently available from App action refs.",
      "Treat this as missing bridge coverage, not as successful execution."
    ]
  };

  return (
    <article data-testid="opl-action-receipt-summary" className="action-receipt-summary" style={{ ...sectionStyle, display: "grid", gap: 12 }}>
      <header>
        <ReceiptText aria-hidden="true" size={18} />
        <div>
          <h3>{receipt.title}</h3>
          <StatusPill status={receipt.status} />
        </div>
      </header>
      <p>{receipt.summary}</p>
      <section style={sectionStyle}>
        <dl style={keyValueGridStyle}>
          <div>
            <dt>Action</dt>
            <dd>{receipt.actionId ? <code>{receipt.actionId}</code> : "No live App action ref"}</dd>
          </div>
          <div>
            <dt>Mutation</dt>
            <dd>{receipt.mutates}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{receipt.owner ?? "opl_app"}</dd>
          </div>
          <div>
            <dt>Receipt ref</dt>
            <dd><code>{compactRef(receipt.receiptRef)}</code></dd>
          </div>
          <div>
            <dt>Payload</dt>
            <dd>{receipt.payloadFields.length ? receipt.payloadFields.join(", ") : "none"}</dd>
          </div>
        </dl>
        <p><strong>Preview route</strong></p>
        <pre style={denseCodeStyle}>{receipt.route ?? "Unavailable until App state provides an action route."}</pre>
        <p><strong>Boundary</strong></p>
        <p>{receipt.authorityBoundary}</p>
      </section>
      <section style={sectionStyle}>
        <h4>Workbench checks</h4>
        <ul style={stackedListStyle}>
          {[...statusNotes[receipt.status], ...receipt.checks].map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      {receipt.sourceRefs.length ? (
        <section style={sectionStyle}>
          <h4>Source refs</h4>
          <ul style={stackedListStyle}>
            {receipt.sourceRefs.map((item) => <li key={item}><code>{compactRef(item)}</code></li>)}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export type ConfirmationCardProps = {
  card: ConfirmationCardModel;
  question: InterviewQuestion;
  onDryRun: (actionId: string, payload: Record<string, unknown>) => void;
};

export function ConfirmationCard({ card, question, onDryRun }: ConfirmationCardProps) {
  return (
    <article data-testid="opl-confirmation-card" className="confirmation-card">
      <header>
        <ClipboardCheck aria-hidden="true" size={18} />
        <div>
          <h3>{card.title}</h3>
          <p>{card.question}</p>
        </div>
      </header>
      <QuestionCard question={question} />
      <section data-testid="opl-interview-card" style={sectionStyle}>
        <h4>Decision note</h4>
        <p>Confirm the action before execution; preview receipts stay separate.</p>
        <p>{card.receipt}</p>
      </section>
      <section style={sectionStyle}>
        <h4>Execution lane</h4>
        <dl style={keyValueGridStyle}>
          <div>
            <dt>Dry-run action</dt>
            <dd>{card.dryRunAction ? <code>{card.dryRunAction}</code> : "No live App action ref"}</dd>
          </div>
          <div>
            <dt>Receipt surface</dt>
            <dd>{card.receipt}</dd>
          </div>
          <div>
            <dt>Rollback</dt>
            <dd>{card.rollback}</dd>
          </div>
        </dl>
      </section>
      <section style={sectionStyle}>
        <h4>Risk</h4>
        <ul style={stackedListStyle}>{card.risks.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section style={sectionStyle}>
        <h4>Will change</h4>
        <ul style={stackedListStyle}>{card.willChange.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section style={sectionStyle}>
        <h4>Will not change</h4>
        <ul style={stackedListStyle}>{card.willNotChange.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <footer style={sectionStyle}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Info aria-hidden="true" size={14} />
          {card.receipt}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RotateCcw aria-hidden="true" size={14} />
          {card.rollback}
        </span>
        <button
          type="button"
          disabled={!card.dryRunAction}
          onClick={() => {
            if (card.dryRunAction) onDryRun(card.dryRunAction, { confirmationId: card.id, questionId: question.id });
          }}
        >
          {card.dryRunAction ? "Preview action" : "Unavailable"}
        </button>
      </footer>
    </article>
  );
}

export function RendererModuleRegistryPanel() {
  return (
    <section data-testid="opl-renderer-module-registry" className="module-registry">
      <h3>Preview engines</h3>
      <p>OSS renderers are registered as candidate adapters only.</p>
      <ul>
        {rendererModuleRegistry.map((module) => (
          <li key={module.id} data-testid="opl-renderer-module-card" style={sectionStyle}>
            <strong>{module.packageName}</strong>
            <p>{module.surface}</p>
            <small>{module.adapter}</small>
            <p>{module.authorityBoundary}</p>
            {module.previewKinds?.length ? <code>{module.previewKinds.join(", ")}</code> : null}
          </li>
        ))}
      </ul>
      <dl style={keyValueGridStyle}>
        {Object.entries(previewKindRendererModuleMap).map(([kind, moduleId]) => (
          <div key={kind} style={sectionStyle}>
            <dt>{kind}</dt>
            <dd>{moduleId}</dd>
            <dd>{rendererPreviewDescriptorForKind(kind as keyof typeof previewKindRendererModuleMap).refsOnlyNote}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import * as CodeMirrorView from "@codemirror/view";
import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixTabs from "@radix-ui/react-tabs";
import * as KaTeX from "katex";
import * as LucideIcons from "lucide-react";
import * as Mermaid from "mermaid";
import * as Streamdown from "streamdown";

const PdfJs = {
  createValidAbsoluteUrl(value: string, baseUrl?: string) {
    try {
      return new URL(value, baseUrl);
    } catch {
      return null;
    }
  },
  getFilenameFromUrl(value: string) {
    try {
      const pathname = new URL(value, "https://preview.local/").pathname;
      const parts = pathname.split("/").filter(Boolean);
      return parts.at(-1) ?? "";
    } catch {
      return "";
    }
  },
  version: "deferred-preview-adapter"
} as const;

export const rendererModuleBindings = {
  codeMirrorView: CodeMirrorView,
  radixDialog: RadixDialog,
  radixTabs: RadixTabs,
  katex: KaTeX,
  lucideIcons: LucideIcons,
  mermaid: Mermaid,
  pdfJs: PdfJs,
  streamdown: Streamdown
} as const;

export type RendererModuleRegistration = {
  id: string;
  packageName: string;
  surface: string;
  adapter: string;
  previewKinds?: RendererPreviewKind[];
  evidenceTestId: string;
  authorityBoundary: string;
};

export type RendererPreviewKind = "markdown" | "pdf" | "code" | "mermaid" | "math" | "json";

export type RendererPreviewDescriptor = {
  label: string;
  surface: string;
  refsOnlyNote: string;
};

export const previewKindRendererModuleMap: Record<RendererPreviewKind, string> = {
  markdown: "streamdown",
  math: "katex",
  mermaid: "mermaid",
  code: "@codemirror/view",
  json: "@codemirror/view",
  pdf: "pdfjs-dist"
};

export const rendererPreviewDescriptors: Record<RendererPreviewKind, RendererPreviewDescriptor> = {
  markdown: {
    label: "Markdown",
    surface: "Narrative summary and delivery-note preview",
    refsOnlyNote: "Render dense summary prose from refs without claiming artifact body authority."
  },
  math: {
    label: "Math",
    surface: "Formula and methods-note preview",
    refsOnlyNote: "Render equations as local preview only; mathematical output is still refs-only."
  },
  mermaid: {
    label: "Mermaid",
    surface: "Trace and owner-route preview",
    refsOnlyNote: "Diagram structure comes from refs and boundaries, not domain truth ownership."
  },
  code: {
    label: "Code",
    surface: "Read-only manifest, patch, and code reference preview",
    refsOnlyNote: "Show formatted code-like refs only; no executable or authoritative artifact body is transferred."
  },
  json: {
    label: "JSON",
    surface: "Structured receipt and payload-envelope preview",
    refsOnlyNote: "Preview machine-readable refs in a read-only slot."
  },
  pdf: {
    label: "PDF",
    surface: "Local export-preview shell",
    refsOnlyNote: "Present the local preview route and file ref only; page truth stays outside this shell."
  }
};

export function rendererModuleIdForPreviewKind(previewKind: RendererPreviewKind): string {
  return previewKindRendererModuleMap[previewKind];
}

export function rendererPreviewDescriptorForKind(previewKind: RendererPreviewKind): RendererPreviewDescriptor {
  return rendererPreviewDescriptors[previewKind];
}

export const rendererModuleRegistry: RendererModuleRegistration[] = [
  {
    id: "radix-tabs",
    packageName: "@radix-ui/react-tabs",
    surface: "Artifact preview tabs",
    adapter: "Tabs.Root/List/Trigger/Content",
    evidenceTestId: "opl-artifact-preview-tabs",
    authorityBoundary: "UI primitive only"
  },
  {
    id: "radix-dialog",
    packageName: "@radix-ui/react-dialog",
    surface: "Settings confirmations and thread lifecycle dialogs",
    adapter: "Dialog.Content for explicit user-requested modal actions",
    evidenceTestId: "opl-settings-action-confirmation",
    authorityBoundary: "No release or owner receipt authority"
  },
  {
    id: "lucide-react",
    packageName: "lucide-react",
    surface: "Workbench action icons",
    adapter: "Icon components inside action buttons and cards",
    evidenceTestId: "opl-export-action",
    authorityBoundary: "Visual affordance only"
  },
  {
    id: "streamdown",
    packageName: "streamdown",
    surface: "Markdown result preview",
    adapter: "Streaming markdown renderer slot",
    previewKinds: ["markdown"],
    evidenceTestId: "opl-artifact-preview-tabs",
    authorityBoundary: "Refs-only artifact preview"
  },
  {
    id: "katex",
    packageName: "katex",
    surface: "Math preview",
    adapter: "Formula renderer slot",
    previewKinds: ["math"],
    evidenceTestId: "opl-artifact-preview-tabs",
    authorityBoundary: "Refs-only artifact preview"
  },
  {
    id: "mermaid",
    packageName: "mermaid",
    surface: "Diagram preview",
    adapter: "Diagram renderer slot",
    previewKinds: ["mermaid"],
    evidenceTestId: "opl-artifact-preview-tabs",
    authorityBoundary: "Refs-only artifact preview"
  },
  {
    id: "@codemirror/view",
    packageName: "@codemirror/view",
    surface: "Code and diff preview",
    adapter: "EditorView-based read-only code slot",
    previewKinds: ["code", "json"],
    evidenceTestId: "opl-artifact-preview-tabs",
    authorityBoundary: "Refs-only artifact preview"
  },
  {
    id: "pdfjs-dist",
    packageName: "pdfjs-dist",
    surface: "PDF export preview",
    adapter: "PDF.js document preview slot",
    previewKinds: ["pdf"],
    evidenceTestId: "opl-artifact-preview-tabs",
    authorityBoundary: "Local preview only"
  },
  {
    id: "shadcn-compatible",
    packageName: "local shadcn-compatible primitives",
    surface: "Cards, forms, tabs, drawer composition",
    adapter: "Radix primitives plus lucide icons; no shadcn CLI runtime dependency",
    evidenceTestId: "opl-renderer-module-registry",
    authorityBoundary: "Component recipe only"
  }
];

export function rendererModuleForPreviewKind(previewKind: RendererPreviewKind): RendererModuleRegistration | undefined {
  const moduleId = rendererModuleIdForPreviewKind(previewKind);
  return rendererModuleRegistry.find((module) => module.id === moduleId || module.packageName === moduleId);
}

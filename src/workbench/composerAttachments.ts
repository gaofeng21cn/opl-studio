import type { Dispatch, SetStateAction } from "react";
import type { CodexPickedInput, createBrowserBridge } from "../bridge/oplBridge";
import type { ComposerAttachment, ComposerSelection } from "./ComposerCapabilityPalette";
import type { WorkbenchSettings } from "./settingsModel";

function imageMediaType(name: string): string {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "image/jpeg";
}

function pickedSelections(items: CodexPickedInput[], source: ComposerAttachment["source"]): ComposerSelection[] {
  return items.map((item): ComposerSelection => {
    const id = `${item.kind}:${item.path}`;
    return {
      id,
      kind: item.kind,
      label: item.name,
      detail: item.path,
      input: item.kind === "image"
        ? { type: "localImage", path: item.path, detail: "auto" }
        : { type: "mention", name: item.name, path: item.path },
      attachment: {
        id,
        kind: item.kind,
        source,
        name: item.name,
        path: item.path,
        status: "ready",
        progress: 1,
        ...(item.cleanupToken ? { cleanupToken: item.cleanupToken } : {}),
        ...(item.previewUrl ? {
          previewUrl: item.previewUrl,
          previewFile: new File([], item.name, { type: imageMediaType(item.name) })
        } : {})
      }
    };
  });
}

export function disposeSelectionPreviews(selections: readonly ComposerSelection[]) {
  for (const selection of selections) {
    const previewUrl = selection.attachment?.previewUrl;
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }
}


export function createComposerAttachmentController({ bridge, locale, setComposerSelections }: {
  bridge: Pick<ReturnType<typeof createBrowserBridge>, "releaseInputs" | "resolveDroppedInputs">;
  locale: WorkbenchSettings["locale"];
  setComposerSelections: Dispatch<SetStateAction<ComposerSelection[]>>;
}) {
  function addPickedInputs(items: CodexPickedInput[], source: ComposerAttachment["source"] = "picker") {
    const selections = pickedSelections(items, source);
    setComposerSelections((current) => [
      ...current,
      ...selections.filter((selection) => !current.some((item) => item.id === selection.id))
    ]);
  }

  function releaseComposerSelections(selections: readonly ComposerSelection[]) {
    disposeSelectionPreviews(selections);
    const cleanupTokens = selections.flatMap((selection) => selection.attachment?.cleanupToken ? [selection.attachment.cleanupToken] : []);
    if (cleanupTokens.length) void bridge.releaseInputs(cleanupTokens).catch(() => undefined);
  }

  function removeComposerSelection(id: string) {
    setComposerSelections((current) => {
      const selected = current.find((item) => item.id === id);
      const cleanupToken = selected?.attachment?.cleanupToken;
      const removed = current.filter((item) => item.id === id || (cleanupToken && item.attachment?.cleanupToken === cleanupToken));
      releaseComposerSelections(removed);
      return current.filter((item) => !removed.includes(item));
    });
  }

  function stageComposerFiles(files: readonly File[], source: "paste" | "drop"): string | null {
    if (!files.length) return null;
    const oversized = files.find((file) => file.size > 30 * 1024 * 1024);
    if (oversized) return locale === "zh" ? `${oversized.name} 超过 30 MiB。` : `${oversized.name} exceeds 30 MiB.`;
    const batchId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pending = files.map((file, index): ComposerSelection => {
      const id = `${batchId}-${index}`;
      const image = file.type.startsWith("image/");
      const previewUrl = image ? URL.createObjectURL(file) : undefined;
      return {
        id,
        kind: image ? "image" : "file",
        label: file.name,
        detail: locale === "zh" ? "正在准备" : "Preparing",
        input: image ? { type: "localImage", path: "", detail: "auto" } : { type: "mention", name: file.name, path: "" },
        attachment: {
          id,
          kind: image ? "image" : "file",
          source,
          name: file.name,
          path: "",
          status: "pending",
          progress: 0,
          ...(previewUrl ? { previewUrl, previewFile: file } : {})
        }
      };
    });
    setComposerSelections((current) => current.concat(pending));
    void bridge.resolveDroppedInputs(files).then((items) => {
      const ready = pickedSelections(items, source);
      setComposerSelections((current) => {
        const withoutPending = current.filter((item) => !pending.some((candidate) => candidate.id === item.id));
        disposeSelectionPreviews(pending);
        return withoutPending.concat(ready.filter((selection) => !withoutPending.some((item) => item.id === selection.id)));
      });
    }).catch((error) => {
      setComposerSelections((current) => current.map((item) => pending.some((candidate) => candidate.id === item.id)
        ? {
            ...item,
            detail: String(error),
            attachment: item.attachment ? { ...item.attachment, status: "error", error: String(error) } : undefined
          }
        : item));
    });
    return null;
  }


  return { addPickedInputs, releaseComposerSelections, removeComposerSelection, stageComposerFiles };
}

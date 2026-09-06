import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection, createEditor, SKIP_DOM_SELECTION_TAG } from "lexical";
import { registerPlainText } from "@lexical/plain-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { mergeRegister } from "@lexical/utils";

const projectionTag = "opl-prompt-projection";

export function useComposerEditor(prompt: string, updatePrompt: (text: string) => void, threadId: string | null | undefined) {
  const updateRef = useRef(updatePrompt);
  updateRef.current = updatePrompt;
  const [editor] = useState(() => createEditor({
    namespace: "opl-studio-composer",
    onError: (error) => { throw error; }
  }));

  useLayoutEffect(() => mergeRegister(
    registerPlainText(editor),
    editor.registerUpdateListener(({ editorState, tags, dirtyElements, dirtyLeaves }) => {
      if (tags.has(projectionTag) || (dirtyElements.size === 0 && dirtyLeaves.size === 0)) return;
      updateRef.current(editorState.read(() => $getRoot().getTextContent()));
    })
  ), [editor]);

  // Undo belongs to the visible draft and must not restore another thread's text.
  useEffect(() => registerHistory(editor, createEmptyHistoryState(), 300), [editor, threadId]);

  useLayoutEffect(() => {
    if (editor.getEditorState().read(() => $getRoot().getTextContent()) === prompt) return;
    editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      prompt.split("\n").forEach((line, index) => {
        if (index > 0) paragraph.append($createLineBreakNode());
        if (line) paragraph.append($createTextNode(line));
      });
      root.clear().append(paragraph);
    }, { tag: [projectionTag, SKIP_DOM_SELECTION_TAG], discrete: true });
  }, [editor, prompt]);

  return {
    editor,
    paste: (text: string) => editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertRawText(text);
    })
  };
}

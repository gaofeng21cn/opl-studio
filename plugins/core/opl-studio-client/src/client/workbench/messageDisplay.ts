const codexUiDirectiveNames = new Set([
  "code-comment",
  "created-thread",
  "git-commit",
  "git-create-branch",
  "git-create-pr",
  "git-push",
  "git-stage"
]);
const markdownFenceRunPattern = /^[ \t]{0,3}(`{3,}|~{3,})/;
const markdownFenceClosePattern = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;
const codexUiDirectivePattern = /^::([a-z][a-z0-9-]*)\{.*\}$/;

type MarkdownFence = {
  marker: "`" | "~";
  length: number;
};

function fenceStart(line: string): MarkdownFence | null {
  const match = line.match(markdownFenceRunPattern);
  if (!match) return null;
  const run = match[1];
  return { marker: run[0] as MarkdownFence["marker"], length: run.length };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const match = line.match(markdownFenceClosePattern);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function isCodexUiDirective(line: string): boolean {
  const match = line.trim().match(codexUiDirectivePattern);
  return Boolean(match && codexUiDirectiveNames.has(match[1]));
}

export function assistantDisplayMarkdown(markdown: string): string {
  let fence: MarkdownFence | null = null;
  const visibleLines: string[] = [];

  for (const line of markdown.split("\n")) {
    if (fence) {
      visibleLines.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    const openingFence = fenceStart(line);
    if (openingFence) {
      fence = openingFence;
      visibleLines.push(line);
      continue;
    }

    if (!isCodexUiDirective(line)) visibleLines.push(line);
  }

  return visibleLines.join("\n").trimEnd();
}

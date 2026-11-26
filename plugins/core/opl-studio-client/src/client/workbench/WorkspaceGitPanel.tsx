import { useEffect, useState } from 'react';
import type { ThreadWorkspaceGit } from '../bridge/oplBridge';

export function WorkspaceGitPanel({ threadId, locale, readGit }: {
  threadId: string | null; locale: 'zh' | 'en'; readGit(request: { threadId: string }): Promise<ThreadWorkspaceGit>;
}) {
  const [revision, refresh] = useState(0);
  const [result, setResult] = useState<ThreadWorkspaceGit>();
  const [error, setError] = useState('');
  const zh = locale === 'zh';
  useEffect(() => {
    let cancelled = false;
    setResult(undefined); setError('');
    if (threadId) readGit({ threadId }).then(value => { if (!cancelled && value.threadId === threadId) setResult(value); })
      .catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [threadId, revision, readGit]);
  return <section data-testid="opl-workspace-git" className="workspace-git-panel">
    <header><h3>Git</h3><button type="button" disabled={!threadId} onClick={() => refresh(value => value + 1)}>{zh ? '刷新 Git' : 'Refresh Git'}</button></header>
    {!threadId ? <p>{zh ? '新建或打开任务后查看 Git。' : 'Open a task to inspect Git.'}</p> : error ? <p role="alert">{error}</p> : !result ? <p role="status">{zh ? '读取中' : 'Loading'}</p> : result.status === 'unavailable' ? <p>{zh ? 'Git 预览不可用' : 'Git preview unavailable'}: {result.reason}</p> : <>
      <p>{zh ? '当前分支' : 'Branch'}: <strong>{result.branch}</strong></p>
      {(['staged', 'unstaged'] as const).map(group => <details key={group} open>
        <summary>{group === 'staged' ? zh ? '已暂存' : 'Staged' : zh ? '未暂存 / 未跟踪' : 'Unstaged / untracked'}</summary>
        <ul>{result.files?.filter(file => group === 'staged' ? file.index !== ' ' && file.index !== '?' : file.workingTree !== ' ').map(file => <li key={file.path}><code>{file.index}{file.workingTree} {file.path}</code></li>)}</ul>
        <pre>{(group === 'staged' ? result.stagedDiff : result.unstagedDiff) || (zh ? '无文本差异' : 'No text diff')}</pre>
      </details>)}
    </>}
    <p>{zh ? '提交、分支和推送可交给当前 Codex 任务，沿用任务权限；此面板只读，不依赖 gh。' : 'Ask the current Codex task to commit, branch or push with its existing permissions. This read-only panel does not require gh.'}</p>
  </section>;
}

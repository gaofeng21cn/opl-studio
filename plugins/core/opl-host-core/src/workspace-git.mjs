import { execFile } from 'node:child_process';

function runGit(root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return new Promise((resolve, reject) => execFile('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root, env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }, timeout: 5000, maxBuffer: 1024 * 1024,
  }, (error, stdout) => error ? reject(error) : resolve(stdout)));
}

// Fixed read operations only. The renderer cannot supply paths, revisions or arguments.
export async function readWorkspaceGit(root, threadId) {
  try {
    const top = (await runGit(root, ['rev-parse', '--show-toplevel'])).trim();
    if (top !== root) return { threadId, status: 'unavailable', reason: 'workspace_is_not_repository_root' };
    const status = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    const branch = (await runGit(root, ['branch', '--show-current'])).trim() || '(detached HEAD)';
    const records = status.split('\0');
    const files = [];
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      if (!row) continue;
      files.push({ path: row.slice(3), index: row[0], workingTree: row[1], ...(row[0] === 'R' || row[0] === 'C' ? { originalPath: records[++i] } : {}) });
    }
    const options = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames'];
    const stagedDiff = await runGit(root, ['diff', '--cached', ...options, '--', '.']);
    const unstagedDiff = await runGit(root, ['diff', ...options, '--', '.']);
    return { threadId, status: 'available', branch, files, stagedDiff, unstagedDiff };
  } catch (error) {
    return { threadId, status: 'unavailable', reason: error.code === 'ENOENT' ? 'git_not_installed' : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'git_output_exceeds_preview_limit' : error.killed ? 'git_read_timeout' : 'git_read_failed_or_not_repository' };
  }
}

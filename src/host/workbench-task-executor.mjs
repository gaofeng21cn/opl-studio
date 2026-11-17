import { turnPermissionOverrides } from './app-server-transport.mjs';

export function createWorkbenchTaskExecutor(transport) {
  return Object.freeze({
    async createThread(task) {
      if (![':read-only', ':workspace'].includes(task.permissions)) throw Error('Scheduled tasks require explicit restricted permissions.');
      const response = await transport.startThread({ cwd: task.cwd, model: task.model, permissions: task.permissions });
      if (!response.thread?.id) throw Error('Canonical thread/start returned no ID.');
      // Rename failure must not lose the newly created canonical thread reference.
      await transport.renameThread(response.thread.id, task.title).catch(() => undefined);
      return { threadId: response.thread.id };
    },
    async startTask(task, { threadId }) {
      if (![':read-only', ':workspace'].includes(task.permissions)) throw Error('Scheduled tasks require explicit restricted permissions.');
      const response = await transport.startTurn(threadId, task.prompt, [], {
        cwd: task.cwd, ...turnPermissionOverrides(task.permissions, task.cwd),
        ...(task.model ? { model: task.model } : {}),
        ...(task.reasoningEffort ? { effort: task.reasoningEffort } : {}),
      });
      if (!response.turn?.id) throw Error('Canonical turn/start returned no ID; inspect the task before retrying.');
      return { threadId, turnId: response.turn.id };
    },
    async readTask(ref) {
      const response = await transport.readThread(ref.threadId, true);
      if (response.thread?.id !== ref.threadId) throw Error('Canonical thread mismatch.');
      const turn = response.thread.turns?.find(row => row.id === ref.turnId);
      if (!turn) throw Error('Canonical turn is absent.');
      const messages = turn.items?.filter(item => item.type === 'agentMessage');
      return { ...ref, status: turn.status, summary: messages?.at(-1)?.text?.slice(0, 2000) };
    },
    async interruptTask(ref) {
      if (!ref.turnId) {
        const response = await transport.readThread(ref.threadId, true);
        for (const turn of response.thread?.turns ?? []) {
          if (turn.status === 'inProgress') await transport.interruptTurn(ref.threadId, turn.id);
        }
        return;
      }
      return transport.interruptTurn(ref.threadId, ref.turnId);
    },
  });
}

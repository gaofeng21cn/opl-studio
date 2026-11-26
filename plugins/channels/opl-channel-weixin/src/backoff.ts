import type { Sleep } from './types.js';

export function boundedExponentialBackoffMs(
  consecutiveFailures: number,
  baseMilliseconds: number,
  maxMilliseconds: number,
): number {
  if (!Number.isSafeInteger(consecutiveFailures) || consecutiveFailures < 1) {
    throw new TypeError('consecutiveFailures must be a positive safe integer.');
  }
  if (!Number.isFinite(baseMilliseconds) || baseMilliseconds <= 0) {
    throw new TypeError('baseMilliseconds must be positive.');
  }
  if (!Number.isFinite(maxMilliseconds) || maxMilliseconds < baseMilliseconds) {
    throw new TypeError('maxMilliseconds must be at least baseMilliseconds.');
  }
  const exponent = Math.min(consecutiveFailures - 1, 52);
  return Math.min(maxMilliseconds, baseMilliseconds * 2 ** exponent);
}

export const abortableSleep: Sleep = async (milliseconds, signal) => {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

function abortError(): Error {
  const error = new Error('Operation aborted.');
  error.name = 'AbortError';
  return error;
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativeHostOptions, startGuestHostCore } from "./guest-host-core.mjs";
import { readHostNodeIdentity } from "./node-host-runtime.mjs";

export function startLocalNodeGuestHost({ input = process.stdin, output = process.stdout, createCore } = {}) {
  if (process.versions.electron) throw new Error("Local Node Host must run in standalone Node");
  return startGuestHostCore({ input, output,
    createCore: async options => {
      if (!createCore) ({ createOplHostCore: createCore } = await import("../src/host/create-host.mjs"));
      return createCore(options);
    },
    prepare: async (payload, native) => {
      const identity = readHostNodeIdentity();
      if (identity.version !== payload.nodeIdentity?.version || identity.sha256 !== payload.nodeIdentity?.sha256) {
        throw new Error("Node Host runtime differs from the Framework-selected executable");
      }
      return { options: { ...payload.options, ...nativeHostOptions(native) }, readback: { nodeHostIdentity: identity } };
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of ["log", "info", "debug"]) console[name] = (...args) => console.error(...args);
  const host = startLocalNodeGuestHost();
  const finish = () => { void host.close().finally(() => process.exit(0)); };
  process.stdin.once("end", finish);
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, finish);
}

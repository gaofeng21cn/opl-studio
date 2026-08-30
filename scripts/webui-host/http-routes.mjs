import { ThreadAdapterError } from "./thread-adapter.mjs";
import path from "node:path";
import { serveStatic } from "@deepseek-ai/dsh-host-frontend-static";

function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(value));
}

function errorResponse(res, error) {
  const typed = error instanceof ThreadAdapterError
    ? error
    : new ThreadAdapterError(
        error.code ?? "host_error",
        error.message ?? String(error),
        error.details ?? {},
        502
      );
  json(res, typed.httpStatus ?? 502, {
    error: { code: typed.code, message: typed.message, details: typed.details ?? {} }
  });
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_048_576) {
      throw new ThreadAdapterError("invalid_request", "Request body exceeds 1 MiB", {}, 413);
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ThreadAdapterError("invalid_request", "Request body must be valid JSON", {}, 400);
  }
}

async function dispatchApi(req, res, hostCore) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/api/capabilities") {
    json(res, 200, hostCore.capabilities());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/host/plugins") {
    json(res, 200, await hostCore.invoke("readHostPluginInventory"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/opl/state") {
    json(res, 200, await hostCore.invoke("readState", { profile: url.searchParams.get("profile") ?? "fast" }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/opl/initialize") {
    json(res, 200, await hostCore.invoke("readInitialize"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/opl/drilldown") {
    json(res, 200, await hostCore.invoke("readFullDrilldown"));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/opl/view/read") {
    json(res, 200, await hostCore.invoke("readDomainDetailView", await body(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/opl/contribution/read") {
    json(res, 200, await hostCore.invoke("readContribution", await body(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/opl/action") {
    json(res, 200, await hostCore.invoke("executeAction", await body(req)));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/codex/models") {
    json(res, 200, await hostCore.invoke("readCodexModels"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/codex/capabilities") {
    json(res, 200, await hostCore.invoke("readCodexCapabilities", {
      threadId: url.searchParams.get("threadId") ?? undefined
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/codex/permission-profiles") {
    json(res, 200, await hostCore.invoke("readCodexPermissionProfiles"));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/send-message") {
    json(res, 200, await hostCore.invoke("sendMessage", await body(req)));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/codex/pending-requests") {
    json(res, 200, await hostCore.invoke("listPendingServerRequests"));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/codex/respond-request") {
    json(res, 200, await hostCore.invoke("respondToServerRequest", await body(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/turns/steer") {
    json(res, 200, await hostCore.invoke("steerTurn", await body(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/turns/interrupt") {
    json(res, 200, await hostCore.invoke("interruptTurn", await body(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/opl-runtime/gateway-account-login") {
    json(res, 200, await hostCore.invoke("loginGatewayAccount", await body(req)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/opl-runtime/configure-codex") {
    json(res, 200, await hostCore.invoke("configureCodexApiKey", await body(req)));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/native-app-update/status") {
    json(res, 200, await hostCore.invoke("readNativeAppUpdateStatus"));
    return;
  }

  const nativeUpdaterOperation = new Map([
    ["/api/native-app-update/check", "checkNativeAppUpdate"],
    ["/api/native-app-update/apply", "applyNativeAppUpdate"],
    ["/api/native-app-update/restart", "restartNativeApp"]
  ]).get(url.pathname);
  if (req.method === "POST" && nativeUpdaterOperation) {
    await body(req);
    json(res, 200, await hostCore.invoke(nativeUpdaterOperation));
    return;
  }

  const postRoutes = new Map([
    ["/api/threads/list", (value) => hostCore.invoke("listThreads", value)],
    ["/api/threads/read", (value) => hostCore.invoke("readThread", value)],
    ["/api/threads/resume", (value) => hostCore.invoke("resumeThread", value)],
    ["/api/threads/fork", (value) => hostCore.invoke("forkThread", value)],
    ["/api/threads/rename", (value) => hostCore.invoke("renameThread", value)],
    ["/api/threads/delete", (value) => hostCore.invoke("deleteThread", value)],
    ["/api/threads/workspace/list", (value) => hostCore.invoke("listThreadWorkspace", value)],
    ["/api/threads/workspace/read", (value) => hostCore.invoke("readThreadWorkspaceFile", value)],
    ["/api/threads/workspace/search", (value) => hostCore.invoke("searchThreadWorkspace", value)],
    ["/api/threads/archive", (value) => hostCore.invoke("setArchived", { ...value, archived: true })],
    ["/api/threads/unarchive", (value) => hostCore.invoke("setArchived", { ...value, archived: false })]
  ]);
  const route = req.method === "POST" ? postRoutes.get(url.pathname) : undefined;
  if (route) {
    json(res, 200, await route(await body(req)));
    return;
  }

  json(res, 404, {
    error: { code: "endpoint_not_found", message: `Unknown endpoint: ${url.pathname}`, details: {} }
  });
}

function authError(res, result) {
  json(res, result.status, {
    error: { code: result.code, message: result.message, details: {} }
  });
}

export function registerOplHttpRoutes(webServer, hostCore, {
  webAuth,
  stagedInputs,
  webRoot
} = {}) {
  if (!webAuth || !stagedInputs || !webRoot) throw new Error("Web routes require authentication, staged inputs, and web root services");
  const eventClients = new Map();
  let closing = false;

  const emitEvent = (event) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of eventClients.keys()) client.write(frame);
  };
  hostCore.on("event", emitEvent);

  const disposers = [
    webServer.register({
      kind: "exact",
      path: "/healthz",
      handler(_req, res) {
        json(res, closing ? 503 : 200, {
          status: closing ? "stopping" : "ok",
          service: "one-person-lab-headless"
        });
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/readyz",
      handler(_req, res) {
        const capabilities = hostCore.capabilities();
        const ready = !closing && capabilities.appServerAvailable === true;
        json(res, ready ? 200 : 503, {
          status: ready ? "ready" : "not_ready",
          appServerAvailable: capabilities.appServerAvailable,
          appServerError: capabilities.appServerError
        });
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/login",
      handler(_req, res) {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"
        });
        res.end(webAuth.loginHtml());
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/api/auth/login",
      async handler(req, res) {
        if (req.method !== "POST") return json(res, 405, { error: { code: "method_not_allowed", message: "POST required", details: {} } });
        try {
          const value = await body(req);
          if (!webAuth.enabled) return json(res, 200, { authenticated: true, username: "opl", csrfToken: null });
          const result = webAuth.checkLogin(req, value.username, value.password);
          if (!result.ok) return authError(res, result);
          json(res, 200, { authenticated: true, ...webAuth.issueSession(res) });
        } catch (error) {
          errorResponse(res, error);
        }
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/api/auth/user",
      handler(req, res) {
        if (req.method !== "GET") return json(res, 405, { error: { code: "method_not_allowed", message: "GET required", details: {} } });
        const result = webAuth.requireSession(req);
        if (!result.ok) return authError(res, result);
        json(res, 200, { authenticated: true, username: result.session.username, csrfToken: result.session.csrfToken });
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/api/auth/logout",
      handler(req, res) {
        if (req.method !== "POST") return json(res, 405, { error: { code: "method_not_allowed", message: "POST required", details: {} } });
        const result = webAuth.requireSession(req, { csrf: true });
        if (!result.ok) return authError(res, result);
        webAuth.clearSession(res);
        json(res, 200, { authenticated: false });
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/api/opl-events",
      handler(req, res) {
        const auth = webAuth.requireSession(req);
        if (!auth.ok) return authError(res, auth);
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no"
        });
        res.write(`data: ${JSON.stringify({ method: "host/ready", params: hostCore.capabilities().threadAdapter })}\n\n`);
        const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
        eventClients.set(res, heartbeat);
        req.once("close", () => {
          clearInterval(heartbeat);
          eventClients.delete(res);
        });
      }
    }),
    webServer.register({
      kind: "prefix",
      path: "/api",
      async handler(req, res) {
        try {
          const auth = webAuth.requireSession(req, { csrf: !new Set(["GET", "HEAD"]).has(req.method ?? "") });
          if (!auth.ok) return authError(res, auth);
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          const inputMatch = /^\/api\/inputs\/([^/]+)(?:\/(files|complete))?$/.exec(url.pathname);
          if (req.method === "POST" && url.pathname === "/api/inputs") {
            return json(res, 201, await stagedInputs.create(await body(req)));
          }
          if (inputMatch) {
            const [, id, operation] = inputMatch;
            if (req.method === "PUT" && operation === "files") {
              return json(res, 201, await stagedInputs.put(id, url.searchParams.get("path"), req));
            }
            if (req.method === "POST" && operation === "complete") {
              await body(req);
              return json(res, 200, await stagedInputs.complete(id));
            }
            if (req.method === "DELETE" && operation === undefined) {
              await stagedInputs.remove(id);
              return json(res, 200, { id, status: "deleted" });
            }
          }
          await dispatchApi(req, res, hostCore);
        } catch (error) {
          errorResponse(res, error);
        }
      }
    }),
    webServer.registerFallback(async (req, res) => {
      const auth = webAuth.requireSession(req);
      if (!auth.ok) {
        res.writeHead(302, { location: "/login", "cache-control": "no-store" });
        res.end();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const rawPath = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      await serveStatic(
        decodeURIComponent(rawPath),
        res,
        path.resolve(webRoot),
        path.resolve(webRoot, "index.html"),
        async () => webServer.renderIndex(await import("node:fs/promises").then(({ readFile }) => readFile(path.resolve(webRoot, "index.html"), "utf8")))
      );
    })
  ];

  return async () => {
    closing = true;
    hostCore.off("event", emitEvent);
    for (const dispose of disposers.reverse()) dispose();
    for (const [client, heartbeat] of eventClients) {
      clearInterval(heartbeat);
      client.end();
    }
    eventClients.clear();
  };
}

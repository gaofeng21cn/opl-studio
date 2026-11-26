import { randomUUID } from "node:crypto";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let cachedCdpModulePromise = null;

function isMissingModuleError(error, packageName) {
  if (!error || (error.code !== "ERR_MODULE_NOT_FOUND" && error.code !== "MODULE_NOT_FOUND")) {
    return false;
  }
  const message = String(error.message ?? "");
  return message.includes(`'${packageName}'`) || message.includes(`"${packageName}"`) || message.includes(packageName);
}

/** Lazily loads `chrome-remote-interface` when installed, falling back to Node native WebSocket in zero-dep harnesses. */
async function loadChromeRemoteInterface() {
  if (process.env.OPL_CDP_FORCE_NATIVE_FALLBACK === "1") return null;
  if (!cachedCdpModulePromise) {
    cachedCdpModulePromise = import("chrome-remote-interface")
      .then((mod) => mod?.default ?? mod)
      .catch((error) => {
        if (isMissingModuleError(error, "chrome-remote-interface")) return null;
        cachedCdpModulePromise = null;
        throw error;
      });
  }
  return cachedCdpModulePromise;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(1, timeoutMs));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function openNativeCdpClient(webSocketDebuggerUrl, timeoutMs = 30_000) {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("Native CDP fallback requires Node.js global WebSocket support");
  }
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const eventListeners = new Map();
  const disconnectListeners = [];
  let nextId = 0;
  let disconnected = false;
  let settledConnect = false;

  const emitDisconnect = () => {
    if (disconnected) return;
    disconnected = true;
    for (const entry of pending.values()) {
      entry.reject(new Error("CDP socket closed"));
    }
    pending.clear();
    try { socket.close(); } catch {}
    while (disconnectListeners.length > 0) {
      const listener = disconnectListeners.shift();
      try { listener(); } catch {}
    }
  };

  let rejectConnect = null;
  let connectTimer = null;
  const connectPromise = new Promise((resolve, reject) => {
    rejectConnect = (error) => {
      if (settledConnect) return;
      settledConnect = true;
      if (connectTimer) clearTimeout(connectTimer);
      reject(error);
    };
    connectTimer = setTimeout(() => {
      try { socket.close(); } catch {}
      rejectConnect(new Error("timed out opening CDP socket"));
    }, Math.max(1, timeoutMs));

    socket.onopen = () => {
      if (settledConnect) return;
      settledConnect = true;
      clearTimeout(connectTimer);
      resolve();
    };
    socket.onerror = () => {
      rejectConnect(new Error("CDP socket closed"));
      emitDisconnect();
    };
    socket.onclose = () => {
      rejectConnect(new Error("CDP socket closed"));
      emitDisconnect();
    };
  });

  socket.onmessage = async (event) => {
    let raw = event?.data;
    if (raw instanceof ArrayBuffer) {
      raw = Buffer.from(raw).toString("utf8");
    } else if (raw && typeof raw.text === "function") {
      raw = await raw.text();
    }
    let message;
    try {
      message = JSON.parse(String(raw ?? ""));
    } catch {
      return;
    }
    if (typeof message?.id === "number") {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(JSON.stringify(message.error)));
      } else {
        entry.resolve(message.result);
      }
      return;
    }
    if (typeof message?.method === "string") {
      const listeners = eventListeners.get(message.method);
      if (!listeners?.length) return;
      for (const listener of listeners) {
        try { listener(message.params); } catch {}
      }
    }
  };

  await connectPromise;

  const send = (method, params = {}) => {
    if (disconnected) return Promise.reject(new Error("CDP socket closed"));
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  };

  return {
    send,
    Runtime: {
      evaluate: (params) => send("Runtime.evaluate", params),
      exceptionThrown: (listener) => {
        if (typeof listener !== "function") return;
        const listeners = eventListeners.get("Runtime.exceptionThrown") ?? [];
        listeners.push(listener);
        eventListeners.set("Runtime.exceptionThrown", listeners);
      }
    },
    Page: {
      captureScreenshot: (params) => send("Page.captureScreenshot", params)
    },
    once(event, listener) {
      if (event !== "disconnect" || typeof listener !== "function") return;
      if (disconnected) {
        queueMicrotask(listener);
        return;
      }
      disconnectListeners.push(listener);
    },
    close() {
      emitDisconnect();
      return Promise.resolve();
    }
  };
}

async function pageTarget(port, timeoutMs = 5_000) {
  const CDP = await loadChromeRemoteInterface();
  let targets;
  if (CDP) {
    targets = await withTimeout(
      CDP.List({ host: "127.0.0.1", port }),
      timeoutMs,
      `timed out listing CDP targets on ${port}`
    );
  } else {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(Math.max(1, timeoutMs))
    });
    if (!response.ok) throw new Error(`CDP target lookup failed with HTTP ${response.status}`);
    targets = await response.json();
  }
  return Array.isArray(targets)
    ? targets.find((target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    : undefined;
}

export async function waitForPageTarget({ port, timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const target = await pageTarget(port, Math.min(5_000, Math.max(250, deadline - Date.now())));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`timed out waiting for a CDP page on ${port}${lastError ? `: ${lastError.message}` : ""}`);
}

async function openPageClient({ port, timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const target = await waitForPageTarget({ port, timeoutMs });
  const remaining = Math.max(250, deadline - Date.now());
  const CDP = await loadChromeRemoteInterface();
  if (!CDP) {
    const client = await openNativeCdpClient(target.webSocketDebuggerUrl, remaining);
    return { client, deadline };
  }
  let timedOut = false;
  const connectPromise = CDP({
    host: "127.0.0.1",
    port,
    target: target.webSocketDebuggerUrl,
    local: true
  }).then((client) => {
    if (timedOut) client.close().catch(() => {});
    return client;
  });
  const client = await withTimeout(connectPromise, remaining, "timed out opening CDP socket").catch((error) => {
    timedOut = true;
    throw error;
  });
  return { client, deadline };
}

/** One CDP session reused for evaluation, DOM file input, events, and screenshots. */
export class CdpSession {
  constructor(client) {
    this.client = client;
    this.closed = false;
    client.once("disconnect", () => {
      this.closed = true;
    });
  }

  static async connect(port, timeoutMs = 60_000) {
    const { client } = await openPageClient({ port, timeoutMs });
    return new CdpSession(client);
  }

  async send(method, params = {}, timeoutMs = 30_000) {
    if (this.closed) throw new Error("CDP socket closed");
    return withTimeout(
      this.client.send(method, params),
      timeoutMs,
      `timed out running ${method}`
    ).catch((error) => {
      if (this.closed || /WebSocket connection closed/i.test(error?.message ?? "")) {
        throw new Error("CDP socket closed");
      }
      throw error;
    });
  }

  async evaluate(expression, timeoutMs = 30_000, { userGesture = true } = {}) {
    if (!expression) throw new Error("CDP expression is required");
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture
    }, timeoutMs);
    if (result?.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? JSON.stringify(result.exceptionDetails)
      );
    }
    return result?.result?.value;
  }

  async waitFor(expression, { timeoutMs = 20_000, description = expression } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.evaluate(expression);
      if (value) return value;
      await delay(250);
    }
    throw new Error(`timed out waiting for ${description}`);
  }

  async setFileInput(selector, files) {
    const document = await this.send("DOM.getDocument", { depth: -1, pierce: true });
    const found = await this.send("DOM.querySelector", { nodeId: document.root.nodeId, selector });
    if (!found?.nodeId) throw new Error(`no file input matched ${selector}`);
    await this.send("DOM.setFileInputFiles", { nodeId: found.nodeId, files });
  }

  onExceptionThrown(listener) {
    this.client.Runtime.exceptionThrown(listener);
  }

  close() {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    return this.client.close().catch(() => {});
  }
}

export async function waitForPageReady({ port, timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await evaluatePage({
        port,
        expression: "({readyState:document.readyState,root:!!document.getElementById('root'),bridge:!!window.oplStudio})",
        timeoutMs: Math.min(5_000, Math.max(500, deadline - Date.now()))
      });
      if (lastValue?.readyState === "complete" && lastValue.root === true && lastValue.bridge === true) return lastValue;
    } catch {}
    await delay(250);
  }
  throw new Error(`timed out waiting for the Studio page to become ready: ${JSON.stringify(lastValue)}`);
}

export async function evaluatePage({ port, expression, timeoutMs = 30_000 } = {}) {
  if (!expression) throw new Error("CDP expression is required");
  const { client, deadline } = await openPageClient({ port, timeoutMs });
  try {
    const result = await withTimeout(
      client.Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true }),
      Math.max(250, deadline - Date.now()),
      "timed out evaluating CDP expression"
    );
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "CDP expression failed");
    }
    return result?.result?.value;
  } finally {
    await client.close().catch(() => {});
  }
}

export async function evaluatePageStable({
  port,
  expression,
  timeoutMs = 30_000,
  evaluate = evaluatePage,
  pollIntervalMs = 100
} = {}) {
  if (!expression) throw new Error("CDP expression is required");
  const requestKey = `opl-studio-qualification-${randomUUID()}`;
  const storeKey = "__oplStudioQualificationRequests";
  const callTimeoutMs = Math.min(5_000, Math.max(500, timeoutMs));
  const startExpression = `(()=>{
    const store=globalThis[${JSON.stringify(storeKey)}]??=Object.create(null);
    const entry={status:"pending",value:undefined,error:null};
    store[${JSON.stringify(requestKey)}]=entry;
    Promise.resolve().then(()=>(${expression})).then(
      (value)=>{entry.status="fulfilled";entry.value=value;},
      (error)=>{entry.status="rejected";entry.error={name:error?.name??"Error",message:error?.message??String(error),code:error?.code??null};}
    );
    return true;
  })()`;
  const pollExpression = `(()=>{
    const store=globalThis[${JSON.stringify(storeKey)}];
    const entry=store?.[${JSON.stringify(requestKey)}];
    if(!entry) return {status:"missing"};
    if(entry.status==="pending") return {status:"pending"};
    const result={status:entry.status,value:entry.value,error:entry.error};
    delete store[${JSON.stringify(requestKey)}];
    return result;
  })()`;
  const cleanupExpression = `(()=>{const store=globalThis[${JSON.stringify(storeKey)}];if(store) delete store[${JSON.stringify(requestKey)}];return true;})()`;
  await evaluate({ port, expression: startExpression, timeoutMs: callTimeoutMs });
  const deadline = Date.now() + timeoutMs;
  let lastPollError = null;
  try {
    while (Date.now() < deadline) {
      let result;
      try {
        result = await evaluate({
          port,
          expression: pollExpression,
          timeoutMs: Math.min(callTimeoutMs, Math.max(500, deadline - Date.now()))
        });
        lastPollError = null;
      } catch (error) {
        lastPollError = error;
        await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
        continue;
      }
      if (result?.status === "fulfilled") return result.value;
      if (result?.status === "rejected") {
        const error = new Error(result.error?.message || "CDP expression failed");
        if (result.error?.code !== null && result.error?.code !== undefined) error.code = result.error.code;
        throw error;
      }
      if (result?.status === "missing") throw new Error("CDP stable evaluation request was lost");
      await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    }
    throw new Error(`timed out evaluating stable CDP expression${lastPollError ? `: ${lastPollError.message}` : ""}`);
  } finally {
    try { await evaluate({ port, expression: cleanupExpression, timeoutMs: callTimeoutMs }); } catch {}
  }
}

export async function capturePageScreenshot({ port, timeoutMs = 30_000 } = {}) {
  const { client, deadline } = await openPageClient({ port, timeoutMs });
  try {
    const result = await withTimeout(
      client.Page.captureScreenshot({ format: "png", fromSurface: true, captureBeyondViewport: false }),
      Math.max(250, deadline - Date.now()),
      "timed out capturing CDP screenshot"
    );
    if (typeof result?.data !== "string" || result.data.length === 0) {
      throw new Error("CDP screenshot did not return image data");
    }
    return Buffer.from(result.data, "base64");
  } finally {
    await client.close().catch(() => {});
  }
}

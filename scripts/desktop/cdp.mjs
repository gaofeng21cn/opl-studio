import { randomUUID } from "node:crypto";
import CDP from "chrome-remote-interface";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(1, timeoutMs));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function pageTarget(port, timeoutMs = 5_000) {
  const targets = await withTimeout(
    CDP.List({ host: "127.0.0.1", port }),
    timeoutMs,
    `timed out listing CDP targets on ${port}`
  );
  return targets.find((target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string");
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

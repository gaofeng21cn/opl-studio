import { randomUUID } from "node:crypto";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function pageTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP target lookup failed with HTTP ${response.status}`);
  const targets = await response.json();
  return targets.find((target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string");
}

export async function waitForPageTarget({ port, timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const target = await pageTarget(port);
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`timed out waiting for a CDP page on ${port}${lastError ? `: ${lastError.message}` : ""}`);
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
  const target = await waitForPageTarget({ port, timeoutMs });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  const close = () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("CDP socket closed"));
    }
    pending.clear();
    try { socket.close(); } catch {}
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const settle = pending.get(message.id);
    if (!settle) return;
    pending.delete(message.id);
    clearTimeout(settle.timer);
    if (message.error) settle.reject(new Error(JSON.stringify(message.error)));
    else settle.resolve(message.result);
  };
  socket.onerror = () => close();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out opening CDP socket")), timeoutMs);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  const result = await new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("timed out evaluating CDP expression"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true }
    }));
  });
  try {
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "CDP expression failed");
    }
    return result?.result?.value;
  } finally {
    close();
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
  const target = await waitForPageTarget({ port, timeoutMs });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  const close = () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("CDP socket closed"));
    }
    pending.clear();
    try { socket.close(); } catch {}
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const settle = pending.get(message.id);
    if (!settle) return;
    pending.delete(message.id);
    clearTimeout(settle.timer);
    if (message.error) settle.reject(new Error(JSON.stringify(message.error)));
    else settle.resolve(message.result);
  };
  socket.onerror = () => close();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out opening CDP socket")), timeoutMs);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  try {
    const result = await new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("timed out capturing CDP screenshot"));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({
        id,
        method: "Page.captureScreenshot",
        params: { format: "png", fromSurface: true, captureBeyondViewport: false }
      }));
    });
    if (typeof result?.data !== "string" || result.data.length === 0) {
      throw new Error("CDP screenshot did not return image data");
    }
    return Buffer.from(result.data, "base64");
  } finally {
    close();
  }
}

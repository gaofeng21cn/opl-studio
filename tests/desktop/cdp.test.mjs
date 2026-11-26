import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { WebSocketServer } from "ws";

import {
  CdpSession,
  capturePageScreenshot,
  evaluatePage,
  evaluatePageStable,
  waitForPageTarget
} from "../../scripts/desktop/cdp.mjs";

test("stable CDP evaluation anchors a page promise and polls its result", async () => {
  const expressions = [];
  let polls = 0;
  const value = await evaluatePageStable({
    port: 9222,
    expression: "window.oplStudio.readState(\"fast\")",
    timeoutMs: 1_000,
    pollIntervalMs: 0,
    evaluate: async ({ expression }) => {
      expressions.push(expression);
      if (expression.includes('return {status:"missing"}')) {
        polls += 1;
        return polls === 1 ? { status: "pending" } : { status: "fulfilled", value: { profile: "fast" } };
      }
      return true;
    }
  });
  assert.deepEqual(value, { profile: "fast" });
  assert.ok(expressions[0].includes("__oplStudioQualificationRequests"));
  assert.ok(expressions[0].includes('window.oplStudio.readState("fast")'));
  assert.ok(expressions.at(-1).includes("delete store"));
});

test("stable CDP evaluation returns the page-side rejection", async () => {
  await assert.rejects(
    evaluatePageStable({
      port: 9222,
      expression: "window.oplStudio.sendMessage({})",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
      evaluate: async ({ expression }) => expression.includes('return {status:"missing"}')
        ? { status: "rejected", error: { message: "turn failed", code: "turn_failed" } }
        : true
    }),
    (error) => error.message === "turn failed" && error.code === "turn_failed"
  );
});

async function startMockCdpServer(t) {
  const received = [];
  let activeSocket = null;
  const server = http.createServer((req, res) => {
    if (req.url === "/json/list") {
      const { port } = server.address();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([
        { id: "bg-1", type: "service_worker", webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/worker/1` },
        { id: "page-1", type: "page", webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/1` }
      ]));
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server, path: "/devtools/page/1" });
  wss.on("connection", (socket) => {
    activeSocket = socket;
    socket.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      received.push(msg);
      if (msg.method === "Runtime.evaluate") {
        if (msg.params?.expression === "throw_err") {
          socket.send(JSON.stringify({
            id: msg.id,
            result: { exceptionDetails: { text: "Uncaught Error", exception: { description: "Error: eval boom" } } }
          }));
          return;
        }
        socket.send(JSON.stringify({
          id: msg.id,
          result: { result: { type: "object", value: { ok: true, expr: msg.params?.expression } } }
        }));
        return;
      }
      if (msg.method === "Page.captureScreenshot") {
        socket.send(JSON.stringify({
          id: msg.id,
          result: { data: Buffer.from("png-bytes").toString("base64") }
        }));
        return;
      }
      if (msg.method === "DOM.getDocument") {
        socket.send(JSON.stringify({ id: msg.id, result: { root: { nodeId: 10 } } }));
        return;
      }
      if (msg.method === "DOM.querySelector") {
        socket.send(JSON.stringify({ id: msg.id, result: { nodeId: 42 } }));
        return;
      }
      socket.send(JSON.stringify({ id: msg.id, result: {} }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    port: server.address().port,
    received,
    emitException(description) {
      activeSocket?.send(JSON.stringify({
        method: "Runtime.exceptionThrown",
        params: { exceptionDetails: { exception: { description } } }
      }));
    }
  };
}

test("chrome-remote-interface page helpers and CdpSession evaluate, screenshot, set files, and listen for exceptions", async (t) => {
  const mock = await startMockCdpServer(t);
  const target = await waitForPageTarget({ port: mock.port, timeoutMs: 2_000 });
  assert.equal(target.id, "page-1");

  const evaluated = await evaluatePage({ port: mock.port, expression: "window.location.href", timeoutMs: 2_000 });
  assert.deepEqual(evaluated, { ok: true, expr: "window.location.href" });
  await assert.rejects(evaluatePage({ port: mock.port, expression: "throw_err", timeoutMs: 2_000 }), /Uncaught Error/);

  const shot = await capturePageScreenshot({ port: mock.port, timeoutMs: 2_000 });
  assert.equal(shot.toString("utf8"), "png-bytes");

  const session = await CdpSession.connect(mock.port, 2_000);
  t.after(() => session.close());
  const exceptions = [];
  session.onExceptionThrown((params) => {
    exceptions.push(params?.exceptionDetails?.exception?.description);
  });
  assert.deepEqual(await session.evaluate("1+1", 2_000), { ok: true, expr: "1+1" });
  await assert.rejects(session.evaluate("throw_err", 2_000), /Error: eval boom/);
  await session.setFileInput("input[type=file]", ["/tmp/a.txt"]);
  assert.ok(mock.received.some((msg) => msg.method === "DOM.setFileInputFiles" && msg.params?.nodeId === 42));
  mock.emitException("ReferenceError: bad");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(exceptions, ["ReferenceError: bad"]);
  await session.close();
});

test("native Node WebSocket CDP fallback matches CdpSession, evaluatePage, and screenshot behavior", async (t) => {
  const mock = await startMockCdpServer(t);
  const previous = process.env.OPL_CDP_FORCE_NATIVE_FALLBACK;
  process.env.OPL_CDP_FORCE_NATIVE_FALLBACK = "1";
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_CDP_FORCE_NATIVE_FALLBACK;
    else process.env.OPL_CDP_FORCE_NATIVE_FALLBACK = previous;
  });

  const target = await waitForPageTarget({ port: mock.port, timeoutMs: 2_000 });
  assert.equal(target.id, "page-1");

  const evaluated = await evaluatePage({ port: mock.port, expression: "window.location.href", timeoutMs: 2_000 });
  assert.deepEqual(evaluated, { ok: true, expr: "window.location.href" });
  await assert.rejects(evaluatePage({ port: mock.port, expression: "throw_err", timeoutMs: 2_000 }), /Uncaught Error/);

  const shot = await capturePageScreenshot({ port: mock.port, timeoutMs: 2_000 });
  assert.equal(shot.toString("utf8"), "png-bytes");

  const session = await CdpSession.connect(mock.port, 2_000);
  t.after(() => session.close());
  const exceptions = [];
  session.onExceptionThrown((params) => {
    exceptions.push(params?.exceptionDetails?.exception?.description);
  });
  assert.deepEqual(await session.evaluate("2+2", 2_000), { ok: true, expr: "2+2" });
  await assert.rejects(session.evaluate("throw_err", 2_000), /Error: eval boom/);
  await session.setFileInput("input[type=file]", ["/tmp/b.txt"]);
  assert.ok(mock.received.some((msg) => msg.method === "DOM.setFileInputFiles" && msg.params?.nodeId === 42));
  mock.emitException("TypeError: native fallback");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(exceptions, ["TypeError: native fallback"]);
  await session.close();
});

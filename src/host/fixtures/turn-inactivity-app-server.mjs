import readline from "node:readline";

const responseSteps = new Map();
const interruptions = [];
let eofTurnId;
let canonicalThread;

const send = frame => process.stdout.write(`${JSON.stringify(frame)}\n`);
const scheduleSteps = (steps = []) => {
  for (const step of steps) {
    setTimeout(() => send(step.frame), step.delay ?? 0);
  }
};

readline.createInterface({ input: process.stdin }).on("line", line => {
  const frame = JSON.parse(line);
  if (frame.id !== undefined && !frame.method) {
    const steps = responseSteps.get(frame.id);
    responseSteps.delete(frame.id);
    scheduleSteps(steps);
    return;
  }
  const params = frame.params ?? {};
  if (frame.method === "fixture/thread") {
    canonicalThread = params.thread;
    return;
  }
  if (frame.method === "thread/read") {
    send({ id: frame.id, result: { thread: canonicalThread } });
    return;
  }
  if (frame.method === "initialize") {
    send({ id: frame.id, result: {} });
    return;
  }
  if (frame.method === "turn/start") {
    const turnId = params.turnId;
    if (params.eofStarted) eofTurnId = turnId;
    send({ id: frame.id, result: { turn: { id: turnId, status: "inProgress" } } });
    send({ method: "turn/started", params: { threadId: params.threadId, turnId, turn: { id: turnId, status: "inProgress" } } });
    return;
  }
  if (frame.method === "turn/interrupt") {
    interruptions.push(params.turnId);
    send({ id: frame.id, result: {} });
    return;
  }
  if (frame.method === "fixture/emit") {
    scheduleSteps(params.steps);
    return;
  }
  if (frame.method === "fixture/respond") {
    responseSteps.set(params.requestId, params.steps);
    return;
  }
  if (frame.method === "fixture/state") {
    send({ id: frame.id, result: { interruptions } });
    return;
  }
  // fixture/hold intentionally remains pending.
});

process.stdin.on("end", () => {
  if (!eofTurnId) return;
  // Exercise the transport's final unterminated stdout buffer during shutdown.
  process.stdout.write(JSON.stringify({
    method: "turn/started",
    params: { turnId: eofTurnId, turn: { id: eofTurnId, status: "inProgress" } }
  }));
});

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createGuestRpc } from "./windows-guest-rpc.mjs";

test("a canonical thread larger than 32 MiB leaves account requests usable", async t => {
  const requests = new PassThrough(), responses = new PassThrough();
  const thread = { turns: [{ image: "x".repeat(33 * 1024 * 1024) }] };
  const client = createGuestRpc({ input: responses, output: requests });
  const host = createGuestRpc({ input: requests, output: responses,
    onRequest: async method => method === "readThread" ? thread : { account: "ready" } });
  t.after(() => { client.close(); host.close(); });
  assert.deepEqual(await client.request("readThread"), thread);
  assert.deepEqual(await client.request("readAccount"), { account: "ready" });
});

test("the limit applies to individual frames, including fragmented UTF-8", t => {
  const input = new PassThrough(), output = new PassThrough(), received = [];
  const frame = JSON.stringify({ type: "event", value: "答案".repeat(10) });
  const rpc = createGuestRpc({ input, output, maxFrameBytes: Buffer.byteLength(frame), onEvent: v => received.push(v) });
  t.after(() => rpc.close());
  const wire = Buffer.from(`${frame}\n${frame}\n`);
  input.write(wire.subarray(0, 32));
  input.write(wire.subarray(32, 63));
  input.write(wire.subarray(63));
  assert.deepEqual(received, ["答案".repeat(10), "答案".repeat(10)]);
});

test("an oversized owner result rejects only that request", async t => {
  const requests = new PassThrough(), responses = new PassThrough();
  const client = createGuestRpc({ input: responses, output: requests, maxFrameBytes: 512 });
  const host = createGuestRpc({ input: requests, output: responses, maxFrameBytes: 512,
    onRequest: async method => method === "large" ? "x".repeat(513) : "ready" });
  t.after(() => { client.close(); host.close(); });
  await assert.rejects(client.request("large"), { code: "guest_frame_too_large" });
  assert.equal(await client.request("account"), "ready");
});

test("an inbound frame that never terminates remains bounded", async () => {
  const input = new PassThrough(), output = new PassThrough();
  const rpc = createGuestRpc({ input, output, maxFrameBytes: 128 });
  const pending = rpc.request("account");
  const rejected = assert.rejects(pending, { code: "guest_host_closed" });
  input.write("x".repeat(64)); input.write("x".repeat(65));
  await rejected;
  await assert.rejects(rpc.request("account"), { code: "guest_host_closed" });
});

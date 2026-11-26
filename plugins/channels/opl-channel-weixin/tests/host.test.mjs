import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { ChannelBindingStore } from "@gaofeng21cn/opl-host-kit/channel-bindings";
import * as plugin from "../src/index.mjs";

const providerId = "opl-channel-weixin";
const stateRef = "weixin.channel-access#state";

const callback = {
  async readTransportBindings() {
    return [
      { provider_id: providerId, account_id: "weixin-account", channel_session_id: "weixin-owner", canonical_thread_host: "host", canonical_thread_id: "known-thread" },
      { provider_id: "other-provider", account_id: "other-account", channel_session_id: "other-owner", canonical_thread_host: "host", canonical_thread_id: "other-thread" }
    ];
  },
  async startThread() { throw new Error("The channel has no message to route."); },
  async resumeThread() { throw new Error("The channel has no message to route."); },
  async startTurn() { throw new Error("The channel has no message to route."); },
  subscribeTurn() { throw new Error("The channel has no message to route."); }
};

test("Cordis exposes a single channel registration with existing thread bindings and bounded contribution actions", async () => {
  const ctx = new Context();
  const fiber = await ctx.plugin(plugin);
  const service = ctx.oplWeixinChannel;

  const first = service.connect(callback);
  await assert.rejects(service.connect(callback), /already attached/);
  const host = await first;
  await assert.rejects(service.connect(callback), /already attached/);

  const patch = host.appStatePatch();
  const [contribution] = patch.ui_contributions.entries;
  assert.equal(contribution.contribution_key, "opl-channel-weixin:weixin-channel-access");
  assert.equal(contribution.view.settings_destination, "resources");
  assert.deepEqual(patch.transport_bindings.bindings.map(binding => binding.canonical_thread_id), ["known-thread"]);

  const read = await host.readChannelAccess({ package_id: providerId, ref: stateRef });
  assert.equal(read.opl_app_contribution.carrier_readback.kind, "dsh_plugin");
  assert.equal(read.opl_app_contribution.response.result.connection.state, "disconnected");
  await assert.rejects(host.readChannelAccess({ package_id: "unrelated", ref: stateRef }), /address the Weixin channel/);
  await assert.rejects(host.readChannelAccess({ package_id: providerId, ref: "other#state" }), /Unknown Weixin channel data reference/);
  await assert.rejects(host.executeChannelAccessAction({ package_id: providerId, ref: "weixin.channel-access#disconnect" }), /requires confirmation/);

  await fiber.dispose();
  assert.equal(ctx.oplWeixinChannel, undefined);
  assert.equal(host.appStatePatch().ui_contributions.entries.length, 0);
  await assert.rejects(host.readChannelAccess({ package_id: providerId, ref: stateRef }), /closed/);
  await assert.rejects(service.connect(callback), /closed/);
});

test("DSH unload cancels an in-flight PIN challenge and a new fiber starts disconnected", async () => {
  const service = plugin.createWeixinChannelService({
    loginOptions: { qr: {
      fetch: async input => Response.json(String(input).includes("get_bot_qrcode")
        ? { qrcode: "qr-ticket" }
        : { status: "need_verifycode" })
    } }
  });
  const host = await service.connect(callback);
  await host.executeChannelAccessAction({ package_id: providerId, ref: "weixin.channel-access#connect" });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const read = await host.readChannelAccess({ package_id: providerId, ref: stateRef });
    if (read.opl_app_contribution.response.result.connection.state === "pin_required") break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const read = await host.readChannelAccess({ package_id: providerId, ref: stateRef });
  assert.equal(read.opl_app_contribution.response.result.connection.state, "pin_required");

  await service.dispose();
  const newService = plugin.createWeixinChannelService();
  const next = await newService.connect(callback);
  try {
    const readback = await next.readChannelAccess({ package_id: providerId, ref: stateRef });
    assert.equal(readback.opl_app_contribution.response.result.connection.state, "disconnected");
    assert.deepEqual(next.appStatePatch().transport_bindings.bindings.map(binding => binding.canonical_thread_id), ["known-thread"]);
  } finally {
    await newService.dispose();
  }
});


test("reconnecting an account on a fresh host resumes the existing Codex thread", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opl-weixin-binding-test-"));
  let threadStarts = 0;
  const resumedThreads = [];
  try {
    for (const expectedReply of ["first reply", "second reply"]) {
      const store = new ChannelBindingStore({ filePath: path.join(root, "channel-bindings.json") });
      let polls = 0;
      let resolveReply;
      const replySent = new Promise(resolve => { resolveReply = resolve; });
      const service = plugin.createWeixinChannelService({
        loginOptions: {
          qr: {
            fetch: async (input, init) => {
              const url = new URL(input);
              if (url.pathname.endsWith("get_bot_qrcode")) return Response.json({ qrcode: "qr-ticket" });
              if (url.pathname.endsWith("get_qrcode_status")) return Response.json({
                status: "confirmed",
                bot_token: "ephemeral-token",
                ilink_bot_id: "weixin-account",
                ilink_user_id: "weixin-owner"
              });
              if (url.pathname.endsWith("sendmessage")) {
                resolveReply(JSON.parse(init.body).msg.item_list[0].text_item.text);
                return Response.json({ ret: 0 });
              }
              if (++polls === 1) return Response.json({
                ret: 0,
                msgs: [{ from_user_id: "weixin-owner", item_list: [{ type: 1, text_item: { text: "message" } }] }]
              });
              return new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
              });
            }
          }
        }
      });
      try {
        const host = await service.connect({
          readTransportBindings: () => store.readBindings(),
          async startThread(identity) {
            return (await store.getOrCreate(identity, async () => ({
              canonical_thread_host: "host",
              canonical_thread_id: `thread-${++threadStarts}`
            }))).thread;
          },
          async resumeThread(thread) {
            await store.assertKnownThread(thread);
            resumedThreads.push(thread.canonical_thread_id);
          },
          async startTurn({ text, ...thread }) {
            assert.equal(text, "message");
            return { ...thread, canonical_turn_id: expectedReply };
          },
          subscribeTurn(turn, { onTerminal }) {
            void onTerminal({ ...turn, status: "completed", response_text: expectedReply });
            return { dispose() {} };
          }
        });
        await host.executeChannelAccessAction({ package_id: providerId, ref: "weixin.channel-access#connect" });
        assert.equal(await replySent, expectedReply);
        assert.equal(host.appStatePatch().transport_bindings.bindings[0].canonical_thread_id, "thread-1");
        await host.executeChannelAccessAction({ package_id: providerId, ref: "weixin.channel-access#disconnect", confirmed: true });
      } finally {
        await service.dispose();
      }
    }
    assert.equal(threadStarts, 1);
    assert.deepEqual(resumedThreads, ["thread-1", "thread-1"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

# OPL Channel Weixin

`@gaofeng21cn/opl-channel-weixin` is the built-in Studio DSH plugin for Weixin
remote access. Its host owns one iLink session and uses the existing Codex App
Server callbacks for threads and turns. The `oplWeixinChannel` Cordis service
publishes a `channel_access` contribution under Connection and Access. The same
entry handles own-account QR login, real-name authorization for another person's
account, PIN verification, and disconnect.

The native plugin uses the existing `opl-channel-weixin` provider ID. Studio
therefore retains exact channel/account/thread bindings across upgrades. QR
challenges, PINs, and iLink credentials are in memory and cleared when the
channel fiber is unloaded. A new host process requires a fresh QR connection,
then reuses the previous thread whenever Weixin returns the same account and
sender identity.

Run the local protocol and Cordis lifecycle tests from the Studio root.

```sh
bun test plugins/channels/opl-channel-weixin/tests
```

See [NOTICE](NOTICE) for the protocol references and license attribution.

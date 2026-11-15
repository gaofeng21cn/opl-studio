# OPL Link connection

OPL Link is the native iPhone and iPad companion for One Person Lab App. Studio
exposes a scoped adapter on the same DSH Host and persistent Codex App Server
used by Desktop and WebUI. The phone reads and continues the same canonical
conversations, answers pending requests and reviews workspace results.

Product and wire authority remain in App's
[companion contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-remote-companion-wire.json).
This guide describes Studio's connection and implementation.

## Provide a trusted address

The phone needs an HTTPS address with a certificate trusted by iOS that reaches
this running Studio Host. A user-managed HTTPS reverse proxy, including one on
a private network, can forward `/api/link/*` to the Host. Keep the Host listener
on loopback when the proxy runs on the same computer. The proxy must overwrite
the forwarded headers it supplies, preserve the request path and disable
buffering for `/api/link/events`.

Set `OPL_STUDIO_WEB_PORT` before starting the desktop App to select a stable
local listener port. The standalone WebUI also accepts its existing explicit
port option. Set `OPL_LINK_TRUST_PROXY=1` only for a listener behind the trusted
proxy; the adapter then accepts `X-Forwarded-Proto: https`. Existing trusted
WebUI proxy and cloud settings supply the same trust decision. An optional
`OPL_LINK_PUBLIC_URL=https://your-trusted-host/` pre-fills the address in Settings.
The Host must remain running and reachable while the phone is connected.

If the proxy exposes the full WebUI, configure the existing password session
owner using `OPL_WEBUI_AUTH_MODE=password`, `OPL_WEBUI_PASSWORD_FILE` and
`OPL_WEBUI_SESSION_SECRET_FILE` (at least 32 bytes), then sign in before managing
devices. Cloud mode already requires password authentication. With auth mode
`none`, generic APIs and device management accept only direct loopback requests
with a loopback Host and no forwarded headers. Companion credentials cannot
authorize a generic WebUI API or its event stream.

## Pair and disconnect

Open **Settings → Resources → OPL Link**, or **Software Center → Shared
Resources → OPL Link**. Enter the trusted address and choose **Create pairing
code**. Scan the QR code in OPL Link, or copy its pairing link into OPL Link.
Each code is valid once for two minutes. A device credential lasts 30 days;
pair again after it expires.

The connected-device list shows device names and last connection times. Choose
**Refresh** after pairing and **Disconnect** to revoke a device. Revocation
closes its live streams and invalidates its credential immediately. The phone
can also revoke its own connection. Studio stores credential hashes and device
metadata in its private `link-devices.json`; device credentials are not returned
to the desktop renderer. The phone holds its credential in iOS Keychain.

## Available actions

The adapter provides canonical conversation list/read, new messages, active-turn
steering and interruption, model catalog, rename/archive, pending requests,
workspace browsing and bounded file download. Attachments use Studio's existing
staged-input service: up to five files, each no larger than 10 MiB, for new
messages and active-turn steering. The phone sends bytes rather than local
filesystem paths. Existing thread permissions stay with the Codex owner.

Phone approvals support the pending request's offered allow-once or deny
choices, plus typed answers to canonical user questions. Broader permission
grants remain on the desktop. File operations retain Studio's workspace
realpath and symlink containment checks.

Mutations require a unique request ID. Studio reserves it durably before the
owner call, shares an in-flight result and rejects reuse with different input.
After a restart or an uncertain failed mutation, the same ID returns
`link_outcome_unknown`; the client refreshes canonical state before the user
decides what to do next. Reconnecting the event stream refreshes canonical
state because SSE does not replay missed events.

## Source verification

Run the following after `npm run build:plugins`:

```sh
node --test src/host/link-companion.test.mjs src/host/webui-auth.test.mjs src/host/http-host.test.mjs
```

These tests exercise
the actual DSH HTTP Host with an isolated synthetic Codex subprocess, pairing,
credential expiry and revocation, event streaming, the same thread, attachments,
approval boundaries, workspace download and mutation deduplication. They also
cover the desktop session, proxy and companion credential fences.

`node scripts/acceptance/link-companion.mjs` renders the actual Settings
component, production WebUI bridge and DSH theme against the real HTTP Host in
an isolated temporary profile. It checks QR creation, a claimed device,
revocation and narrow/wide layouts. Screenshots and results are written to
`output/playwright/link-companion/`.

The explicit `OPL_LINK_ALLOW_LOOPBACK_HTTP=1` override supports source tests and
local simulator development only, with both the client and endpoint on
loopback. Release phone connections use trusted HTTPS. Source and simulator
checks establish their own layers; installed-phone networking and product
publication use App's separate acceptance and release paths.

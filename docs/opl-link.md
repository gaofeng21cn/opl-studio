# OPL Link connection

OPL Link is the native iPhone and iPad companion for One Person Lab App. It
continues the same conversations and pending requests on Studio’s existing
DSH Host and persistent Codex App Server. It does not start another runtime or
copy conversation history into a mobile backend.

App owns the [companion wire contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-remote-companion-wire.json)
and [internet connection contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-remote-companion-internet.json).
This guide describes their Studio implementation. Source qualification and a
public service deployment are separate acceptance surfaces.

## Connect within OPL App

1. Open **Settings → Resources → OPL Link**, or **Software Center → Shared Resources → OPL Link**.
2. Choose **Enable phone access**. If prompted, open the existing **OPL Account** page and sign in there.
3. When the status reads **Phone access is ready**, choose **Create pairing code**.
4. Scan it in OPL Link and verify the computer fingerprint shown on both devices.

The default connection uses `https://link.medopl.com`. Users do not enter a
server address, configure a tunnel, install another network app, or type an
account password on their phone. Keep the computer online and OPL App running.
There is no guarantee of background delivery while iOS suspends Link or the
computer sleeps.

The desktop code is single use and expires after two minutes. Its business
claim code travels only inside the encrypted channel pinned to the desktop
public key. Relay enrollment alone does not authorize conversation access.
A claimed business credential lasts 30 days and is tied to the enrolling phone
identity. If claiming returns an unknown outcome, generate a fresh desktop
code instead of retrying the old claim.

The device list shows names and last connection times. **Disconnect** invalidates
the local business credential and closes its streams before asking Relay to
revoke the phone token. A Relay failure remains an error; the local business
credential stays invalid. A phone disconnect first receives the local
revocation acknowledgement, then revokes its own Relay token via REST. This
keeps the acknowledgement available until the encrypted connection closes.

## Ownership and transport

Studio composes the public `ConnectionController`, `HostServerConnection`,
`HostServerApi`, `IdentityStore`, `ServerCredentialStore` and `RpcRouter` from
[ds-harness-remote](https://github.com/liguobao/ds-harness-remote) at
`f214c5abb39434d0e8358956bfca8d4529981fee` (MIT). The committed upstream Host
bundle is byte-identical. The only enabled business RPC is upstream
`loopback.call`, carrying `http.open`, `http.read` and `close`.

A per-peer in-process adapter supplies the fixed virtual target
`http://127.0.0.1:43177`. It does not bind a socket. It accepts only phone
`/api/link/*` routes, rejects desktop management and generic WebUI APIs, and
never accepts an arbitrary origin or port. Its secure request context comes
from the official authenticated Noise connection, not HTTP forwarded headers.
Other Remote domains, terminals and generic loopback forwarding are not
instantiated or advertised. The existing official RTC carrier negotiates LAN/P2P,
then configured TURN, with the existing WSS Relay as the final fallback. Server
capability negotiation controls whether TURN is available; Studio does not
hardcode a TURN service or require a separate user networking app.

The official carrier owns Noise IK, framing, fragmentation, reconnect and
peer-key verification. Studio uses the unchanged upstream `loadNodeRtcFactory`:
native libwebrtc is preferred when available, and the generated RTC bundle
includes werift `0.26.0` as a pure-JavaScript fallback. The runtime bundle can
load, create a peer, read statistics and close without external node_modules,
a native postinstall, or an Electron ABI rebuild. The generator imports the
upstream RTC source closure without modifying its implementation body.

The Host obtains ICE configuration through upstream’s authenticated
`GET /api/v1/turn/credentials?connection_id=...`; short-lived TURN credentials
remain inside the RTC implementation. LAN/P2P/TURN evidence comes from the
actual succeeded selected/nominated candidate pair using upstream
`inspectSelectedPath`, with only candidate types and bounded byte counters
projected. DataChannel counts measure the transmitted encrypted frames; WSS
Relay counts measure actual Relay ciphertext frames. No IP address, SDP,
credential, candidate ID or business payload is emitted as evidence. An
advertised preference alone cannot establish a direct connection.

If RTC negotiation fails, the companion uses a fresh control connection and
Noise session for its next configured attempt, eventually selecting WSS Relay.
The same Link request journal continues to reject unknown mutation replay. Each new connection receives fresh stream handles;
replacing a connection closes the old handles. Host and data WebSockets and
REST calls attach `X-OPL-Account`; device tokens remain the authorization.

Framework authorizes the Host with the desktop’s existing Gateway account:

```text
opl connect gateway authorize-companion --request-stdin --credential-file <new-private-file> --json
```

Studio sends a strict Host descriptor through stdin. The command writes its
credential envelope into a new mode-0600 file inside a caller-owned mode-0700
temporary directory. Studio verifies origin and exact local identity, imports
the token pair into the upstream store and removes the temporary directory.
Tokens, Gateway passwords and model keys never reach the renderer. The
persistent public scope and identity binding live in `link-host.json` beside
the upstream identity and credential store under `.opl-studio/link-remote/`.
Identity or account replacement fails explicitly rather than silently pairing
a different computer.

## Conversations, files and recovery

The phone can list/read conversations, start or steer a turn, interrupt,
rename/archive, answer pending questions and approvals, select models, browse
the canonical workspace and download results. Existing thread permissions
stay with Codex. Approval replies offer the canonical request’s allow-once or
deny choices; broader grants stay on the desktop.

Attachment receipts are scoped to the phone and exact canonical thread, or
the desktop’s current workspace for a new conversation. Uploads use 512 KiB
chunks, at most five files of 10 MiB each and a ten-minute receipt TTL. Repeating
the same offset and bytes is idempotent; changed bytes or offsets conflict.
SHA-256 is checked before a receipt becomes ready. Invocation sends only an
`uploadId`; Studio streams those bytes through its existing staged-input owner.
The phone never submits a server filesystem path. Confirmed sends may delete
the temporary upload receipt; uncertain sends retain their canonical outcome
handling and are not replayed.

Downloads retain the canonical workspace’s 256 MiB limit and realpath,
symlink and open-descriptor checks. Each GET range returns up to 512 KiB.
`ETag` identifies the opened file version; later ranges require `If-Match`.
A change returns 412 and the phone discards its partial download.

The authenticated Link SSE source is carried by bounded upstream HTTP reads
of at most 64 KiB, with a 15-second heartbeat, 20-second read idle limit and
64 MiB total stream limit. Backpressure or overflow closes the stream. On EOF,
network loss or reconnect the phone reads canonical state before reopening;
it does not silently discard events. Business mutations reserve a durable
request ID before dispatch. Recovered or uncertain results require owner
readback, with no automatic turn, approval or interrupt replay and no offline
mutation queue.

## Verification and upstream updates

```sh
node scripts/verify-link-remote.mjs
node scripts/build-dsh-plugins.mjs
node --test src/host/link-companion.test.mjs src/host/link-internet.test.mjs src/host/thread-workspace-service.test.mjs
npm run typecheck
node scripts/acceptance/link-companion.mjs
```

Set `OPL_LINK_FRAMEWORK_SOURCE=/path/to/one-person-lab` for the focused tests
to additionally spawn the matching real Framework CLI with an isolated signed-out
account store. That check verifies stderr reason codes reach the existing OPL
Account entry. Both subprocess output streams are bounded and their raw error
bodies remain outside the renderer.

The browser acceptance mounts the actual Settings component, production Web
bridge and real DSH Host with a transport fixture. It checks the address-free
flow, QR, fingerprint, claimed device, revocation and narrow layout. It does
not establish public Relay reachability or native iOS qualification; those
require their corresponding live transport and native-client checks.

`src/host/vendor/dsh-remote/provenance.json` records the exact upstream paths,
revision and local SHA-256 values. To refresh from a reviewed checkout at the
contract’s pinned revision, run `node scripts/verify-link-remote.mjs --source /path/to/ds-harness-remote`. The script checks the Git revision, imports the
unchanged Host bundle and protocol schema, and rebuilds only the schema module.
An upstream revision change first belongs to the App contract.

For the separate local Relay interoperability check, provide the matching
Relay service checkout and the pinned upstream checkout:

```sh
node scripts/acceptance/link-remote-interop.mjs --relay-source /path/to/opl-link/service --upstream-source /path/to/ds-harness-remote
```

This starts the actual Relay and DSH Host, uses the official upstream client,
Noise and fragmentation, and exercises canonical turns, chunked attachments,
versioned download, a fresh encrypted reconnect and both credential revocations.
The default lane requires actual LAN/P2P candidate evidence; `--force-fallback`
injects an unavailable Host RTC provider and requires an observed RTC attempt
followed by a fresh Relay/Noise connection. `--relay-only` covers a retained
Relay-only client. The forced-fallback lane also proves a repeated mutation ID
does not dispatch another turn.
Its Gateway account response is a local fixture. It does not prove public WSS
reachability or native iOS behavior.

Add `--hold-qr-file /private/test-directory/pairing.txt` to leave that local
fixture running for the native test. The file contains only the pairing URL,
is created exclusively with mode 0600 and is removed on shutdown. For a
short-lived local TURN test, only this fixture accepts `OPL_LINK_TURN_URLS` and
`OPL_LINK_TURN_SECRET_FILE` to configure its temporary service. The production
Host has no equivalent environment override; it consumes authenticated service
ICE configuration. The fixture
prints its desktop management URL and canonical test thread/file references;
use the management pairing API to refresh an expired code.

For public WSS/native qualification after the service is deployed, run
`node scripts/acceptance/link-native-fixture.mjs --qr-file /private/test-directory/public-pairing.txt`.
This uses the real Framework authorization command and fixed public Relay,
with a disposable Host and test Codex process. It prints only non-secret
fixture references and `transportPolicy: "direct_first"`. Its
`native_public_transport_observed.transportEvidence` contains exactly eight
fields: selectedTransport, localCandidateType, remoteCandidateType,
candidatePairState, bytesSent, bytesReceived, directAttempted and relayFallback.
LAN/P2P/TURN records require an actual succeeded pair and bidirectional frames;
Relay candidate fields are null. Observations are limited to 16 per transport
with increasing byte thresholds, keeping stdout below the runner’s 64 KiB cap. `SIGUSR1` refreshes its pairing file; `SIGTERM` closes the
Host and removes that file and its temporary state. The test does not create
or alter the user’s ordinary conversations.

## Advanced direct transport

The existing trusted-HTTPS `/api/link/*` adapter remains available to explicitly
configured integrations. A trusted reverse proxy must overwrite forwarded
headers and disable SSE buffering. `OPL_LINK_TRUST_PROXY=1` enables that trust
only for its listener; existing WebUI authentication still protects desktop
management. The direct pairing API accepts an explicit `endpoint`. It is not
the default Settings flow and does not alter the managed Relay origin.

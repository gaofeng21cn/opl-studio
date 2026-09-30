# macOS Desktop Distribution Evidence

`opl-studio` implements the current One Person Lab App carrier and the retained
Preview identity. macOS Stable has used Studio since 26.9.25. Source selection,
public assets and a completed installed upgrade are separate facts; exact release
and installed-state receipts prove the corresponding route.

| Build | Identity and feed | Existing user state |
| --- | --- | --- |
| Preview | `cn.onepersonlab.opl.studio.preview`, `opl-studio` Releases | Existing `opl-studio` userData |
| Stable | `cn.onepersonlab.opl`, `one-person-lab-app` Releases | Existing `One Person Lab` userData and Framework/Codex owner state |

`electron-builder.stable.yml` and the App controller supply the Stable display
version and strictly increasing updater version. Preview keeps its own version
sequence. Its packaged `preview-handoff.json` stays disabled until an exact
Stable target is available. The terminal bridge downloads that target, checks
its digest and publisher signature, waits for the old App to exit, retains its
installation backup, and imports allowlisted shell state before showing the
normal renderer. Conflicting drafts remain visible. Conflicting channel bindings
stop migration instead of reassigning a canonical thread. Framework, Codex Home,
and credentials stay with their owners.

## Carrier transition constraints

App owns activation, target identity, feed routing, migration policy, and the
adoption gates; this repository implements the carrier adapter. The App-owned
`one-person-lab-app` contracts (`contracts/app-release-channel.json`,
`docs/product/gui/opl-studio-plan.md`) are the authority for those decisions.
Preview updates stay on the dedicated repository and retain the Preview bundle
identity until a qualified terminal bridge installs its declared Stable target.
No Preview version may reset the mainline sequence. The
[App distribution reference](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/delivery/distribution-and-install-ssot.md)
owns current identities and migration qualification; retained
[September cutover evidence](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/history/studio-cutover-2026-09.md)
records the original baselines, without qualifying every later release.

Carrier-side constraints for any adopted route:

- the bridge verifies the exact target version, digest, Developer ID team, and
  Apple trust before installing the mainline bundle;
- the old Preview feed keeps serving a compatible bridge for users who skip
  releases or return after a long offline period, and never points an unprepared
  old updater at a different bundle identity; updaterless historical builds keep
  a disclosed manual prerequisite instead of an automatic-migration promise;
- coexisting mainline and Preview installations are detected with active turns,
  waited out at a safe idle point, and never downgraded or overwritten while
  running; migration stays retryable and the old app is retained until the new
  app proves startup and canonical data access;
- legacy OPL shell metadata links only owner-confirmed canonical Codex threads
  through the existing idempotent adapter. It preserves its source and never
  copies messages or creates migration threads; Codex Home, Framework-owned
  credentials and Keychain/signing requirements stay with their owners;
- App qualifies applicable routes in isolated macOS VMs under its release policy: download,
  signature validation, idle handling, installation, relaunch, history and
  attachment access, rollback, repeated migration, later ordinary updates,
  co-installed apps, skipped versions, interrupted downloads, and insufficient
  disk space. Migration qualification and public publication follow App's
  current ordering; a historical pass does not qualify new route or artifact bytes.

The carrier-specific release surface is declared in `contracts/desktop-release-carrier.json`. OPL App owns the
shared Electron toolchain, artifact/update policy, signing/notarization stages, publication, and public readback;
this repository owns only the Studio bundle, builder configuration, renderer payload, and Studio qualification
commands. A local package or updater smoke does not create a second release owner.

`npm run dist:mac` builds the shared Electron renderer/host, emits the Developer ID signed updater ZIP and
ULFO DMG, creates byte-identical `latest-mac.yml` and `latest-arm64-mac.yml`, and validates every feed
size/hash against the final artifacts. The extracted updater App must have the package version, a Developer
ID Application chain, TeamIdentifier, hardened runtime, and the dedicated `gaofeng21cn/opl-studio` feed.

The default qualification records Gatekeeper and stapling readback but does not convert missing Apple trust
evidence into success. `npm run qualify:desktop:mac:release` is fail-closed and requires Gatekeeper acceptance
plus stapled App and DMG tickets. Local Developer ID signing alone is a distributable candidate, not release
readiness, notarization, installed replacement, active-shell adoption, or public artifact authority.

`npm run qualify:desktop:updater:local` exercises the packaged Squirrel.Mac path against a credential-free
loopback feed. It builds an isolated base App and one-patch-newer ZIP with a qualification-only bundle id,
downloads and installs the update, reads the replaced App version, relaunches it, and reads the running updater
version through the host contract. HOME, Electron state, installation, builder output, and feed all live under
one temporary root; the command removes them after writing `out/macos-desktop-updater-qualification.json`.
This proves the local packaged update chain, not the GitHub release feed or Apple notarization.

`npm run smoke:preview` runs the carrier-neutral renderer harness against an existing CDP page. It reads the
Preview bundle identity when `--app-path` is supplied, exercises Standard and Full Framework readback through
the native bridge, then opens Settings, Account & Models, About, Run status, and the task inspector. Optional
Gateway setup and Codex turn hooks are supplied only through `OPL_STUDIO_GATEWAY_CREDENTIALS_FILE` or
`OPL_STUDIO_GATEWAY_EMAIL`/`OPL_STUDIO_GATEWAY_PASSWORD`, and `OPL_STUDIO_CODEX_TURN_HOOK_FILE` or
`OPL_STUDIO_CODEX_TURN_PROMPT`; secrets and prompts are never written to the receipt. Set
`OPL_STUDIO_RUNTIME_PROFILES=standard,full` to require both mapped profiles, and use
`--require-gateway-setup` or `--require-codex-turn` when those hooks are part of the run's acceptance.

The `--require-codex-turn` hook proves **provider connectivity, not model generation**. It accepts two
outcomes and records which one happened in `checks.codexTurn.status`, `.outcome`, `.connectivity` and
`.connectivityCode`:

- `passed` / `generation_completed`: the non-simulated turn completed with a final message;
- `connectivity_confirmed` / `provider_reachable_without_generation`: the non-simulated turn reached the
  configured provider and returned a structured `INSUFFICIENT_BALANCE` response.

This mirrors the App-owned `codex_turn_policy` in `contracts/app-release-channel.json`, whose release-test
account is expected to hold no balance: a structured `INSUFFICIENT_BALANCE` response is the evidence that
the installed Host, credential bridge and provider route all work. Generic 403 authentication or
authorization errors, transport failures, timeouts, missing turn identities and simulated turns still
fail the hook. Do not report a `connectivity_confirmed` run as a product or release blocker, and do not
describe the probe as an end-to-end model generation check.

`npm run qualify:desktop:clean-vm` clones the configured Tart macOS base, installs the exact local DMG,
launches the packaged App through a temporary SSH/CDP tunnel, and delegates to the same Preview smoke
harness. `--attach` reuses an already running CDP target for debugging; it does not claim package identity
unless `--app-path` allows a real `Info.plist` readback. Its receipt always keeps `cleanVmReady=false` and
`releaseReady=false`: a successful local install is candidate evidence only, while a missing Framework/Codex
runtime is recorded as a typed blocker instead of being hidden behind a shell fallback. The harness deletes
the temporary VM by default; use `--keep-vm` only for local debugging.

The clean-VM harness copies the runner's system and default CA trust into a temporary
guest file and binds its digest before launch. `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`
carry that trust to the test App and its children, with TLS verification enabled.
This supports the runner's network trust without changing the shipped bundle or
persisting certificates in the guest keychain.

`npm run qualify:desktop:fixture-vm -- --dmg <local DMG>` installs the same exact DMG into the clean Tart
base and drives the packaged Host with the synthetic App Server and Framework fixtures in
`tests/fixtures/studio-vm-fixture`. The installed bundle, native preload bridge, Host, renderer and slots
stay real; only the Codex App Server and the Framework state readback are replaced, so no model call, real
Package or real workspace is touched. It asserts the 27 explicit feature states, all eight Settings routes,
the three Agent Packages reaching `3 / 3 可用`, the Runtime producer projection, canonical thread CRUD and
readback, workspace list/read/search containment, the unavailable-Git reason, permission profiles and
models, rendered thread selection with the subagent panel, a completed fixture turn, attachment
classification plus cleanup, the native updater version and a clean renderer exception log. The receipt is
`out/feature-vm-ui.json`. This proves the packaged candidate's feature surfaces; it is not App release
admission, real Codex execution, or a substitute for the App-owned clean-VM qualification of published
assets.

`npm run diagnose:gateway:persistence` checks the Framework-owned
`credentials.json`, `account.json`, and `installation.json` files without printing their contents, then
performs a real Preview cold start and compares mode, size, and SHA-256 before/after. It also compares the
sanitized `opl app state` Gateway projection with the renderer's `window.oplStudio.readState()` result.
The Studio renderer cache is not treated as credential authority.

The desktop main process resolves existing `codex` and `opl` installations into the documented
`OPL_CODEX_BIN` and `OPL_APP_OPL_BIN` environment boundaries before the shared host starts. This keeps
Finder launches independent of a terminal-only `PATH` while preserving explicit operator overrides. The
About and Updates surfaces read the running package version and the same main-process updater state; they
do not maintain a second version or update store.

Packaged Desktop checks for App and eligible Framework updates in the Host maintenance loop. App updates
download silently and install after normal Host shutdown; an explicit update restart waits for an idle
Codex transport. Framework background apply stages Base and delegates installed official Package updates
to their native carriers. The idle lease holds new Codex requests until Package refresh finishes, and the
About page reports maintenance progress or retry state. The cadence and bounded failure/busy retries
are implemented only in `src/host/managed-update-maintenance.mjs`, following the
[App maintenance policy](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/product/managed-update-three-layer.md).
The next attempt, retry count, exhaustion and pending reload are persisted across cold starts.
App-feed failure does not block Framework/Package maintenance. Explicit manual updates remain
available through the existing update actions.

Before starting its persistent App Server, Preview supplies a fresh `OPL_APP_PROCESS_INSTANCE_ID` and
calls `opl update activate --json`. Framework owns verification, pending generation activation and rollback.
Explicit Codex executables remain selected; otherwise the activation receipt selects the managed binary.
Framework Package actions inherit that executable through `OPL_CODEX_PLUGIN_BIN` when no explicit Package carrier override is set, including standalone executables outside `PATH`.
The Standard bootstrap recognizes both the installer identity and Framework's
`opl_framework_runtime_source` receipt after an owner update. Missing activation support does not
authorize overwriting an owner-updated directory. Explicit external Framework roots are
preserved. External Temporal servers and developer or user-managed Packages remain with their owners.
`OPL_STUDIO_MANAGED_UPDATES=0` disables component maintenance, and explicit read-only mode blocks it.

Automatic apply reads the Framework plan and the installed package version before dispatch. A channel
older than the installed Framework, an unverified version, or an unbound target stops automatic apply
with a specific reason; accepted channel artifacts are bound by digest through Framework's existing
`OPL_FRAMEWORK_ARTIFACT_REF`. Cold-start activation also checks the owner-projected pending root version
before calling the owner. Studio never rewrites pending generations or their receipts. The ordinary
`opl update apply --json` is already Framework's background route; it must not be replaced with a
component-specific immediate apply or an invented `--background` flag.

Framework bootstrap failure degrades its capabilities without preventing the Codex Host from starting.
Native App update IPC is available independently of Host initialization, so recovery updates remain
reachable after a Host failure. About exposes bootstrap and activation diagnostics.

Preview publication follows candidate acceptance, including enabled maintenance, repeated cold starts,
failed/older pending generations, real history, native attachments and local updater qualification.
Fixture runs with maintenance disabled do not qualify the maintenance path. Before publishing, test the
exact committed candidate and its carrier bytes. After publishing, verify only distribution identity,
signature, anonymous asset availability and update delivery; publication is not a feature-test step.

For a joint desktop and WebUI/OCI release, follow the publication order owned by
[OCI distribution](../oci-distribution.md#publication-order): dispatch `studio-webui-preview.yml` from
Studio `main` with the released version first, wait for that workflow to succeed, and only then create
the `v<version>` tag that the protected desktop release binds. The WebUI source gate rejects a version
whose Git release tag already exists, so a desktop release that creates the tag first leaves that
version without an OCI companion.

The existing App-owned signed-checkpoint qualification invokes
`macos-distribution.mjs --require-release-trust` before its publish job. That gate now also downloads the
most recent earlier non-draft Preview, verifies its publisher and version, and exercises a loopback
Squirrel.Mac update to the unchanged signed candidate bytes. The test uses temporary installation,
HOME and Electron data, confirms replacement on normal quit, and reads the version after relaunch.
It needs no local signing credential and does not publish an extra test version. Failure stops the
publish job; public-feed readback does not repeat this prepublication feature test.

For public macOS builds, `APPLE_KEYCHAIN_PROFILE` selects an existing notarytool credential profile through
electron-builder. Staple the final DMG, regenerate its feed hash, and run the release qualification against
the anonymous GitHub asset URL after publication. The dedicated Preview feed remains independent of
the ordinary App's Stable feed.

The Full wrapper defaults the release and updater versions to Studio's
`package.json` and forwards build arguments to the App-owned builder:

```bash
OPL_APP_REPO_ROOT=/path/to/one-person-lab-app npm run build:full -- \
  --out-dir /path/to/studio-release/full --skip-gui-build
```

`--skip-gui-build` requires an already built Studio App at the builder's expected
output path. Seal the Standard ZIP, blockmap, DMG, and both update feeds in a
separate release directory before building Full; the App builder refreshes the
GUI output and removes its temporary update feeds. Finalize both DMGs with the
App-owned `scripts/notarize-macos-dmg.ts`, then refresh the Standard DMG's feed
size and SHA-512 and the Full public manifest's final size and SHA-256. Keep the
Standard updater ZIP bound to the stapled Standard App. Full is appended to the
same release with `scripts/studio-full-release-adapter.ts`, preserving all
sealed Standard assets and update metadata. For a combined OCI release, follow
the [publication order](../oci-distribution.md#publication-order) before creating
the desktop release tag.

## Windows guest Host payload

The Windows Stable carrier ships an App-owned Linux x64 guest Host payload at
`resources/opl-wsl-host`. It contains the Studio guest Host entry, the DSH plugin
closure, the production `node_modules` closure, the pinned Node and Codex
runtime, the Framework installer, and the Official Profile resources. The
Windows installer projects that directory into the App-owned WSL2 distribution
and starts the guest Host there; the payload is therefore a release input, not a
build cache.

`scripts/desktop/prepare-wsl-host-payload.mjs` is the only producer. It stages
the tracked sources, installs the frozen lock with `npm ci --omit=dev
--ignore-scripts`, runs `src/host/packed-host-smoke.mjs` on Linux x64, copies the
tree with materialized symlinks (NTFS extraction must not depend on symlink
privileges), and writes `manifest.json` — schema
`opl_studio_windows_guest_host.v1` — while the payload bytes are still on disk.

`electron-builder` omits the *root-level* `node_modules` of an `extraResources`
directory (`app-builder-lib/out/util/filter.js` rejects `relative ===
"node_modules"`). `electron-builder.stable.yml` therefore declares the payload
twice: once for `resources/opl-wsl-host` and once for
`resources/opl-wsl-host/node_modules`. Both entries are required; a single entry
produces a package whose bytes no longer match the manifest written before
packing, and the App fails at startup with `Windows guest Host payload bytes
differ from the packaged manifest` before it contacts the guest.

Because the packaged tree is a different artifact than the staged tree,
qualification runs twice: `prepare-wsl-host-payload.mjs --validate` before
packing, and `scripts/validate-desktop-package.mjs` after packing. The post-pack
gate re-reads the bytes that actually ship and fails closed on any missing,
extra, changed, or symlinked entry.

### Post-pack receipt

`node scripts/validate-desktop-package.mjs --distribution --write-receipt
--identity stable --version <version>` writes
`out/opl-windows-guest-host-payload-qualification.json` and reports the same
object as `packagedWslHostPayload` in its stdout summary:

```json
{
  "schema": "opl_studio_windows_guest_host_payload_qualification.v1",
  "status": "passed",
  "stage": "post_pack",
  "subject": "packaged_windows_guest_host_payload",
  "payload_root_relative": "resources/opl-wsl-host",
  "manifest_schema": "opl_studio_windows_guest_host.v1",
  "shell_ref": "<40-hex Studio commit>",
  "node_version": "v<version>",
  "framework_ref": "<40-hex Framework commit>",
  "manifest_sha256": "<64-hex>",
  "package_lock_sha256": "<64-hex>",
  "declared_file_count": 0,
  "actual_file_count": 0,
  "missing_file_count": 0,
  "extra_file_count": 0,
  "changed_file_count": 0,
  "symlink_count": 0,
  "receipt": "opl-windows-guest-host-payload-qualification.json"
}
```

The receipt binds the packaged payload to the exact `shell_ref` and
`framework_ref` already recorded in `manifest.json`, and to the digests of
`manifest.json` and `package-lock.json`. It proves the packaged Windows guest
Host payload matches its packaged manifest byte for byte. It does not prove WSL2
provisioning, guest bootstrap, Codex execution, App release admission, or
production readiness; those remain with their owners.

## Codex CLI version ownership

The macOS Standard and Full App bundles do not embed a second Codex CLI.
`opl-codex-native` starts the exact external or Framework-managed executable
selected through `OPL_CODEX_BIN` and the existing desktop resolver. Respect
explicit user-managed paths; Framework owns managed installation and updates.
The clean-VM qualification tarball is a test input, not an embedded CLI. App pins
the current stable Codex version and verified npm digests in its qualification
manifest; Windows/WSL bootstrap and Docker release builds consume that same
version. The Studio Dockerfile/Compose defaults must match it. Freeze these inputs
for an operation; do not resolve a moving npm tag during a resumed qualification.
Read the actual managed version during migration and task acceptance as well.

The Docker/WebUI carrier does include Codex CLI and pins its default npm spec
in `Dockerfile` and `compose.yaml`; those files own the pinned version. Runtime
acceptance must read the image binary version as well as exercise the App Server
protocol. DSH Alpha selection does not change the Codex stable channel.

The macOS afterPack hook boots the Host from the actual `app.asar` using the
packaged Electron binary and an isolated temporary profile with fake owners.
Missing runtime peers fail the build before signing. Desktop smoke selects the
current architecture output directly, never a recursively discovered old backup.

App Server stdio uses LF-delimited JSON frames, decoded across UTF-8 byte chunks.
Do not use Node `readline` for responses: Unicode line and paragraph separators
(U+2028/U+2029) are legal inside JSON strings, but newer Node versions split them.
Real histories containing these characters otherwise produce invalid fragments
and a misleading `thread/list` timeout. The history transport regression covers
large responses, Unicode separators, fragmented UTF-8, and CRLF framing without
truncating or rewriting canonical history.

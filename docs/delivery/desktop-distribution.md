# macOS Desktop Distribution Evidence

`opl-studio` remains the side-by-side successor candidate. Its current bundle identity is
`cn.onepersonlab.opl.studio.preview`; this evidence does not adopt it as the active release shell or replace the
installed AionUI-based App.

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

`npm run qualify:desktop:clean-vm` clones the configured Tart macOS base, installs the exact local DMG,
launches the packaged App through a temporary SSH/CDP tunnel, and delegates to the same Preview smoke
harness. `--attach` reuses an already running CDP target for debugging; it does not claim package identity
unless `--app-path` allows a real `Info.plist` readback. Its receipt always keeps `cleanVmReady=false` and
`releaseReady=false`: a successful local install is candidate evidence only, while a missing Framework/Codex
runtime is recorded as a typed blocker instead of being hidden behind a shell fallback. The harness deletes
the temporary VM by default; use `--keep-vm` only for local debugging.

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

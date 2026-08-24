# Candidate Verification

Owner: `one-person-lab-app`
Purpose: `candidate_verification_boundary`
State: `active_support`
Machine boundary: Command and evidence interpretation guide. Passing commands
proves only the named source, test, build, package, or local-smoke layer; it does
not prove App adoption, release, owner acceptance, or production readiness.

## Repository-Native Gate

```bash
npm ci
npm test
```

`npm test` runs the repository's `test:source` gate: typecheck, focused
Desktop/headless/OCI and projection tests, Host/MCP and thread tests, Client
Cordis checks, and the candidate validator. It does not construct carrier
artifacts. Read `package.json` before relying on this summary because the script
is the command owner.

## Focused Commands

| Command | Evidence layer |
| --- | --- |
| `npm run typecheck` | TypeScript source consistency |
| `npm run test:desktop` | Electron isolation, IPC adapter, updater, and guarded shutdown behavior |
| `npm run test:headless` | Standalone bind/config validation, health/readiness, real child App Server startup, and bounded signal shutdown |
| `npm run headless:install` / `headless:status` / `headless:stop` / `headless:start` / `headless:restart` / `headless:update` / `headless:rollback` / `headless:uninstall` | Current-user macOS/Linux native service lifecycle commands; platform support and public distribution remain separately admitted |
| `npm run test:threads` | Standard Desktop/WebUI thread lifecycle, pagination, renderer, and Codex subagent projection tests |
| `npm run test:webui-host` | DSH Host boot/profile/plugin inventory, authenticated DSH-tool MCP, persistent Codex ownership, shared Host core, HTTP/SSE, model/thread pagination, OPL projection, and read-only mutation guard |
| `node --test scripts/webui-host/opl-passthrough.test.mjs` | Fast Host projection compression, managed-update envelope filtering, and bounded state transport |
| `node --test scripts/webui-host/thread-workspace-service.test.mjs` | Canonical thread-workspace list/read/search behavior, bounds, UTF-8 handling, and traversal/symlink containment |
| `bun test tests/workbench/runtime-projection.test.mts` | Workbench consumption of the compressed Framework managed-update and Flow dependency projection |
| `bun test tests/workbench/project-progress.test.mts` | Exact workspace-to-project matching and explicit Stage/Attempt/attention/next-action projection without inferred current Stage |
| `node --test tests/renderer/thread-renderer-source.test.mjs` | Renderer source contract, including the three Client Cordis Detail tools and their bounded UI paths |
| `npm run test:client-cordis` | Studio Client Cordis policy, typed event/slot lifecycle, and exact contribution action request |
| `npm run validate:client-conformance` | Fresh four-repository Host -> App -> Studio/AionUI compatibility and wire-ref readback |
| `npm run validate:candidate` | Required source markers and false-ready guards |
| `npm run verify:dsh-gui` | Byte parity of the pinned DSH `v0.1.1-rc.2` GUI source manifest |
| `npm run validate:state-model` | Runtime-backed App-state projection mapping; requires a real `opl` CLI/state source and is not part of default PR/main source CI |
| `npm run smoke:webui` | Local WebUI host/renderer smoke |
| `npm run smoke:visual` | Source-level visual smoke |
| `OPL_APP_REPO_ROOT=/absolute/app/root npm run package` | App-contract-driven three-carrier local qualification and exact-commit evidence: Electron `.app`, standalone WebUI archive, Docker smoke receipt, and candidate manifest; requires macOS, Docker, and tracked-clean committed Studio source |
| `npm run validate:package` | Electron package and three-platform builder configuration structure |
| `npm run dist:windows` | Unsigned Windows x64 unpacked app, NSIS, and ZIP construction with publishing disabled |
| `npm run dist:linux` | Unsigned Linux x64 unpacked app and DEB construction with publishing disabled |
| `npm run qualify:desktop:distribution` | Current-platform native package-set presence and executable-shape checks |
| `npm run smoke:desktop-live` | Current-platform packaged executable startup, exact optional version readback, Chromium AX tree, and App Server cleanup smoke |
| `npm run build:docker` | Local source-candidate OCI image construction only |
| `npm run smoke:docker` | Local Docker build/run, health/readiness, non-root PID 1, persistent mounts, and guarded stop |

## Three-Carrier Candidate Evidence

`npm run package` reads the `opl-studio` carrier evidence contract from the App
root selected by `OPL_APP_REPO_ROOT`. It rejects tracked source changes, binds
the manifest to the exact Studio `HEAD`, runs the qualification commands named
by the App contract, and writes the four outputs documented in the root README.
Run it only after the intended Studio source is committed. The App candidate
wrapper supplies the current App worktree root explicitly.

This proves that the three local candidate artifacts were constructed and
qualified under that contract. It does not prove distribution/update wiring,
signing, notarization, a public feed or registry image, release admission,
active-shell adoption, or production readiness.

## Cross-GUI Client Qualification

```bash
npm run validate:client-conformance -- --out out/qualification/client-conformance.json
```

The gate reads Framework, App, AionUI, and Studio remote-main refs, verifies
local tracking refs against the wire, materializes the canonical Framework
producer in a temporary directory, and runs one Host projection through both
GUI parsers and Studio Client Cordis. It also compares the App and generated
AionUI composition model plus `client_renderer_compatibility` profile, verifies
Studio derives the same RPC/event/state/brand policy, and checks the exact App
contribution action shape. The tracked evidence fixes the three external owner
repositories; each ignored receipt also records the Studio main and candidate
commit/tree observed by that exact run.

Run the AionUI focused DOM test in its own repository to exercise its real
renderer caller:

```bash
bunx cross-env VITEST_INCLUDE_DOM=1 vitest run --project dom \
  tests/unit/opl-runtime/OplUiContributionSlot.dom.test.tsx
```

These gates establish renderer compatibility for the tested cohort. They do
not adopt Studio, switch the active shell, or qualify a release artifact.

The current service-status acceptance also requires the typed placement boundary:
`service_status` contributions project to `settings.services.installed_services`,
while `activity_log` remains destination-null and absent from ordinary Settings.
Fleet telemetry and doctor are exercised through their descriptor-declared refs;
their bounded summary may show local checks, but individual unavailable checks do
not override a healthy top-level service state.

## DSH Upstream Upgrade Gate

The upgrade owner is `src/composition/deepseekHarnessSourceManifest.json` plus
the exact dependencies in `package.json`. A DSH upgrade must update one pinned
source ref and package cohort, regenerate the vendored GUI manifest from that
checkout, replay the `opl-studio` profile and Web/profile/bundle patches, then
run `verify:dsh-gui`, typecheck, WebUI Host/MCP tests, headless tests, renderer
source tests, and the candidate validator. Passing only package installation or
GUI byte parity does not prove Host/plugin compatibility.

## Rendered WebUI Acceptance

```bash
node scripts/acceptance/rendered-ui.mjs
```

This CLI-first browser gate starts the shared WebUI against the repository fake
App Server, checks the wide and narrow layouts, the three on-demand context
tabs, all App-owned settings destinations, and Settings modal focus
containment/restoration. It writes screenshots and an exact source/renderer/DSH
cohort receipt under ignored `out/acceptance/`.

This is local rendered candidate evidence. It does not establish human Pixel
approval, screen-reader qualification, a packaged or installed carrier, active
shell adoption, or Release readiness.

When the App checkout mounts this repository at the expected candidate path,
the App owner can also run `npm run validate:candidate:native`. That is App
candidate-conformance evidence, not release adoption.

## Local Packaged-App Smoke

```bash
npm run smoke:desktop-live
```

This command launches the current-platform unpacked package, requires a real
window and a passing Chromium accessibility-tree smoke, and verifies that
quitting the App removes its Electron and Codex App Server processes. Its
Electron process uses a smoke-owned working directory and `DSH_HOME`; the Codex
test workspace remains the explicitly selected repository path. This prevents
the package from resolving DSH profile modules through `~/.dsh` or an unrelated
worktree. The packaged closure must contain the exact direct production
dependencies required by the pinned Host, including `@deepseek-ai/dsh-llm`,
`@deepseek-ai/dsh-session`, and `@deepseek-ai/dsh-timeout`; profile fallback
is not packaging evidence. The smoke output is candidate evidence only. It
does not establish an installer flow,
clean-VM behavior, shared Runtime parity, native screen-reader behavior,
active-shell adoption, or release readiness.

## Installed Preview Acceptance

An installed Preview pass is a separate live acceptance layer after package
construction. Install only the isolated `cn.onepersonlab.opl.studio.preview`
bundle through the App-owned atomic installer, then bind readback to the exact
candidate commit and installed `app.asar` bytes. The Stable
`/Applications/One Person Lab.app` bundle and running process must remain
unchanged.

The minimum installed pass verifies all of the following from
`/Applications/One Person Lab Preview.app`:

- the Electron main process, sandboxed renderer, pinned DSH Host plugins, and
  persistent `codex app-server --stdio` child start from packaged resources;
- desktop shows no OPL pseudo-logo or custom conversation header, retains DSH's
  native hero/timeline placement, gives the wide sidebar title an 18 px top
  inset while preserving compact-rail geometry, and exposes a top drag region
  before mount;
- App-owned Settings placement shows `service_status` under Installed Services,
  keeps raw technical data collapsed until explicitly opened, and keeps
  `activity_log` absent from ordinary Settings;
- Framework-owned Gateway and managed-companion projections render their real
  connected, unavailable, or unconfigured states without inferring success;
- one real Codex turn reaches `completed`, `thread/read(includeTurns=true)`
  returns the user and agent items, graceful quit removes the Preview App Server
  child, and the same canonical thread is readable and visible after restart.

The current installed receipt is bound to candidate
`71ce9b4e347dd2921f9ffa8da27d0cadf11c3624` and installed `app.asar` SHA-256
`c7250fc6e6a56b1672a54ff2584124ff5b5efe33d45a12a4e96975b7b505f0a7`.
Live Preview readback additionally verified the ordered Project progress, Files
and results, and Agents and capabilities shortcuts; automatic refresh from an
initially unavailable project projection; four exact NF-PitNET work items; a
360 px Detail column and zero-width closed layout column; root `workspace.yaml`
search and preview; explicit rejection of `../package.json` and `/etc/passwd`;
the Skills, Plugins, and Apps groups; text-only product identity; and recovery
of canonical thread `01a0332a-2f3d-7e31-b05b-1e18085dea22` with its completed
reply. Browser console readback contained no errors or warnings during this
interaction pass.

This pass closes only the installed candidate cohort whose exact bytes were
tested. Any later Host, renderer, dependency, bridge, or contract change that
affects the installed path requires a fresh package and installed acceptance.
It does not set `active_shell_adopted`, qualify an update feed, replace the
Stable App, or establish release, clean-VM, owner, or production readiness.

## Daily Source Validation

`.github/workflows/non-release-validation.yml` is the default PR/main gate. It
runs source, type, contract, and unit validation only. It does not build a
Desktop package, install a service, start Electron, or construct a Docker image.
It also does not call the runtime-backed `validate:state-model` command or
require an installed OPL Framework CLI.

The local default `npm test` uses the same `test:source` boundary. The broader
`npm run test:full` entry remains available for runtime state, visual smoke,
App-contract-driven three-carrier candidate construction, and packaged-artifact
validation. Because `test:full` reaches `npm run package`, run it only from a
committed, tracked-clean Studio checkout with the intended App root and a
working local Docker daemon.

## macOS Desktop Release Qualification

`.github/workflows/macos-desktop-release-qualification.yml` is a manual release
qualification for the primary macOS arm64 Desktop carrier. It constructs the
unsigned arm64 DMG/ZIP, validates the package and disk image, checks the exact
executable architecture, launches the packaged app, reads its interaction tree,
and proves child-process cleanup. Release signing, notarization, publication,
and public feed readback remain separate App-owned release gates.

## Additional Carrier Qualification

`.github/workflows/additional-carrier-qualification.yml` runs manually. It
builds and checks exact-head unsigned candidates on
GitHub-hosted Windows x64 and Linux x64 runners:

- Windows requires two unsigned unpacked/NSIS/ZIP cohorts under the same fixed
  product identity, then proves base install, newer-version update, old-version
  rollback, and exact uninstall. Every launch reads the running Electron version
  rather than trusting the installer exit code or artifact filename;
- Linux requires the unpacked executable and DEB, prepares the
  packaged Chromium sandbox according to the runner's user-namespace support,
  launches the unpacked executable under Xvfb, then uses APT for base install,
  update, explicit downgrade rollback, and purge. The installed DEB metadata and
  each running version must match the expected cohort;
- both platform sequences reuse one bounded temporary Electron state directory
  and require its pre-existing marker to survive update and rollback;
- both platforms require a visible One Person Lab window, a Chromium AX tree,
  and a process-bound native Windows UIA or Linux AT-SPI tree with no unnamed
  interactive controls at base, update, and rollback; each launch also requires
  bounded App Server cleanup;
- every distribution command uses `--publish never`.

This closes the unsigned NSIS and DEB install/update/rollback/uninstall
lifecycle on ephemeral GitHub-hosted runners. AppImage is rejected from the supported target
set because its FUSE mount cannot supply the setuid Chromium sandbox and Ubuntu
24.04 requires an installed AppArmor policy for the user-namespace alternative.
CI does not provision that policy, extract the image, or disable the sandbox to
turn a prepared host into false portable evidence. The gate does not establish
a dedicated clean-VM cohort; prove schema migration across incompatible state;
run NVDA or Orca or otherwise prove screen-reader user experience; sign or
publish artifacts; or establish platform support or release readiness.

## Local Headless And Docker Smoke

```bash
npm run build:webui
npm run start:headless
```

Read `/healthz` for liveness and `/readyz` for Codex App Server initialization.
Stopping the process with SIGINT or SIGTERM must emit
`headless_server_stopped` inside the configured shutdown bound.

The hosted macOS and Linux Headless jobs read the exact Framework and App
commits from `src/candidateContractEvidence.json`, prepare the Framework source
CLI's workspace Packages, build the shared WebUI, pin Codex CLI 0.147.0, then
install a base payload, update to the exact checkout, roll back to the kept base
payload, and inspect the final state through the public commands. Every running
transition requires a ready Codex App Server, successful Framework App-state
command, `opl_app_state.v1`, and the expected installation-record version.
macOS verifies its LaunchAgent; Linux verifies a non-root systemd user unit and
also exercises explicit stop, start, and restart. Each `always()` cleanup proves
the native service definition and install root are absent. The hosted clean
runner gives the cold Framework source CLI one bounded two-minute owner-state
read window; the normal interactive state-read default remains 30 seconds.
These jobs do not qualify remote binding, a public installer, signing, release,
or production.

When a local Docker daemon is available:

```bash
npm run smoke:docker
npm run smoke:docker:lifecycle
```

The first smoke builds an isolated candidate tag, starts it with isolated `/data` and
`/projects` volumes, verifies HTTP health and readiness, UID 1000 and Node PID 1,
then stops and removes its container, volumes, and image. The lifecycle smoke
adds install, update, recreate, rollback, preserving uninstall, reinstall, and
destructive cleanup with immutable local image IDs. The hosted non-release
matrix constructs runner-local `linux/amd64` and `linux/arm64` OCI layouts with
SBOM/provenance attestations on matching native GitHub-hosted runners, then runs
the lifecycle on each architecture. None
of these paths proves registry publication, digest/cohort authority, clean-host
installation, remote access safety, or release readiness.

## False-Ready Guard

The following remain false unless their owning App/runtime/domain/release gates
provide exact fresh evidence:

- `active_shell_adopted`
- `release_ready`
- `production_ready`
- `clean_vm_ready`
- `remote_ready`
- `domain_ready`
- `owner_receipt`
- `package_truth_owned`
- `runtime_authority_transfer`
- `domain_truth_owned`

The machine-readable candidate marker requirements and false-ready fields live
in `src/candidateContractEvidence.json`. This prose explains their meaning; it
does not replace that validator input.

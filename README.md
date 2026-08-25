# OPL Studio

<!--
Owner: `one-person-lab-app`
Purpose: `public_native_product_entry`
State: `active_product_development_release_admission_separate`
Machine boundary: Human-readable Native product entry. App product and adoption truth stays in one-person-lab-app contracts; runtime/package truth stays in OPL Framework; domain truth stays with domain owners. This page does not prove active-shell adoption, release readiness, owner acceptance, or production readiness.
-->

`opl-studio` implements the first-party One Person Lab Studio Application Host.
It is built on the pinned DeepSeek Harness `v0.1.1-rc.2` Cordis application
skeleton and React GUI source, not just the DSH GUI modules. Electron is the
desktop carrier for macOS, Windows, and Linux; HTTP/SSE exposes the same Host,
renderer, and App bridge for standalone WebUI, headless, and Docker forms.

The wider product model remains `OPL Base + OPL App + OPL Packages + optional
OPL Cloud`. Studio is the App-facing Application Host and plugin host inside
that model. It does not become Base, take over Framework runtime/Package truth,
install or publish Packages, or own Cloud services.

The DSH binding is intentionally upgradeable but pinned. `npm run dsh:status`
shows the current upstream ref and cohort. Before an upgrade, run:

```bash
npm run dsh:preflight -- --source <clean-deepseek-harness-checkout>
```

This produces a read-only upgrade plan before any source or dependency write;
it is not compatibility or Preview acceptance.

AionUI remains the active release shell. Selecting or launching Studio is a
local development choice only; it does not change the release adapter, updater
channel, App product truth, installed App, or current platform support. AionUI
and AionCore are not candidate renderer/runtime dependencies.

Studio boots a dedicated `opl-studio` DSH profile. The profile uses DSH boot,
profile/patch loading, native tool registry, WebServer, frontend modules, and
plugin inventory, then loads the OPL-owned `opl-dsh-tool-mcp`,
`opl-codex-native`, `opl-framework-bridge`, Host core, and Web route plugins.
It deliberately does not load `dsh-base`, so DSH does not introduce a second
session store, LLM/provider router, Agent loop, or credential owner.

`opl-codex-native` starts one persistent Codex App Server from `OPL_CODEX_BIN`
or an exact external Codex executable. It remains the only Studio owner of
canonical threads and turns, approvals, live events, and App Server lifecycle.
Plugins that register tools in DSH `ctx.tools` are exposed to that Codex process
through an authenticated, stateful loopback MCP endpoint. Plugins that require
the excluded DSH session/LLM/Agent/credential services are not automatically
compatible and need a separate owner decision and adapter.

`opl-framework-bridge` consumes only Framework App state/action, authentication,
and channel callback contracts. Framework keeps runtime and Package authority;
Studio does not copy those states into its Cordis graph. Codex App Server stdio
is the only enabled Agent carrier; `pi` and `hermes` remain disabled names with
no current code path or dependency.

Package-facing GUI composition uses the same App Client Contribution ABI,
product profile, typed RPC/events, product state semantics, and slot/action
policy as AionUI. This browser Client Cordis projection is separate from the
server-side Studio Application Host: it is derived only from the Framework Host
projection and cannot discover/install Packages, own another
registry/currentness/state/action plane, receive release-operation, or own task,
Package, or product truth. Framework's Host projection is active, and the
candidate conformance gate now runs its canonical producer through the App
profile into both Studio and AionUI parser semantics. This proves a compatible
candidate Client path, not active-shell or release admission. DSH owns the
reused typography, spacing, layout, colors, component state, and interaction;
OPL supplies only text identity, real projections, policy, and thin adapters.

Brand capability combinations are dynamic App/Host projections. Studio does
not maintain a fixed roster of named OPL brands or Packages; it renders the
current allowlisted graph and keeps the default general Agent as product shell
behavior.

OPL Workspace serves the same renderer through the shared Node host core and a
lightweight HTTP/SSE adapter. Docker runs neither Electron nor AionCore. The
source now includes a standalone Node command and a non-root OCI carrier with
`/data` and `/projects` persistence. Hosted Windows x64 and Linux x64 gates now
build two unsigned native package cohorts, launch the unpacked base executable,
and drive the real Windows NSIS or Linux DEB through install, update, rollback,
and uninstall. Each installed launch reads the exact running version, requires
the Chromium accessibility-tree smoke plus a process-bound Windows UIA or Linux
AT-SPI tree with named interactive controls, and reuses one temporary user-state
marker across the version transitions. This is an ephemeral hosted-runner
package-lifecycle and native-API accessibility baseline. It is not dedicated
clean-VM, NVDA/Orca user-experience, signing, release, or platform-support
qualification. AppImage is intentionally not a supported target: a user-mounted
FUSE image cannot provide the setuid Chromium sandbox,
while Ubuntu 24.04 requires an installed AppArmor policy for the alternative
user-namespace sandbox. The App does not hide that conflict with host
provisioning, extraction, or `--no-sandbox`. Every desktop platform and the
successor OCI carrier still require their remaining independent delivery
admission before they can be claimed as released or supported. The non-release
workflow now builds a runner-local `linux/amd64` + `linux/arm64` OCI layout with
SBOM/provenance attestations, then runs the existing install/update/recreate/
rollback/uninstall lifecycle on both architectures. It does not log in to a
registry, push an image, or create a release cohort.

The macOS and Linux non-release lanes also install the standalone Headless
WebUI as a per-user LaunchAgent or systemd user service from the exact candidate
Framework/App/Codex inputs. They read `/readyz` and `opl_app_state.v1` through
the installed payload, verify the native service definition and absolute
runtime paths, exercise stop/start/restart/update/rollback, then remove the
service definition and install root. These are installed user-service
qualification paths, not supported installers, update channels, remote-access
boundaries, release, or production claims.

The conversation directory is not a Native copy. It reads the same
Codex-visible default source set through `thread/list`, then opens the same
thread ID with `thread/read includeTurns=true`. Native stores only UI selection,
settings, and unsent drafts locally.

## What You Can Evaluate

- a persistent project and conversation rail around one dominant chat timeline;
- the DSH/Cordis Host profile, plugin inventory, profile overlays, and plugin
  lifecycle used by both Desktop and WebUI;
- DSH-native tool plugins called by Codex through the authenticated MCP bridge;
- Codex App Server thread, turn, streaming, and history integration;
- read-only Codex subagent lineage, role, source, and activity projection from
  native App Server thread/turn items;
- App state readback plus typed preview and contribution execution through the OPL bridge;
- Settings, artifact previews, professional starter forms, and package status
  projections that remain refs-only;
- one OPL-owned renderer and host core across Electron desktop and OPL Workspace.

The candidate may display only state and actions supplied by App/Framework
contracts. Placeholder, fallback, or unavailable data remains visibly
non-authoritative and cannot become package, runtime, artifact, domain, or
readiness truth.

## Try It Locally

Launch the candidate from the One Person Lab App repository:

```bash
npm run gui -- --shell opl-studio
```

Use `--rebuild` to rebuild and replace only
`/Applications/One Person Lab Preview.app`. The candidate has the isolated bundle
id `cn.onepersonlab.opl.studio.preview` and does not replace
`/Applications/One Person Lab.app`.

Candidate actions are dry-run-only by default. `--allow-actions` is an explicit
local override that still requires the candidate confirmation path. Directly
opening the bundle uses host-path fallback and does not prove parity with the
App-managed launcher.

### Standalone WebUI

Build the shared renderer once, then start the Node host:

```bash
npm run build:webui
npm run start:headless
```

The default URL is `http://127.0.0.1:4178`. `OPL_HEADLESS_HOST`,
`OPL_HEADLESS_PORT`, `OPL_CODEX_BIN`, `OPL_APP_OPL_BIN`, `CODEX_HOME`, and
`OPL_STUDIO_CODEX_CWD` select the bind and external runtime inputs. `/healthz`
is process liveness; `/readyz` is successful Codex App Server initialization.
SIGINT and SIGTERM close HTTP/SSE and the child App Server within the configured
shutdown bound.

On macOS or Linux, after building the WebUI and supplying absolute
`OPL_APP_OPL_BIN`, `OPL_APP_REPO_ROOT`, `OPL_CODEX_BIN`, and `CODEX_HOME` paths,
the candidate service commands are:

```bash
npm run headless:install
npm run headless:status
npm run headless:stop
npm run headless:start
npm run headless:restart
npm run headless:update
npm run headless:rollback
npm run headless:uninstall
```

They manage only the current user's `com.onepersonlab.headless` LaunchAgent or
`one-person-lab-headless.service` systemd unit and default to loopback. The
installed payload lives under the user's Application Support directory on
macOS or local data directory on Linux; update keeps one previous payload and
rollback restores it, with both transitions restarting and reading back the
same service. Command options can select a different absolute install root,
workspace, port, and loopback host.

### Docker Candidate

```bash
docker compose up --build
```

Compose publishes only to host loopback by default, persists `/data` and
`/projects`, and runs the image as UID 1000. The image starts Node directly; it
contains no Electron, AionUI, or AionCore runtime. Its default OPL Framework
commit, App product-profile commit, and Codex package are candidate build inputs
that can be overridden with exact inputs. The App source is used only to build
the renderer policy and is not copied into the runtime image. These defaults are
not a release cohort or update contract. Do not expose the HTTP bridge to an
untrusted network; this candidate has no remote access control boundary.

### Three-Carrier Candidate Package

`npm run package` is the contract-driven candidate packaging entry, not an
alias for Electron packaging. Run it on a macOS qualification host from a
committed, tracked-clean Studio checkout and point it at the intended current
App checkout:

```bash
OPL_APP_REPO_ROOT=/absolute/path/to/one-person-lab-app npm run package
```

The command reads the `opl-studio` carrier evidence contract from that App
checkout, runs each required local qualification command, and creates:

- the current-architecture Electron `.app` directory;
- `out/standalone-headless-webui.tgz`;
- `out/docker-local-smoke.json` from a real local Docker smoke;
- `out/opl-studio-carrier-evidence-manifest.json`, bound to the exact Studio
  `HEAD` and the three artifacts above.

The command fails when tracked Studio source changes before or during
qualification. The App wrapper injects its own absolute `OPL_APP_REPO_ROOT`, so
an App task worktree cannot silently read contracts from another checkout.
The resulting manifest is local candidate evidence only: distribution wiring,
update wiring, signing, notarization, public publication, release admission,
and active-shell adoption remain separate App-owned decisions.

## Authority Boundary

| Concern | Owner | Native role |
| --- | --- | --- |
| GUI product behavior, model policy, page states, and adoption | `one-person-lab-app` contracts | Implementation consumer only |
| Studio Application Host, DSH profile, plugin lifecycle, and DSH tool MCP | This repository | Source implementation owner |
| Runtime and projected Package state/actions | OPL Framework Host plus Package owners | Read/project exact refs; dispatch owner actions only |
| Thread identity, history, permissions, approvals, and turns | Codex App Server via `opl-codex-native` | Persistent native backend owner |
| Professional truth, quality, artifacts, and delivery | Domain owners | Refs-only presentation |
| Renderer, carriers, packaging, and focused tests | This repository | Implementation evidence only |

The App registry keeps Studio as the foreground alternative while its first-party
product implementation is developed. Active-shell adoption and release
participation still require separate App-owner qualification. Studio does not maintain a private proposal,
dispatch, wait, queue, ledger, bilateral-receipt, or client-executed dynamic-tool
layer. AionUI Team's multi-executor orchestration is a separate shell capability;
it does not replace Codex-native subagents and is not implemented here.

## Current Evidence Boundary

Source validators, tests, renderer smoke, WebUI smoke, exact-commit
three-carrier package construction, and local packaged-app smoke can prove their
exact candidate layers. They do not
prove active-shell adoption, release readiness, clean-VM readiness, shared
physical Runtime parity, domain readiness, owner acceptance, or production
readiness.

## Documentation

- [Documentation and owner map](docs/README.md)
- [Implementation and authority architecture](docs/architecture.md)
- [Candidate architecture whitepaper](docs/whitepaper.md)
- [Current state, gaps, and next Agent prompt](docs/active/current-state-vs-ideal-gap.md)
- [Verification and evidence boundaries](docs/verification.md)
- [Historical candidate baseline](docs/history/README.md)

<details>
  <summary><strong>Developer checks</strong></summary>

```bash
npm ci
npm test
```

`npm test` runs the source gate: typecheck, focused desktop/headless/OCI
regressions, candidate contracts, and the typed contribution tests. It does not
start Electron, run visual smoke, construct a package, or validate a packaged
artifact. Use `npm run test:full` when those broader local checks are needed.
Use `OPL_APP_REPO_ROOT=/absolute/path/to/one-person-lab-app npm run package`
when exact-commit three-carrier candidate evidence is required; it additionally
requires a working local Docker daemon and a tracked-clean Studio checkout.
Run `npm run smoke:desktop-live` separately for local packaged-window evidence.
Run `npm run smoke:docker` separately for a local OCI build/runtime smoke.
See [verification](docs/verification.md) before interpreting either result.

</details>

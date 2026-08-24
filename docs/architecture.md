# OPL Studio Architecture

Owner: `one-person-lab-app`
Purpose: `application_host_implementation_boundary`
State: `active_technical_reference`
Machine boundary: Human-readable implementation and authority map. Source and
tests prove only their exact candidate behavior; App contracts, Framework
readback, Codex App Server, and domain owners retain their respective truth.

## Authority Stack

This repository implements the independent Studio Application Host in the
one-product/multiple-carrier topology. `one-person-lab-app` owns product and
release truth, `opl-aion-shell` remains the Stable AionUI carrier, and
`opl-studio` implements the DSH/Cordis Host intended to become the first-party
Studio carrier. Source completion does not by itself change the selected Stable
carrier, GUI ABI freeze, release composition, or installed product.

```text
DeepSeek Harness v0.1.1-rc.2 boot/profile/patch loader
  -> Studio Cordis Application Host
       -> DSH native tool registry -> authenticated MCP -> opl-codex-native
       -> opl-framework-bridge -> public OPL App contracts
       -> shared renderer/Web routes -> Electron IPC or HTTP/SSE

OPL Framework Cordis Host
  -> runtime and Package composition
  -> opl app state/action + authentication + channel callback
  -> Studio's opl-framework-bridge

Codex App Server separately owns canonical thread/turn protocol, history,
approvals, and live events.
```

The two Cordis Hosts have different scopes. Studio owns its App process,
plugins, GUI, and Codex tool exposure. Framework owns OPL runtime/Package
composition and projections. The bridge uses public contracts rather than
sharing registries, currentness, sessions, or internal service graphs.

## Studio Application Host

`scripts/webui-host/dsh/host.mjs` boots the `opl-studio` profile from
`scripts/webui-host/dsh/cordis.yml`, initializes
`$DSH_HOME/profiles/opl-studio`, heals the standard profile module fallback,
and applies the Web overlay plus profile/bundle patches. The profile uses these
DSH services:

- `dsh-system-prompt` without DSH identity or runtime context;
- `dsh-tools` in native registry mode;
- `dsh-host-webserver` and `dsh-host-plugin-inventory`;
- Web-only frontend static hosting and client modules.

Studio deliberately does not load `dsh-base`. Therefore DSH session, LLM
provider routing, Agent loop, and credential services do not become a second
backend. The OPL plugin tree is:

```text
opl-dsh-tool-mcp
  -> opl-codex-native
       -> opl-framework-bridge
            -> opl-host-core
                 -> opl-web-routes (Web overlay only)
```

Startup is DSH tree and Tool MCP, then Codex App Server, then Framework bridge.
Shutdown reverses the stateful edges: Framework callback, Codex App Server,
then the Cordis tree.

`opl-dsh-tool-mcp` exposes the current DSH `ctx.tools` registry through a
stateful Streamable HTTP MCP endpoint on the Host loopback WebServer. A random
bearer token is visible only to the Codex child environment. Codex receives the
MCP URL and token-env name as launch-time `-c mcp_servers.opl_studio_dsh.*`
overrides, so Studio does not mutate the user's global Codex config. Dynamic
DSH tool changes emit MCP `tools/list_changed` notifications.

This gives DSH tool plugins a direct path into the persistent Codex backend.
It does not promise universal compatibility: plugins that only register
`ctx.tools` can be consumed directly; plugins that depend on the excluded
`dsh-base` session, LLM, Agent, or credential services require an explicit OPL
adapter and authority decision.

### DSH Version And Plugin Compatibility

The pinned `0.1.1-rc.2` cohort is newer than `0.1.0-rc.6`, `0.1.0-rc.7`, and
`0.1.0-rc.8`. The apparent incompatibility with plugins declaring ranges such
as `^0.1.0-rc.8` is not a downgrade: npm prerelease range matching does not
automatically admit a prerelease from a different patch tuple, so
`0.1.1-rc.2` does not satisfy that range even though SemVer orders it later.

Package metadata is only the first gate. A plugin is directly reusable when it
registers a bounded `ctx.tools` capability or a renderer-only contribution
without claiming session or model state. A plugin that expects DSH Session,
LLM, Agent Runtime, credentials, or `dsh-base` cannot be installed unchanged,
because Studio intentionally assigns persistent thread/turn ownership to
`opl-codex-native` and Codex App Server. Such a plugin needs a small explicit
adapter that consumes Studio's existing owner APIs, or it remains unsupported.
Changing its peer range alone would hide the real authority conflict.

## Client Composition Boundary

Both the current AionUI shell and this DSH-derived Native candidate consume the
same App-owned Client Contribution ABI, product profile, slot vocabulary,
trust/scope/order rules, typed RPC reads/events, canonical App actions, product
state semantics, and disposal policy. Their renderer and package carrier may
differ; their Package graph and authority inputs may not.

The Framework Host graph remains the only OPL Package producer, identity, and
lifecycle authority. The target `opl app state` projection exposes its bounded
declarative client graph as `opl_app_ui_contributions_projection.v1`.
`readUiContributionsProjection()` normalizes that projection. The renderer
creates one `@deepseek-ai/cordis` Client context, provides the typed
`opl.app.client-contributions` face, publishes
`opl/app-client-contributions/updated`, and lets
`OplStudioDshSlotHost.replaceHostDerivedProjection()` register or dispose the
corresponding browser occupants. This browser Client graph is a projection
inside the Studio renderer; it is neither the server-side Studio Application
Host nor another Framework Host.

Framework's canonical producer is active. `npm run
validate:client-conformance` loads that exact producer, passes one Package
fixture through Host projection, and proves equal Studio/AionUI parser output,
equal App/AionUI composition policy, typed Client events and slots, canonical
action payload shape, and fresh state readback. The resulting qualification is
candidate compatibility evidence only.

The projected graph is closed and allowlisted by the App-owned
`contracts/opl-app-contributions.schema.json`: Package descriptors first pass
that declarative schema, then the Framework Host projects them. Studio mounts
only the three product-profile slots and retains commands only as typed action
refs. All writes then enter the canonical App action bridge. Unknown slots,
executable component fields, handlers, HTML, paths, URLs, and arbitrary plugin
objects cannot become Client Cordis occupants.

The renderer may register static DSH shell slots needed to draw the App, but it
must not discover or install OPL Packages, establish another Package
registry/currentness source, receive release-operation, or own task, Package,
product, state, action, session, or runtime truth. Cordis itself is not forbidden
in a GUI; a second independent graph or authority plane is.

The on-demand details column follows that rule. `opl.app.client-contributions`
publishes three ordered first-party Detail tools in the same Client Cordis
composition: Project progress, Files and results, and Agents and capabilities.
Project progress filters Framework's `work-item-projection.v2` by the canonical
Codex thread workspace and displays only explicit lifecycle, current Stage,
current Attempt, attention, and next-action fields. It never treats the first
pending Stage as current. The separate Runtime page remains the cross-project
and infrastructure control surface.

DSH Application Host and GUI source reuse remains Studio-only. AionUI can consume the same
Host-derived Client Cordis inputs through its own thin renderer adapter without
importing DSH GUI/runtime source.

Brand capabilities follow the same rule. The candidate reads the current
App/Host projection and does not own a fixed list of OPL brands, standard
Agents, or Package combinations. A renderer-local label fallback does not make
an item part of the active graph.

## Renderer And Host Topology

The implementation has one DSH/Cordis Application Host, one DeepSeek
Harness-derived React renderer, and one OPL Host core plugin. Transport adapters
do not own product or runtime behavior:

- Electron packages the renderer and host core for macOS, Windows, and Linux,
  exposing the typed `window.oplStudio` ABI through an isolated preload and
  allowlisted IPC;
- OPL Workspace exposes the same host core through loopback HTTP/SSE for
  standalone WebUI and headless operation;
- the successor Docker candidate runs the Node host core and WebUI only. It
  does not run Electron, AionUI, or AionCore.

The packaged candidate has an isolated name, path, bundle id, and default
read-only action policy. Source support and local package output are candidate
evidence only. They do not prove a platform release, clean installation,
updater cohort, released Docker image, or cross-carrier runtime equivalence.

`npm run package` materializes the App-owned three-carrier evidence contract
against one exact committed Studio `HEAD`. It requires tracked source to stay
clean while it qualifies and emits the current-architecture Electron `.app`, a
standalone WebUI archive, a Docker smoke receipt, and one candidate-only
manifest. `OPL_APP_REPO_ROOT` selects the App checkout whose
`app-shell-candidates.json` contract is read; the App wrapper supplies its own
absolute root. These outputs bind source and local qualification, but they do
not own distribution, update, publication, release, or adoption state.

## Headless And OCI Process Boundary

`scripts/headless/run.mjs` is the standalone process entrypoint. It validates
bind, port, renderer-root, and shutdown-bound inputs, boots the same Studio DSH
Host plus HTTP/SSE adapter used by the desktop architecture, and
owns SIGINT/SIGTERM shutdown. It reuses the renderer's single Host-derived
Client Cordis graph and does not introduce an independent composition graph,
thread store, action dispatcher, or renderer.

The HTTP adapter publishes two carrier-level probes:

- `/healthz` reports that the Node HTTP process is accepting requests;
- `/readyz` reports that the Codex App Server child completed initialization.

Readiness does not claim OPL package currentness, domain readiness, release
readiness, or production readiness. Framework state remains an on-demand
owner-authoritative `opl app state` read through the existing bridge.

The OCI candidate is a multi-stage build. The build stages materialize an exact
App product-profile commit, an exact OPL Framework commit, a pinned Codex npm
package, and the shared renderer. App source is a build-only product-policy
input and is absent from the runtime image. The final image contains only the
Node headless host, renderer, OPL Framework, and Codex runtime inputs. It runs as
the base image's `node` user, uses `/data` for `HOME`, `CODEX_HOME`, and OPL
state, and uses `/projects` as the workspace root. The final PID 1 is Node;
Electron, AionUI, and AionCore are absent.

Those default build arguments establish a locally reproducible candidate, not
a release freeze. App-owned release tooling must later replace them with the
accepted source cohort and digest verification before publication. Remote
exposure also remains inadmissible until an App-owned authentication and network
boundary exists; Compose therefore publishes host loopback only.

## Runtime Independence

Studio does not require, start, package, or read AionUI or AionCore.
`opl-codex-native` resolves `OPL_CODEX_BIN` or an exact external Codex
executable and starts `codex app-server --stdio` directly. Every carrier
consumes OPL only through Framework state/action
contracts; AionUI/AionCore managed-resource manifests, provider abstractions,
session/database state, backend, and authentication are not Native runtime inputs.

This independence creates a second Cordis Host process scope, not a second
writer for the same truth. Codex still owns thread/turn truth, Framework still
owns OPL state/actions and the authoritative Package Host graph, and App
contracts still own product behavior plus Client ABI/slot policy.

Codex CLI/App Server is the candidate's complete backend scope. App Server over
stdio is the only enabled carrier. `pi` and `hermes` are
reserved disabled identifiers only: they add no source implementation, package
dependency, runtime process, fallback route, or visible setting. A later carrier
must implement the existing bridge shape and receive a separate App owner
decision; it must not weaken the current Codex path.

## App And Framework Boundary

Ordinary state reads use:

```text
opl app state --profile fast --json
```

Explicit diagnostics may use the App-owned full state and operator drilldown.
Mutations route only through:

```text
opl app action execute --action <id> [--payload <json>] [--dry-run] --json
```

The candidate must not read OPL internal state files or infer installed, ready,
synced, release, or owner-accepted state. It prefers
`app_state.agent_packages` for package display and treats older `modules.items`
rows as preview-only fallback.

## Codex Thread Boundary

Codex App Server owns canonical thread identity, history, lifecycle,
permissions, model catalog, and turn state. Native consumes the App Server
thread/turn/event flow; `localStorage` is limited to UI selection, settings,
and unsent drafts.

Electron and WebUI use one standard adapter for `thread/list`, `thread/read`,
`thread/resume`, `thread/fork`, `thread/archive`, and `thread/unarchive`.
`parentThreadId`, `agentRole`, `agentNickname`, subagent source kinds,
`collabAgentToolCall`, and `subAgentActivity` are read-only Codex projections;
the candidate does not infer or own subagent scheduling.

The default directory reads the same Codex-visible source set as the Codex app
through `thread/list { sortKey: "updated_at", sortDirection: "desc" }`.
Opening a conversation performs a read-only
`thread/read { threadId, includeTurns: true }` against the same canonical thread
ID. It does not import, copy, synchronize, or rewrite Codex history. Resume is
an explicit lifecycle action and is not required merely to view history.

The retired private cross-thread layer is not an adapter or product capability.
Native has no separate proposal/dispatch/wait protocol, host queue, delivery
ledger, bilateral coordination receipt, client-executed dynamic tool set, or
cross-host handoff contract. AionUI Team is separately a shell-level
multi-executor facility for Codex CLI, Claude Code, and other executors. It is
not the Codex-native subagent capability and is outside this repository's
thread adapter.

## Model And Settings Boundary

The user-facing Settings information architecture and contribution placement
SSOT is documented in `docs/settings-information-architecture.md`. It keeps
App/Framework package and connection truth authoritative while routing
declarative settings views into the existing Resources, Services, and
Capabilities destinations; Studio does not create a second package registry.

Model defaults, visible choices, labels, reasoning options, and fallback policy
come from the App product profile plus fresh Codex `model/list` readback. Native
must not maintain a second model catalog or silently replace an unavailable
fixed selection.

Settings persistence remains candidate-local UI state. It does not grant system
write permission or ownership of App settings policy.

## Domain And Artifact Boundary

Research, grant, presentation, and book starters dispatch App-owned action refs
when available. Artifact previews render refs and supported formats. Neither
surface owns professional execution, source truth, quality judgment, artifact
authority, export acceptance, or delivery readiness.

## Adoption Boundary

AionUI is the current active release shell and only release mainline. Studio's
Application Host is implemented in source, but it does not
acquire mainline, full-AionUI-parity, release, or cross-platform delivery status
before its minimum-complete and release gates pass. Adoption requires an
explicit App owner decision and a change to the App shell adapter after the
relevant App-owned gates pass; only then may the AionUI mainline be retired.
Candidate docs, tests, package artifacts, screenshots, or local live smoke
cannot perform that transfer or prove release readiness. The current evaluation
policy and next safe work route are maintained only in
[the Active Truth plan](./active/current-state-vs-ideal-gap.md).

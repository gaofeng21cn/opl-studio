# OPL Studio Architecture

Owner: `opl-studio` implementation; App contracts retain product authority
Purpose: `application_host_implementation_boundary`
State: `active_technical_reference`
Machine boundary: Human-readable implementation and authority map. Source and
tests prove only their exact candidate behavior; App contracts, Framework
readback, Codex App Server, and domain owners retain their respective truth.

## Authority Stack

This repository implements the independent Studio Application Host in the
one-product/multiple-carrier topology. `one-person-lab-app` owns product and
release truth; `opl-studio` is the current Desktop, standalone WebUI and Docker
implementation on DSH/Cordis. AionUI is retired; its source and release records
are historical provenance only, not Studio build, runtime, migration,
qualification, workflow, or regression inputs. Source completion does not by
itself change the selected Stable carrier, GUI ABI freeze, release composition,
or installed product.

```text
DeepSeek Harness v0.2.2-rc.3 boot/profile/patch loader
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

## OPL Link product boundary

The App-owned [OPL Link product contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-remote-companion.json)
defines the primary mission: operate the existing OPL App remotely from a
phone. The companion route must continue to use the existing
`opl-codex-native` and Codex App Server; it does not create a second executor,
history store, or permission owner.

The separate [phone extension contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-remote-companion-extensions.json)
defines optional calendar, location, photo, music, health and alarm adapters.
They are disabled by default. A paired phone, a granted iOS permission, or a
phone-origin message is not enough to expose a tool to a conversation. Studio
may admit only a capability explicitly selected for the current request after
checking the module grant, device capability, live lease, authenticated source
and canonical thread owner. The next request starts without that catalog.

The current Codex turn start/steer API has no verified request-scoped dynamic
tool input. Therefore Studio must not register phone tools globally or emit a
global `tools/list_changed` when a phone connects. Until that gap is closed and
ordinary desktop and phone conversations are tested concurrently, the adapter
remains contract-only and disabled; connector failure must never affect the
remote companion's pairing, conversations, approvals, files or reconnect.

Pinned MIT upstream GUI source keeps typography, layout, tokens, and ordinary
interaction in one source cohort. OPL data, identity, and bridge adapters stay
outside the vendor tree, making upgrades replayable without a parallel design
system. Source identity and licenses live in `THIRD_PARTY_NOTICES.md`; the
manifest owns exact versions and file integrity.

## Studio Application Host

`src/host/dsh/host.mjs` boots the `opl-studio` profile from
`src/host/dsh/cordis.yml`, initializes
`$DSH_HOME/profiles/opl-studio`, heals the standard profile module fallback,
and applies the Web overlay plus profile/bundle patches. The profile uses these
DSH services:

- `dsh-system-prompt` without DSH identity or runtime context;
- `dsh-tools` in native registry mode;
- `dsh-host-webserver` and `dsh-host-plugin-inventory`;
- `dsh-client-modules` for the official Host-produced client graph;
- Web-only frontend static hosting for the small boot shell.

The main profile does not load `dsh-base`. The on-demand collaboration profile runs the complete official base/Web
application through the official CLI. Its private Node IPC transport borrows the
existing Codex execution owner; it starts no additional Codex App Server. The optional
Superagent profile is isolated and loads the official base and Web bundles. The OPL plugin tree is:

```text
opl-dsh-tool-mcp
  -> opl-codex-native
       -> opl-framework-bridge ─┐
       -> opl-mcp-apps ─────────┴─> opl-host-core
                 -> opl-web-routes (Web overlay only)
```

Startup is DSH tree and Tool MCP, then Codex App Server, then Framework bridge.
Shutdown reverses the stateful edges: Framework callback, Codex App Server,
then the Cordis tree.

### Independent Host And Client Plugin Updates

The bundled profile is a baseline. Compatible native npm packages installed in
`$DSH_HOME/profiles/opl-studio` can override it without modifying the desktop
bundle. `npm run dsh:plugins -- inspect` reads native profile resolution;
`update-source --package opl-superagent` builds and packs only the selected
Studio package, then uses the official DSH plugin manager/pnpm operation.
`update-registry --all` (or `--package <name>`) pulls the latest compatible
published version from GitHub Packages (`@gaofeng21cn` scope) into the native
profile, with optional `--token <ghp_...>` for registry authentication.
`remove --package @gaofeng21cn/opl-superagent` removes that override and
restores the bundled baseline on the next launch. Multiple explicit `--package`
arguments are supported. Installation reports restart required, not activation.

GitHub Packages uses the repository owner's `@gaofeng21cn` namespace. After a
replacement is installed, an explicit source/registry update removes its former
`@one-person-lab` override through the official DSH package manager and updates
the matching profile patch names; unrelated configuration is preserved. Read-only
checks and ordinary startup do not migrate the main profile. The carrier baseline
must already use the new namespace before these plugin updates are applied.

The operator can select another carrier with `--install-anchor <package.json>`
and another native home with `--home <directory>`. The default anchor is the
installed macOS App. The public plugin channel publishes OPL DSH Host and Client plugins to
GitHub Packages via `release-dsh-plugins.yml` CI on push to main; the composition
compatibility test (`release-plugin-composition-test.yml`) validates combinations
and emits a composition receipt for the shell-unchanged stable release path.
DSH retains package metadata admission, profile resolution and locking. Registry
updates inspect the selected carrier's baseline and DSH version, retain profile
authentication, save exact native dependencies, and report lookup failures rather
than treating them as a successful currentness check. Composition CI installs and
boots the receipt's exact registry versions; source-package tests alone cannot
qualify that receipt. Applying a receipt clears only its selected plugins' old
local lock records and installed paths before npm refreshes the lockfile; all
unrelated locked dependencies are retained. Both composition CI and the
plugin-only candidate consumer then verify non-linked installations, exact
package identities, registry tarball origins and integrity, and shipped Host
and Client entrypoints. A matching version number alone does not prove that
registry bytes were installed.

Published package versions are immutable. Plugin and shared build-input changes
must advance the affected plugin versions before publication. The publish job
compares an existing version's registry tarball digest with the freshly packed
package; it skips only identical bytes and fails on a version collision or an
unavailable registry check. The public feed downloads the exact selected
registry tarballs and preserves existing coordinates. It writes new archives
before updating the index and preserves the previous index for retries.
Source-only tests and publication workflow edits do not select plugins.

The active Cordis profile selects Host plugins. The official `clientModules`
service scans their `dsh.client` declarations and publishes the module graph,
revisioned bundles, and index injections. `src/main.tsx` runs the official
`AppWebEntry` boot for both WebUI and Electron. Electron's restricted bridge
transports the same Host-owned index injections and advertised `/plugins`
resources; there is no static second loader or App-owned Bundle Profile.

Shared type-only bridge, thread, MCP Apps and workbench contracts are owned by
`packages/host-contracts`. `packages/host-kit` owns the native profile update
service used by Host Core and the operator CLI. Host Core consumes the Codex,
Framework and MCP Apps services injected by Cordis; it does not import sibling
plugin service source or runtime modules from `scripts/`. The private shared
runtime is compiled into its consumer through its public entrypoint, so an
independent plugin install does not need a second unpublished runtime package.
App's `source_ownership_policy` records the dependency direction and remaining
root-source migration. Client composition, Workbench and the other root Host
helpers remain transitional source locations; package installation boundaries
alone do not establish source independence.

`opl-studio-client`, Superagent, Team/Bot, and MCP Apps clients carry their own
bundled UI bytes as standard DSH Client Plugins. Profile overrides select those
packages on the next launch, so compatible product UI updates do not require
recompiling the boot shell. Electron, the DSH core/cohort, and the small
`AppWebEntry` boot shell remain carrier-owned. Runtime dependency files must
survive carrier pruning, including nested directories named `doc` such as
`yaml/dist/doc`; source boot alone cannot verify packaged dependency closure.

macOS carrier signing excludes the known Chromium resource data, KaTeX fonts
and PDF CMaps from individual code-sign operations. Native executables,
frameworks, libraries and Node addons retain their signatures; the final App
seal and deep strict verification continue to protect resource bytes. Full
assembly preserves these Shell exclusions when adding its pre-signed runtime
exclusion.

The composition receipt records one tested published Host/Client combination.
It is release evidence rather than a runtime discovery list. App-integrated
update/readback and production Stable artifact consumption retain their own
installed and release qualification; the candidate workflow is not a second
release controller.

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

The pinned `0.2.2-rc.3` cohort follows the official upstream `dsh-v0.2.2-rc.3` release
candidate. Its source, npm packages, vendored GUI and Host overlays are validated
together. The official 0.2.2 static frontend plugin is composed through a narrow
Studio authentication view, and native tool execution uses the official executor
with correlated singleton batches. The GUI has one digest-bound, replayable
React 19 compatibility patch; original upstream hashes remain recorded per file.
A plugin declaring a range such as `^0.1.0-rc.8` does not admit this
cohort: npm prerelease range matching requires the same patch tuple, so the newer
prerelease is not an eligible range target even though SemVer orders it later.
That is a range consequence, not a downgrade.

Package metadata is only the first gate. Ordinary conversations retain their
Codex thread, permission and approval owners. Collaboration loads the official
DSH Session, AgentLoop, Subagent and AgentTeam services. The `opl-codex-agents`
plugin supplies an LLM adapter backed by the existing persistent Codex App Server;
`opl-team-bots` launches the unmodified official Web application. Its model-menu
Team toggle, disable confirmation, Subagent tree, right-side member chat, shared
task board and Agent Preset/Creator flows are the real callers. OPL maintains no
parallel role editor or team management page. Each member has a continuing
Codex execution thread. Unknown dispatches require inspection before resending.
Official tools are bound to the exact initiating Agent through native Codex
dynamic dispatcher, including per-turn admission, native permission projection
and cancellation. The stable dispatcher lets Team mode change after thread
creation without replacing the persistent Codex thread. Existing bindings and
DSH session logs remain in place; the retired bots.json is preserved read-only.
The CLI owns application readiness, HMR, Settings and shutdown. Parent transport
RPCs admit only the adapter operations; callbacks are limited to its linked
threads, and stopping the workbench interrupts its exact active turns. Native
Codex built-in command traces and token accounting remain in the canonical
Codex thread; this adapter currently projects final text and official DSH tool
cards, not the full native event stream. This executor gap is reviewed on DSH
upgrades; collaboration UI and role management remain upstream-owned.

Superagent uses the unmodified upstream prototype at
`8c32a9dc5d72c033816c6a8110b37f40cf94fba4`, with per-file provenance under
`vendor/dsh-superagent`. Its private delivery wrapper builds that source without
patching it. `opl-superagent` starts and stops an independent official Web
profile under `$DSH_HOME/opl-superagent`, including `dsh-base`. That process
owns its model, credentials, Source ingestion, Policy, Tickets, Assignments,
Reports and recovery. It does not depend on Team or inherit Team credentials.
The original management UI handles setup, settings, execution and recovery.
The listener is loopback only; remote WebUI operators need a port forward to
that machine. No external Source is configured or enabled for work by OPL.

The Codex adapter and workbench entrypoints declare their pinned DSH runtime
peers, including LLM, Cordis and App Boot. DSH's native profile resolver reads
those declarations to reuse the carrier cohort when a profile-installed OPL
package is linked into the independent workbench profile. Profile peer
auto-installation remains disabled; the adapter must not install another DSH
runtime to compensate for an undeclared dependency. Publication and registry
composition gates install packed OPL overrides into a fresh native profile,
start the real Superagent child CLI, read its management API, and stop it.
The regression also proves that the former undeclared LLM import fails in the
same layout, even though the main Host itself can boot.
The private Superagent engine is an optional package-manager peer supplied by
the carrier. It is not published or installed into each profile; the workbench
still requires that carrier-provided engine when the user starts Superagent.

The profile is opt-in and preserves its database/configuration after stopping.
The main renderer entry uses standard plugin metadata and DSH slots; desktop
loads the same Host graph through `AppWebEntry` and Cordis. Neither feature creates
another plugin format, loader, task registry or general communication protocol.

## Client Composition Boundary

Studio consumes the App-owned Client Contribution ABI, product profile, slot
vocabulary, trust/scope/order rules, typed RPC reads/events, canonical App
actions, product state semantics, and disposal policy.

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
fixture through Host projection and Studio Client Cordis, and verifies typed
Client events and slots, the App compatibility profile, canonical action
payload shape, and fresh state readback. The resulting qualification is
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
  allowlisted IPC. macOS/Linux run the same Host in the standalone Node selected
  by Framework, with private parent/child pipes reusing the Windows guest
  protocol. Native callbacks remain in Electron; domain execution, profile tools
  and their single update lease remain in the Host. Node admission enforces the
  October 2026 TLS fixes and reads back the actual executable version and digest.
  Existing unsafe Node installations use the same frozen Framework installer's
  Node-only entry, preserving Framework source, Packages and system Node. Host
  code and its original dependency closure are physically unpacked from ASAR;
  Electron is never a Node fallback;
- OPL Workspace exposes the same host core through loopback HTTP/SSE for
  standalone WebUI and headless operation;
- the Docker carrier runs the Node host core and WebUI only. It
  does not run Electron, AionUI, or AionCore.

The explicitly built Preview candidate has an isolated name, path, bundle id, and default
read-only action policy. Source support and local package output are candidate
evidence only. They do not prove a platform release, clean installation,
updater cohort, released Docker image, or cross-carrier runtime equivalence.
Stable packaging uses the App identity and release configuration; isolation of
Preview evidence does not mean Studio is still awaiting Stable adoption.

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

The standalone installer stages the built DSH plugins, Host sources and the locked
production npm dependency graph together. It runs the same packaged Host closure
smoke before activating the new directory; installed dependencies resolve within
that directory rather than through the source checkout. Update and rollback retain
the same atomic current/previous payload boundary.

Desktop Node admission retains the discovered absolute executable entrypoint while
checking its current target's version and digest. Headless service definitions and
updater commands share a stable PATH entry resolving to the installing Node when
one exists; they otherwise retain the selected executable. Explicit Node paths
remain authoritative. Carrier symlink updates therefore apply on the next process
start without pinning the service to a removed package-version directory.

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

Default build arguments establish a local source cohort. The Preview workflow
binds accepted inputs, native per-architecture smoke, attestations, and immutable
registry identities before publishing a handoff. Cloud mode implements password
authentication, signed sessions, and CSRF protection; TLS, tenant isolation,
Workspace activation, and public routing remain Cloud-owned. The local Compose
entry still publishes loopback only. See [OCI distribution](oci-distribution.md)
for the operating contract.

## Runtime Independence

Studio does not require, start, package, or read AionUI or AionCore.
`opl-codex-native` resolves `OPL_CODEX_BIN` or an exact external Codex
executable and starts `codex app-server --stdio` directly. Every carrier
consumes OPL only through Framework state/action
contracts; AionUI/AionCore managed-resource manifests, provider abstractions,
session/database state, backend, and authentication are not Studio runtime inputs.

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
permissions, model catalog, and turn state. Studio consumes the App Server
thread/turn/event flow; `localStorage` is limited to UI selection, settings,
and unsent drafts.

Studio's 300-second inactivity window bounds a local `waitForTurn` caller, not
the Codex turn. Progress and blocking human requests rearm or pause that wait;
each caller has its own budget, including callers that reconnect after a timeout.
Expiry rejects only that caller and retains active turns and pending requests.
It never sends an interrupt or grants idle maintenance. The workbench preserves
the accepted run and Stop control, then reconciles canonical history without
resending. Only a Codex terminal event, a matching terminal `thread/read`, or
actual App Server shutdown releases the run. Missing history and active snapshots
are not terminal evidence. Explicit Stop uses `turn/interrupt` and still waits for
canonical terminal confirmation; late output and results remain attached to the
original turn. This policy is OPL transport code; official DSH/Codex source and
their provider/tool deadlines stay unchanged.

Studio reads canonical thread identity and history only from Codex App Server
through the standard adapter. It does not scan or import retired AionUI
databases, cache files, history, settings, or migration indexes. Existing files
remain untouched. Native history uses `thread/turns/list` and
`thread/items/list`. The separate signed Preview-to-Stable handoff imports only
allowlisted Studio settings, drafts, and canonical channel bindings.

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

The shared conversation renderer defaults protocol-typed tool/process output,
subagent activity, and assistant `commentary` items to collapsed disclosures.
Final answers and unclassified messages remain expanded; classification never
infers a phase or failure from prose. Failed execution summaries remain visible,
and pending approval/input requests stay in their existing independent panel.
While a turn runs, its status and latest available commentary excerpt are shown
outside the disclosures. Individual choices survive pagination, updates, and
thread switches during the mounted workbench session, keyed by thread/turn/item;
expand/collapse-all applies to the current thread's loaded details. It does not
persist message content or choices across reloads. Collapsed bodies are unmounted;
canonical history, model context, and execution/approval behavior are unchanged.
This is shared Desktop/WebUI presentation, not backend lazy loading.

Studio exposes no private cross-thread orchestration layer: it has no separate
proposal/dispatch/wait protocol, host queue, delivery ledger, bilateral
coordination receipt, client-executed dynamic tool set, or cross-host handoff
contract, and none of these is a deferred work item. The retired shell's former
Team executor facility is not the Codex-native subagent capability and is not
part of Studio's thread adapter.

## Model And Settings Boundary

The Studio implementation of App-owned Settings contribution placement
is documented in [Settings projection](settings-information-architecture.md). It keeps
App/Framework package and connection truth authoritative while routing
declarative settings views into the existing Resources, Services, and
Capabilities destinations; Studio does not create a second package registry.

Model defaults, visible choices, labels, reasoning options, and fallback policy
come from the App product profile plus fresh Codex `model/list` readback. Studio
must not maintain a second model catalog or silently replace an unavailable
fixed selection.

Settings persistence remains Shell-local UI state. It does not grant system
write permission or ownership of App settings policy.

Settings action preview, confirmation, execution, feedback and pending workbench settlement
are maintained by `plugins/opl-studio-client/src/client/workbench/useSettingsActions.ts`. `App.tsx` supplies the existing
bridge and readback ports, and keeps the shell composition, conversation and turn state.
The hook retains one mounted owner for confirmation state and cancels pending workbench
requests on unmount. Framework remains the owner of App action execution authority.

## Domain And Artifact Boundary

Research, grant, presentation, and book starters dispatch App-owned action refs
when available. Artifact previews render refs and supported formats. Neither
surface owns professional execution, source truth, quality judgment, artifact
authority, export acceptance, or delivery readiness.

## Adoption Boundary

App's active adapter selects Studio for current production builds. AionUI is
retired and has no active release, installation, upgrade, or regression-fixture
role. Adoption and product identity remain App-owned; Studio source evidence
does not establish release or installation qualification.
Candidate docs, tests, package artifacts, screenshots, or local live smoke
cannot perform that transfer or prove release readiness. The current evaluation
evidence boundaries are maintained in
[Adoption gaps](./active/current-state-vs-ideal-gap.md). Current identities,
migration policy and qualification routes are maintained by the
[App distribution owner](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/delivery/distribution-and-install-ssot.md),
not by a second Studio status table.

## Workbench services

`opl-workbench-services` is a Framework Cordis plugin exported through the
existing `./cordis-profiles` entry. Studio's Framework bridge loads it separately
from channel providers. A missing export, disconnected Temporal service, or a
memory/inventory read failure cannot block canonical Codex chat. The fast state
keeps `workbench_services`; reads use the existing contribution envelope and
writes use the existing action preview, confirmation, and receipt flow.

Temporal alone holds personal schedule definitions and workflow history. Studio
supplies bounded create/start/read/interrupt callbacks on its current App Server
transport. No second App Server, thread store, DSH root Agent, scheduler, memory
database, or persistent cleanup ledger is created. Worker lifecycle belongs to
the Framework plugin. Starting the plugin does not install Temporal or invent a
new namespace. Task execution requires an explicit `:read-only` or `:workspace`
permission profile and a validated workspace. Definitions carry revisions;
changes run through one active Temporal management workflow per task and recheck revisions. Stale or concurrent edits fail visibly; Schedule conflict tokens alone are not assumed to provide exclusion.

Executor memory reads use the active `CODEX_HOME/memories`. Canonical Markdown is
read-only; corrections are notes in `extensions/ad_hoc/notes` for the Codex memory
owner, not a claim that its memory has already changed. This service neither
maintains the user's business knowledge nor grants access to it. Cleanup uses
owner-declared inactive log files and an expiring exact-file preview.
Protected App/Framework/Codex inventory reports
partial or failed reads explicitly. Resource contents and raw action payloads
are excluded from diagnostic receipt summaries.

Feature availability requires explicit owner status or a feature-specific
canonical observation. Projection presence and App Server connection alone are
insufficient. Empty directories are legitimate states, and missing memory refs
are not evidence that a memory facility is absent.

The official DSH Web server requires a concrete local bind address. Studio resolves a legacy
wildcard request to the single external interface of a container; hosts with multiple matching
interfaces must supply the intended concrete address. Desktop and tool-only startup retain their
loopback default. Authentication and route ownership stay in the existing Studio Web adapter.

## Business knowledge ownership

The [Framework knowledge policy](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/policies/knowledge-source-and-memory-policy.md)
and [knowledge sources contract](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/specs/knowledge-sources.md)
define the shared source and consumption model. Product, user/team, topic and
project ownership are independent of content type and physical directory. An
existing Obsidian vault or other personal library keeps the single editable
business source; a business workspace can hold it when no personal library
exists. Workspaces may also hold original project work and must not be treated
as disposable runtime caches.

Framework owns source registration and bindings, accepted versions, scope and
access checks, immutable task snapshots and mechanical writeback evidence. The
user or domain owner accepts the meaning of a change. Current domain state stays
with its business owner, and runtime evidence records its actual use; neither a
Studio cache nor a dated projection silently becomes editable long-term truth.

`MemoryRefsPanel` only presents the task's declared memory references. The
separate Codex memory service above reads executor memory. Knowledge review
surfaces use the existing dynamic Package contribution when the source owner
exposes one. Studio does not add a personal store, source registry or Vault RPC.
Selecting a thread workspace does not grant knowledge access; source reads and
writeback retain their owner checks, accepted revision and separate permissions.
Missing required knowledge or a changed source is reported by the owner instead
of being filled from an unverified client cache.

## Standard MCP Apps plugin

`opl-mcp-apps` provides the Host service and the client components through Cordis.
It injects the canonical Codex transport and owns ephemeral view bindings; Studio
core only delegates. The client consumes the official ext-apps AppBridge, an
opaque iframe and the existing authenticated bridges on every carrier. UI tool
and resource requests recheck the live server catalog before dispatch. Closing a
view during discovery prevents that dispatch; a Codex connection reset invalidates
all old view bindings, without changing durable domain tasks. Owner results and
unknown outcomes pass through intact, and no tool call is retried by this host.

Runtime task and research routes use the same Framework MCP App resource as
Codex. Studio keeps cross-Agent summaries, while stage timelines, research paths,
evidence and human decisions live in the shared workbench. Studio no longer
parses MAS research snapshots or maintains a MAS-specific detail renderer.

## Package installation progress

The software center uses Framework `package_operation_start/status/cancel` App actions for background Package installation, update and repair. Framework owns transfer progress and revalidated digest caches; the existing native carrier still owns installation. Studio renders real download bytes and stage names, restores operations after navigation or reload, and never treats worker acceptance as installation success. Older Framework versions retain their existing synchronous action path.

The official DSH plugin manager already streams npm plugin installation state. OPL Packages require owner-verified OCI acquisition before native Codex registration, which that npm lifecycle does not cover. This adapter keeps the existing public App action boundary and DSH primitives; it adds no plugin registry or generic install resolver. Revisit the transport gap when upstream supports the same carrier contract.

The window-level activity link uses the same operation readback as Software Center.
It discovers existing tasks on renderer startup, polls less frequently when idle
outside the page, and links back without starting another operation. Failed reads
retain the previous observation but hide stale transfer metrics. Interrupted work
requires fresh inspection; terminal success only offers a use entry when the
current Package projection allows launch. Catalog rows show the same active stage
and disable duplicate lifecycle controls for the affected Package or component.

The page overview prioritizes unknown reads, actionable issues and active work
before ordinary updates. Source/resource issues retain explicit owner identities
and affected software counts. Preflight uses catalog display metadata for names
and sources, while version, size and path remain the actual action preview.
History groups attempts by Package and never hides ongoing work behind completed
items. These are presentation projections, not a durable operation store.

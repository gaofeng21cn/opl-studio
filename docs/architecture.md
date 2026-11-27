# OPL Studio Architecture

Owner: `opl-studio` implementation; App contracts retain product authority
Purpose: `application_host_implementation_boundary`
State: `active_technical_reference`
Machine boundary: Human-readable implementation and authority map. Source and
tests prove only exact candidate behavior; App contracts, Framework readback,
Codex App Server, and domain owners retain their respective truth.

## Authority Stack

Studio implements the independent DSH/Cordis Application Host in the
one-product/multiple-carrier topology. `one-person-lab-app` owns product and
release truth; `opl-studio` implements Desktop, standalone WebUI, and Docker
on DSH/Cordis. Source completion does not change the selected Stable carrier,
GUI ABI freeze, release composition, or installed product.

```text
DeepSeek Harness v0.2.3-alpha.2 boot/profile/patch loader
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

The two Cordis Hosts stay strictly scoped: Studio owns its process, plugins,
GUI, and Codex tool exposure; Framework owns OPL runtime/Package composition
and projections. Communication stays on public contracts without shared
registries, currentness, sessions, or internal service graphs.

Pinned MIT upstream GUI source keeps layout, tokens, and ordinary interaction
in one source cohort (`vendor/deepseek-harness/` + `THIRD_PARTY_NOTICES.md`),
while OPL data, identity, and adapters live outside the vendor tree so upgrades
stay replayable.

## Studio Application Host

`src/host/dsh/host.mjs` boots the `opl-studio` profile from
`src/host/dsh/cordis.yml` into `$DSH_HOME/profiles/opl-studio`, heals standard
profile module fallbacks, and applies `src/host/dsh/web.patch.yml` plus bundle
patches. The profile uses `dsh-session-projection`, `dsh-system-prompt` (without DSH identity or runtime
context), `dsh-tools` (native registry), `dsh-host-webserver`,
`dsh-host-plugin-inventory`, `dsh-client-modules`, and auth-gated Web static
hosting, excluding `dsh-base`.

```text
opl-dsh-tool-mcp
  -> opl-codex-native
       -> opl-framework-bridge ─┐
       -> opl-mcp-apps ─────────┴─> opl-host-core
                 -> opl-web-routes (Web overlay only)
```

Startup runs DSH tree and Tool MCP, then Codex App Server, then Framework
bridge; shutdown reverses stateful edges (Framework callback, Codex App
Server, Cordis tree).

- **Collaboration & Superagent workbenches:** On-demand collaboration runs the
  unmodified official DSH base/Web application via CLI (`opl-team-bots`),
  borrowing the one persistent Codex App Server through `opl-codex-agents`
  without starting another server or second provider account. Optional
  Superagent (`opl-superagent` + `opl-superagent-engine`) runs an isolated
  official profile (`$DSH_HOME/opl-superagent`) with its own `dsh-base`, model,
  credentials, Sources, Policy, and Tickets, independent of Team.
- **Native plugin updates:** Compatible `@gaofeng21cn/*` DSH Host/Client packages
  installed under `$DSH_HOME/profiles/opl-studio` override bundled defaults via
  `npm run dsh:plugins` (`inspect`, `update-source`, `update-registry`, `remove`)
  and `packages/host-kit`. See [plugins/](../plugins/README.md) for package layout,
  build rules, and `cordis.yml`/`clientModules` loading.
- **DSH Tool MCP (`opl-dsh-tool-mcp`):** Exposes `ctx.tools` via an
  authenticated loopback Streamable HTTP MCP endpoint passed to Codex at launch
  (`-c mcp_servers.opl_studio_dsh.*`) without mutating global Codex config,
  emitting `tools/list_changed` on changes. Plugins requiring excluded
  `dsh-base` LLM/session/credential services need an explicit adapter rather than
  automatic compatibility.
- **Sidebar & Host disconnect handling:** Sidebar defaults derive from App
  build policy, overridden by local carrier preferences; empty overflow stays
  hidden while unpin controls remain available. On local Host disconnect, a
  bounded redacted diagnostic is saved and the next request creates a new Host
  without replaying interrupted mutations.

## Client Composition Boundary

Studio consumes the App-owned Client Contribution ABI
(`opl_app_client_contributions.v1`), product profile, slot vocabulary, and
canonical App actions. Framework's Host graph projects declarative contributions
as `opl_app_ui_contributions_projection.v1`; `opl-studio-client` constructs one
browser Cordis context (`opl.app.client-contributions`), mounts only the closed
allowlist (`contracts/opl-app-contributions.schema.json`) into `settings.section`,
`runtime.detail`, and `composer.palette`, and routes every write through
canonical App action refs.

The on-demand details column exposes three ordered Detail tools in the same
composition: Project progress (joining Codex thread workspace to Framework's
`work-item-projection.v2` without inferring pending stages as current), Files
and results (bounded read-only workspace + owner artifacts), and Agents and
capabilities (dynamic brand/package projection without a fixed roster).

## Renderer And Host Topology

One DSH/Cordis Application Host, one DSH-derived React renderer, and one
`opl-host-core` plugin serve three carriers:

- **Electron desktop:** Packages renderer and unpacked Host closure for macOS,
  Windows, and Linux behind isolated `window.oplStudio` IPC. macOS/Linux run the
  Node Host selected by Framework; Windows launches the packaged WSL2 guest
  Host. See [Desktop distribution](delivery/desktop-distribution.md).
- **Standalone WebUI / headless:** `scripts/headless/run.mjs` boots the same
  Host over loopback HTTP/SSE with `/healthz` (HTTP process alive) and
  `/readyz` (Codex App Server initialized).
- **Docker / OCI:** Multi-stage container running the Node headless host and
  renderer as non-root PID 1 (`node`, `/data`, `/projects`) without Electron.
  See [OCI distribution](oci-distribution.md).

`npm run package` materializes App's three-carrier local candidate contract
against a clean committed Studio `HEAD` (`OPL_APP_REPO_ROOT` selects the App
checkout). Candidate artifacts do not prove release readiness or adoption.

## Runtime Independence

Studio runs solely on Codex App Server (`codex app-server --stdio` via
`opl-codex-native`, resolving `OPL_CODEX_BIN` or exact external Codex). `pi`
and `hermes` remain reserved disabled identifiers in
`contracts/opl-studio-profile.json` with zero runtime dependencies or fallback
routes. No retired shell runtime (AionUI/AionCore), database, or migration store
is loaded or imported.

Ordinary OPL state reads use `opl app state --profile fast --json` (preferring
`app_state.agent_packages` over fallback `modules.items`) and mutations execute
solely through `opl app action execute --action <id> [--payload <json>]
[--dry-run] --json`.

## Codex Thread Boundary

Codex App Server owns canonical thread identity, history (`thread/list` with
`updated_at` desc and read-only `thread/read` with `includeTurns=true`),
lifecycle (`resume`, `fork`, `archive`, `unarchive`), permissions, and turn
state. Studio exposes no private cross-thread orchestration protocol, queue,
ledger, or dynamic-tool coordination layer.

- **Turn wait window:** Studio's 300-second inactivity window bounds an
  individual `waitForTurn` caller, never interrupting the underlying Codex turn
  or releasing active runs without terminal confirmation or App Server exit.
- **Disclosures:** Protocol-typed tool/process output, subagent activity, and
  assistant `commentary` items default to collapsed unmounted disclosures with
  session-scoped expand state; final answers and failure summaries remain
  visible.

## Model, Settings, Domain & OPL Link Boundaries

- **Models & Settings:** Defaults, labels, reasoning options, and fallback rules
  come from App's `app-product-profile.json` intersected with live `model/list`.
  Settings placement, Software Center, and custom model opt-in live in
  [Settings projection](settings-information-architecture.md); `useSettingsActions.ts`
  owns confirmation/execution settlement while Framework executes mutations.
- **Domain starters & artifacts:** Research/grant/presentation/book starters
  dispatch App action refs when present and artifact tabs render supported refs
  without owning quality judgment or artifact truth.
- **OPL Link:** Mobile companion operation reuses `opl-codex-native` and the
  existing App Server over Noise/WebRTC/Relay; optional phone connectors remain
  contract-only and disabled. See [OPL Link connection](opl-link.md).

## Workbench services

`opl-workbench-services` (imported from Framework `./cordis-profiles`) runs
independently so missing exports, stopped Runway scheduler health, or memory/inventory
read failures never block Codex chat.

- **Runway & schedules:** Framework's Runway engine and SQLite Ledger (`app_state.services.runway`) own background orchestration, schedule runner state, and human gates (`runway_human_gate_resolve`), while Studio renders runtime status and provides bounded create/start/read/interrupt callbacks requiring explicit `:read-only` or `:workspace` permission profiles and validated workspaces with revision checks.
- **Executor memory & cleanup:** Reads `CODEX_HOME/memories` read-only, writes
  corrections as notes in `extensions/ad_hoc/notes`, and previews exact inactive
  log cleanup with expiration. `MemoryRefsPanel` displays only task-declared refs.
- **Web bind address:** Official DSH Web server resolves wildcard binds only to
  a single external container interface; desktop/tool startup keeps loopback
  defaults under Studio Web auth.

## Business knowledge ownership

Per [Framework knowledge policy](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/policies/knowledge-source-and-memory-policy.md)
and [knowledge sources spec](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/specs/knowledge-sources.md),
editable business knowledge stays in the user's Obsidian vault or business
workspace (never treated as disposable cache). Framework owns registration,
access checks, snapshots, and mechanical writeback receipts; Studio renders
owner-projected review views without adding a personal store or Vault RPC.

## Standard MCP Apps plugin

`opl-mcp-apps` injects `oplCodexNative` on Host and pairs `@modelcontextprotocol/ext-apps`
`AppBridge` with opaque CSP-enforced iframes on Client (see [Ecosystem clients](ecosystem-client-plugins.md)).
Runtime task and research routes share the Framework MCP App resource with Codex
rather than maintaining a separate MAS renderer.

## Package installation progress

Software Center consumes Framework `package_operation_start/status/cancel`
actions for background Package transfers while native carriers still own
installation and registration. The window-level activity indicator shares the
same readback without starting duplicate operations or treating worker acceptance
as installation completion.

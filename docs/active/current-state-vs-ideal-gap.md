# OPL Studio Application Host Current State And Pre-Adoption Policy

Studio is now implemented as the DSH/Cordis Application Host for the single OPL
App product. The current Stable release carrier remains AionUI until the
App-owned adapter and release gates switch. Source-level Host completion must
not be read as active-shell, App-release, or production evidence.

Owner: `one-person-lab-app`
Purpose: `single_active_truth_plan`
State: `active_product_development_reference`
Machine boundary: This document owns the product implementation's current human-readable
status, remaining owner/evidence gaps, and next Agent prompt. It does not own App
product truth, Framework runtime/package truth, Codex thread truth, domain
authority, release adoption, or production readiness.

## Target State

Studio is the maintainable first-party One Person Lab Application Host. It
boots the pinned DeepSeek Harness `v0.1.1-rc.2` profile/patch/plugin skeleton,
reuses the pinned App frame, workspace browser, conversation, composer, Agent
preset, model selection, Settings, theme, and queue source, and supplies the OPL
plugins that own Codex, Framework bridging, Host APIs, and Web routes.

The implementation has one DSH/Cordis Application Host, one React renderer, and
one OPL Host core plugin. `opl-codex-native` owns one persistent Codex App
Server; `opl-dsh-tool-mcp` exposes DSH `ctx.tools` to it; and
`opl-framework-bridge` consumes Framework state/action, authentication, and
channel callback contracts. Studio does not load `dsh-base`, so no second DSH
session, LLM provider, Agent loop, or credential owner exists. Electron and
HTTP/SSE are carrier adapters over the same Host.

Native development is required against the App-owned minimum-complete product
contract. It must preserve the necessary user outcomes of the current AionUI
mainline, but inherited AionUI provider, Team, AionCore, second scheduler, and
custom assistant-catalog surfaces are not parity targets. AionUI remains the
active release shell until Native is complete, passes separate App-owner
release admission, and is explicitly adopted.

## Current State Summary

| Theme | Current state | Boundary |
| --- | --- | --- |
| App role | `first_party_native_successor_implementation` | App product profile owns the role; local selection does not imply mainline or release adoption |
| Active release shell | `aionui` | Only the App shell adapter can change this |
| Product work policy | `active_product_development_release_admission_separate` | Minimum-complete OPL outcomes are required; full AionUI parity and implicit release are not |
| Current mainline | `false` | AionUI remains the only mainline until Studio completes and passes separate release qualification |
| Product completion obligation | `true` | Minimum-complete Native gaps enter the App development backlog without blocking the current AionUI release |
| DSH Application Host | `pinned_rc2_application_host_implemented` | `opl-studio` profile, Web overlay, profile home, plugin inventory, startup/shutdown ordering, and Host service tree are implemented from DSH `v0.1.1-rc.2`; `dsh-base` is explicitly excluded |
| Codex native plugin | `persistent_codex_owner_implemented` | `opl-codex-native` owns the App Server process, canonical threads/turns, approvals, and live events; launch-time MCP settings do not mutate global Codex config |
| DSH plugin bridge | `ctx_tools_to_codex_mcp_implemented` | Tools registered in DSH `ctx.tools` are listed/called through authenticated stateful loopback MCP with dynamic list-change notifications; `0.1.1-rc.2` is newer than the `0.1.0-rc.6/7/8` cohorts, but npm prerelease ranges and plugins that require excluded DSH Session/LLM/Agent/credential owners still need explicit compatibility and authority admission |
| Framework bridge | `public_contract_consumer_implemented` | `opl-framework-bridge` consumes App state/action, authentication, and channel callbacks; Framework remains the runtime/Package composition owner |
| DSH GUI baseline | `pinned_source_reuse_implemented` | App frame, navigation, workspace/session tree, conversation, composer, Agent preset, model selection, Settings, theme, and queue are reused byte-identically from the pinned MIT upstream source; OPL keeps no parallel visual system |
| Product brand | `one_person_lab_only` | `OPL Studio` remains an internal repo/codename and is not a user-facing product brand or logo |
| Renderer/hosts | `shared_application_host_renderer_and_bridge_implemented` | Electron IPC and HTTP/SSE adapt one DSH Application Host, OPL Host core, and renderer; release-cohort equivalence is not proven |
| Carrier evidence command | `exact_commit_three_carrier_generator_implemented` | `npm run package` reads the current App carrier contract, requires committed tracked-clean Studio source, and emits Electron, standalone WebUI, Docker smoke, and candidate manifest outputs bound to exact `HEAD`; it grants no distribution, release, or adoption authority |
| Desktop host | `electron_hosted_installer_native_api_accessibility_baseline` | macOS directory packaging is proven locally; hosted Windows x64 and Linux x64 build two unsigned package cohorts and prove install/update/rollback/uninstall of NSIS and DEB with exact running-version, state-preservation, and process-bound UIA/AT-SPI tree readback. DEB is the only admitted Linux native carrier; AppImage is rejected because its sandbox requirements conflict with direct portable execution on Ubuntu 24.04. Dedicated clean-VM, NVDA/Orca experience, signing, release, and platform support remain unqualified |
| Headless/WebUI host | `posix_user_service_qualification_wired` | Candidate WebUI starts Codex App Server directly. Formal install/status/stop/start/restart/update/rollback/uninstall commands manage only the current user's launchd or systemd service. The hosted jobs bind exact pinned runtime paths, readiness and App-state readback, then prove native service-definition and payload removal. Supported installers, remote access, signing and release remain open; no Electron/AionCore or Desktop database is used |
| Docker carrier | `successor_oci_hosted_qualification_wired` | Dockerfile/Compose reuse the shared Node host core and renderer with pinned inputs and persistent volumes; the manual additional-carrier qualification builds local-only OCI layouts with SBOM/provenance and runs install/update/recreate/rollback/uninstall on matching native amd64 and arm64 runners. Registry index identity, signing, public distribution, clean-host and release admission remain open |
| AionUI/AionCore dependency | `false` | Native starts Codex App Server directly and consumes only Framework App state/action contracts |
| Enabled carrier | `codex_app_server_stdio` | The candidate has one runtime carrier and one App Server child per native window or Web host |
| Reserved carriers | `pi`, `hermes` disabled | Interface names only; no dependency, process, fallback, or UI path is enabled |
| Thread/history | `codex_app_server_owned` | Candidate consumes thread/turn APIs and keeps only UI metadata/drafts locally |
| Shared directory | `codex_visible_default_overview` | Uses the default `thread/list` source set and opens history by the same canonical thread ID |
| Codex subagents | `read_only_app_server_projection` | Lineage, role, nickname, source kind, tool-call, and activity items are displayed without owning scheduling |
| Private cross-thread layer | `removed_non_goal` | No proposal/dispatch/wait protocol, host queue, ledger, or bilateral receipt remains. The DSH Tool MCP is an in-process plugin capability bridge, not a second thread coordinator |
| Client composition | `host_derived_client_cordis` | AionUI and Native consume the same App Client Contribution ABI, product profile, and slot policy. Native's Client Cordis occupants derive only from the Framework Host projection; no shell discovers Packages or owns another graph |
| OPL state/actions | `canonical_producer_consumer_conformance` | Framework Cordis composition, Package graph, and public App state/action producer are canonical; Native has one bounded consumer bridge and no second registry, currentness, session, state, or action authority |
| Conversation | `chat_first_with_thread_scoped_detail_tools` | Primary surface is the DSH conversation. The same Client Cordis exposes Project progress, Files and results, and Agents and capabilities as ordered on-demand Detail tools instead of static home cards |
| Project progress Detail tool | `workspace_exact_work_item_projection` | Matches the canonical Codex thread workspace to Framework `work-item-projection.v2`; displays only explicit lifecycle, current Stage, current Attempt, attention, blocker text, and next action. It never guesses a project for an existing workspace-less thread or treats a pending Stage as current |
| Files and results Detail tool | `canonical_thread_workspace_read_only` | Lists, searches, and previews bounded UTF-8 text files below the canonical thread workspace, then keeps existing input-file and result/artifact views in the same tab. No edit, create, rename, move, delete, Git, terminal, or second workspace owner is introduced |
| Standard Agents | `explicit_owner_readiness_enforced` | Composer separates OPL-owned `standard_agent` packages from skills/plugins/connections and preserves real Codex routes. Unknown diagnostics remain selectable, while explicit `launch_allowed=false`, `operational_ready=false`, physical absence, or non-callability reject selection |
| Active turn | `canonical_reopen_and_steer` | Active submissions use Codex `turn/steer`, and the DSH queue remains renderer-only state. Launch confirms the terminal turn through `thread/read(includeTurns=true)`; reopening a thread restores only the canonical `activeTurnId` before steer is enabled |
| Settings | `canonical_functional_surface_installed_preview_verified` | Account/Gateway, model, workspace, storage, capabilities, instructions, services, updates, diagnostics, preferences, first-run checks, Runtime Overview, and the macOS tray are canonical. The installed Preview for the current cohort passed local interaction and runtime readback; later functional bytes require a new acceptance pass |
| UI shell | `dsh_native_brand_and_drag_baseline` | Product identity is text-only `One Person Lab`; the upstream DSH mark and custom conversation header are suppressed. Wide desktop keeps an 18 px sidebar top inset for the product title, while the compact rail retains DSH geometry; desktop also keeps one 28 px drag strip from boot through mounted-shell phases. This is a candidate UI baseline and does not adopt the active shell |
| Updates | `desktop_and_headless_callers_present_owner_projection_consumed` | Electron Desktop and standalone Headless updater callers consume the Framework-owned App/Base/Packages managed-update projection. Studio preserves the compact projection and typed Flow dependency catalog through the fast Host path without adding an updater/currentness owner; Docker host-side update remains deliberately deferred rather than exposing the container runtime socket |
| Run detail | `real_producer_consumer_e2e` | MAS has a canonical read-only producer backed by a real workspace and trajectory. Studio passes the selected resolved six-field identity into `runtime.detail`, does not invoke the producer when identity is unresolved, rejects mismatched producer identity, and renders the allowlisted result as eight structured sections |
| Runtime overview continuity | `last_known_projection_then_background_refresh` | The first-level runtime page immediately renders a read-only, non-sensitive last-known App projection when available, then replaces it with a fresh `opl app state` readback; failed refreshes retain the snapshot with explicit stale status and never expose cached mutation actions |
| Service recovery | `app_state_derived_action_closed_loop` | Runtime Overview derives one causal root and one safe action from the same App state/action projection. Mutating and read-only actions are revalidated against a fresh App state immediately before execution, respect the mutation guard, and always refresh App state afterward |
| Local launcher | `implemented_candidate_path` | Isolated bundle; actions dry-run-only by default |
| Minimum product baseline | `active_functional_closure` | Distribution qualification paths are independently green. The managed-update/Flow fast-state, Fleet `service_status`, and current installed Preview paths are closed; the remaining user-facing baseline is non-Fleet managed-companion consumption from `opl-glt.58` |
| Validation | `distribution_core_and_installed_preview_gates_green` | Default PR/main CI remains source-only, and carrier qualification remains manual. The current candidate completed exact-commit three-carrier construction plus installed Preview Settings, Framework contribution, Gateway, real Codex turn, graceful restart, and canonical thread recovery readback. This does not replace a new installed pass after later runtime bytes change |
| Adoption and readiness | `false` | No active-shell adoption, release, clean-VM, domain, owner-acceptance, or production claim |

## Sidebar Information Architecture

The left sidebar follows one action grammar:

- `New task` and `Run status` are sibling primary actions. Both use the DSH
  `New Session` button geometry and interaction tokens (height, border, radius,
  typography, spacing, hover, focus, and collapsed rail treatment). The runtime
  button may expose the normal selected-page state, but it is not a second
  visual control type.
- There is no separate `Conversations` navigation item. Starting a task opens
  the conversation surface; existing conversations are opened from the same
  workspace/history area.
- Real workspaces remain DSH collapsible folder groups. Temporary/projectless
  sessions trail them as a flat `Recent` section in the same sidebar scroll
  owner. `Recent` is a non-collapsible heading: it has no folder icon, chevron,
  group toggle, or `aria-expanded`, and its session rows are visible directly.
- The DSH vendor tree remains byte-identical. These rules are implemented only
  by the Studio composition adapter and its thin data projection.

Runtime status is a first-level view backed by the App-projected runtime model.
It must not expose internal diagnostic enums or invent a separate runtime state
source.

## Recently Closed

The conversation Detail-tool slice is closed in source. The first-party Client
Cordis registry now owns the ordered `Project progress`, `Files and results`,
and `Agents and capabilities` tabs. Project progress is an exact workspace
projection of Framework-owned `work-item-projection.v2`; Files and results uses
the Codex thread adapter's canonical workspace through a bounded read-only Host
service. The standalone Runtime page remains the cross-project and
infrastructure overview. Installed Preview acceptance must be repeated for the
new renderer and Host bytes before this source result is described as installed
runtime evidence.

The managed-update and Flow currentness slice is closed on current `main`:
Framework owns the producer and currentness semantics, `opl-studio` preserves
the compact `app_state.managed_update` projection in `compactFastState()`, and
the existing Workbench parser and Settings view consume it. The Host boundary
filters the kernel execution envelope and does not create a second updater or
currentness authority. Focused Host, renderer, and live Framework readback
evidence is recorded in the change verification.

The App-owned `service_status` placement slice is also closed on current `main`:
App maps the typed view to `settings.services.installed_services`, Framework projects
Fleet telemetry/doctor with projection callability preserved, and Studio/AionUI render
the bounded summary generically. `activity_log` remains destination-null and hidden
from ordinary Settings. Cross-GUI conformance and serial Fleet readback passed; this
is source/candidate evidence, not active-shell adoption.

The prior installed Preview slice was closed for Studio candidate
`8497f3b9c240cc7ad28f0e90e609e2cb5732409a`. A clean App-contract-driven
`npm run package` qualified Desktop, standalone WebUI, and Docker; the App-owned
atomic installer then installed the isolated
`cn.onepersonlab.opl.studio.preview` bundle without replacing the Stable App.
The installed `app.asar` SHA-256 is
`96e71210efd39dc462c9d1c52b6c99c0a8396fc2c95c5bb40c4463881ef39cb9`.
Installed-runtime readback proved packaged DSH Host startup, the persistent Codex
App Server child, Fleet `service_status` summary and opt-in technical data,
`activity_log` absence from ordinary Settings, OPL Gateway account projection, a
completed real Codex turn, graceful process cleanup, and recovery of canonical
thread `01a02e73-4242-70d3-8138-f7ba75545fc7` after restart. That acceptance is
historical after the later UI-shell bytes. The new installed Preview cohort binds
to `app.asar` SHA-256
`1d29195a991abe50e6d2355d02095dbe52f9de68d2134fd10325f2962e433c13`, but its full
live turn/restart acceptance remains open. The App update
surface still correctly reports no configured Preview update source, Weixin is
not connected, and OPL Link is currently unavailable; none is promoted to a
successful live connection. This installed acceptance is candidate evidence only.

## Current Gaps

| Gap | Class | Owner route | Stop condition |
| --- | --- | --- | --- |
| Non-Fleet managed-companion contributions still need user-path consumption | `functional_p1` | `opl-glt.58` producer/consumer owner plus Studio integrator | Consume Channel Access, WeChat, Computer Use, Browser Automation, and future managed companions through typed slots/actions and a generic directory; Fleet `service_status` is already closed and must not be reintroduced as a fixed brand allowlist |

Signing, notarization, public update feeds, public OCI publication, dedicated
clean-VM certification, and the final AionUI cutover remain separate deferred
delivery/adoption work. They are not prerequisites for the current local
functional baseline and must not be moved back into default development CI.

Remote cross-machine coordination, model-driven permission/write-set decisions,
private thread runtimes, and candidate-owned delivery ledgers are explicitly not
open product gaps. Their implementation surfaces have been removed and must not
be resurrected from history. AionUI Team remains a separate multi-executor shell
facility; Codex-native subagent display continues through App Server truth and
does not depend on Team mode.

## Next-Round Agent Prompt

### Goal

For successor product development, finish the remaining non-Fleet managed-companion
user paths while preserving the Codex-only thin-consumer boundary. Rebuild and
repeat installed Preview acceptance only after those functional bytes change.
Distribution and release qualification stay independent and deferred in this round.
Do not reproduce AionUI-only inherited surfaces, create a speculative
multi-backend framework, or duplicate the renderer/host core for another
carrier.

### Write Scope

- `opl-studio` source, tests, and existing docs only for the explicitly
  authorized candidate delta;
- `one-person-lab-app` contracts/docs/tests only when the App owner decision
  explicitly includes that write set;
- this Active Truth plan for current status, remaining gaps, and the next prompt.

### Non-goals And Forbidden Scope

- no active-shell switch, release-channel change, platform support, or readiness claim without
  App owner adoption;
- no second product model, model catalog, package registry, thread/history
  store, permission control plane, runtime truth, domain truth, or artifact
  authority;
- no independent Client Cordis graph or Package discovery; the single GUI-side
  graph must derive from the Framework Host projection and App slot policy;
- no revival of cross-host handoff or private delivery ledgers; DSH tool plugins
  must stay behind the Host tool registry and Codex MCP bridge;
- no conflation of AionUI Team executor orchestration with Codex App Server
  subagent lineage and activity projection;
- no AionUI/AionCore runtime dependency or provider/session abstraction;
- no second desktop runtime or Electron inside headless/Docker;
- no AionUI, Hermes, AGUI, K-Dense, Open Science, or Codex source/brand vendoring.

### Live Truth Inputs

- fresh branch/head, dirty, worktree, ahead/behind, remote, and owner/write-set
  gates for Native and any App write set;
- App `contracts/app-shell-candidates.json`, `app-shell-adapter.json`,
  `app-gui-product-contract.json`, product profile, page-state matrix, and
  Native candidate plan from current `main`;
- Framework `opl app state --profile fast --json` and action-contract shapes;
- Codex App Server protocol/model-list behavior required by the authorized
  delta;
- current Native source, `src/candidateContractEvidence.json`, tests, package
  scripts, and verification guide.
- pinned DSH ref/package cohort, `scripts/webui-host/dsh/cordis.yml`, Web
  overlay, profile/bundle patches, vendor manifest, and Host/MCP tests.

### Required Actions

1. Preserve the closed managed-update/Flow and Fleet `service_status` projection
   boundaries while consuming Host-derived managed-companion, Channel Access,
   WeChat, Computer Use, Browser Automation, and future projections without adding
   a Studio registry, Package discovery path, or action authority.
2. After the remaining functional bytes are canonical, run the affected candidate
   gates, rebuild the macOS Preview, and repeat installed interaction/runtime
   readback before asking for acceptance of that new cohort.

### Verification Commands

- `npm test` in the Native repository with the current App checkout available;
- `npm run validate:candidate:studio` in the App repository when its mounted
  candidate checkout points at the tested bytes;
- OPL Flow-bundled `$opl-doc` semantic governance against each changed
  repository as a risk map;
- tracked Markdown relative-link scan;
- `git diff --check`;
- `npm run smoke:desktop-live` only when the authorized delta affects packaged
  local-window behavior.
- `npm run smoke:docker` when the authorized delta affects the OCI carrier.

### Completion Gate

- the authorized delta is implemented in its owner surface and smallest
  candidate write set;
- App and Native contracts/docs agree, with AionUI still the current release shell unless an
  explicit adoption change passed its own gates;
- no source/test/docs evidence is promoted to runtime, release, domain, owner,
  or production readiness;
- final changed bytes are verified after absorption to each root `main`, and
  task worktrees/branches are removed.

### Foldback Target

- candidate role/adoption returns to App contracts and GUI docs;
- stable implementation boundary returns to `docs/architecture.md`;
- command meaning returns to `docs/verification.md`;
- current status, remaining owner/evidence gaps, and the next prompt return only
  to this file.

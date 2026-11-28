# Candidate Verification

Owner: `opl-studio` verification; App retains acceptance authority
Purpose: `candidate_verification_boundary`
State: `active_support`
Machine boundary: Command and evidence interpretation guide. Passing commands
proves only the named source, test, build, package, or local-smoke layer; it
does not prove App adoption, release, owner acceptance, or production readiness.

## Repository-Native Gate

```bash
npm ci
npm test
```

`npm test` runs `test:source` (`test:ownership`, `typecheck`, `test:node-suite`,
`test:bun-suites`, and `validate:candidate`). Source CI runs on PRs, pushes to
`main`, and manual dispatch (`.github/workflows/non-release-validation.yml`). It
does not build carrier packages or prove release readiness. Read `package.json`
for exact script definitions.

## Focused Commands

| Command | Evidence layer |
| --- | --- |
| `npm run typecheck` | TypeScript source consistency |
| `npm run build:plugins` | Build `@gaofeng21cn/opl-plugin-ui-kit` and DSH plugin `lib/` payloads |
| `npm run test:desktop` | Electron isolation, IPC adapter, updater, and guarded shutdown |
| `npm run test:headless` | Standalone bind/config validation, `/healthz`/`/readyz`, child App Server, signal shutdown |
| `npm run headless:install` / `status` / `stop` / `start` / `restart` / `update` / `rollback` / `uninstall` | Current-user macOS/Linux native service lifecycle |
| `npm run test:threads` | Desktop/WebUI thread lifecycle, pagination, renderer, and subagent projection |
| `npm run test:webui-host` | DSH Host boot/profile/inventory, authenticated MCP, Codex ownership, HTTP/SSE, OPL projection |
| `npm run test:dsh-plugins` | Native profile add/remove, packed DSH plugin boot outside checkout, UI kit packaging |
| `node --test scripts/dsh-profile-plugins.test.mjs` | Native profile override updates, Superagent workbench boot, baseline restore guards |
| `node --test scripts/desktop-runtime-pruning.test.mjs` | YAML module survival under desktop dependency pruning filters |
| `node --test src/host/opl-passthrough.test.mjs` | Fast Host projection compression and managed-update filtering |
| `node --test src/host/link-internet.test.mjs` | Virtual Link routing, chunked receipts, bounded file ranges, and redaction |
| `node --test src/host/thread-workspace-service.test.mjs` | Canonical thread workspace list/read/search bounds and symlink containment |
| `npm run test:mcp-apps` | MCP App resource formats, CSP, thread isolation, reset/close races, model context |
| `npm run test:features` | Feature status, workspace git, workbench task executor, and memory/resource projections |
| `npm run test:client-cordis` | Studio Client Cordis policy, typed slot/event lifecycle, and contribution actions |
| `npm run validate:client-conformance` | Framework -> App -> Studio Client compatibility and wire-ref readback |
| `npm run validate:candidate` | Required source markers, DSH cohort alignment, and false-ready guards |
| `npm run verify:dsh-gui` | Vendored DSH GUI inventory, patch replay, and upstream byte parity |
| `npm run dsh:status` / `dsh:preflight` / `test:dsh-upgrade` / `dsh:replay` / `dsh:verify` | DSH upstream binding readback and replayable upgrade verification |
| `npm run validate:state-model` | Legacy `opl` CLI state projection mapping (not in default source CI) |
| `node scripts/acceptance/settings-ui.mjs --model-policy-only` | Rendered Settings model policy, bilingual search focus, opt-in switch, and blocked custom sends |
| `node scripts/acceptance/rendered-ui.mjs` | Browser WebUI acceptance across layouts, inspector tabs, Settings, and `turn/steer` |
| `node scripts/smoke-mcp-apps.mjs` | Browser `McpAppWorkspace` smoke (add `--relay-root <path>` for live Relay draft round-trip) |
| `npm run smoke:webui` / `smoke:visual` | Local WebUI host/renderer and source-level visual smoke |
| `OPL_APP_REPO_ROOT=/abs/app/root npm run package` | Three-carrier candidate outputs (Electron `.app`, WebUI archive, Docker receipt, manifest) from clean `HEAD` |
| `npm run validate:package` | Electron/three-platform builder validation (`--distribution` validates Windows WSL payload post-pack) |
| `npm run dist:mac` / `dist:windows` / `dist:linux` | Platform bundle construction (`dist:windows`/`dist:linux` publish disabled) |
| `npm run qualify:desktop:mac` / `qualify:desktop:mac:release` / `qualify:desktop:updater:local` | macOS bundle trust, Gatekeeper/staple, and Squirrel.Mac loopback update verification |
| `npm run qualify:desktop:clean-vm` / `qualify:desktop:fixture-vm` | Tart clean-VM install and synthetic fixture VM qualification |
| `npm run smoke:preview` / `smoke:desktop-live` / `diagnose:gateway:persistence` | Live Preview CDP smoke, unpacked app AX/process cleanup, and Gateway persistence check |
| Legacy `npm run test:workbench-services` (retired) | Retired Temporal schedule integration check (replaced by Framework v2 SQLite Runway checks) |
| `npm run build:docker` / `smoke:docker` / `smoke:docker:lifecycle` | Local OCI candidate build and container install/update/rollback/cleanup smoke |

## Client Qualification

```bash
npm run validate:client-conformance -- --out out/qualification/client-conformance.json
```

Reads exact Framework and App refs alongside Studio `main`, materializes the
canonical Framework producer in a temporary directory, and validates Studio
Client Cordis compatibility, `client_renderer_compatibility`, typed slot/event/action
shapes, `service_status` placement under `settings.services.installed_services`,
and `activity_log` staying destination-null. Ignored receipts record observed
commit/tree identities and do not qualify releases.

## DSH Upstream Upgrade Gate

`packages/dsh-adapters/deepseekHarnessSourceManifest.json` owns the pinned DSH
ref, package cohort, GUI roots, and file inventory consumed by
`scripts/dsh-upstream.mjs`.

1. Inspect binding and preflight against a clean upstream checkout:
   ```bash
   npm run dsh:status
   npm run dsh:preflight -- --source /absolute/path/to/clean/deepseek-harness --version <ver> --branch <branch>
   ```
2. Update the manifest, `package.json`, and lockfile together, install, then run
   `npm run dsh:replay -- --source <checkout>` (or `npm run dsh:verify -- --source <checkout>`
   without regenerating vendor sources). Verification checks exact installed
   cohort alignment, reverses and verifies the React 19 compatibility patch
   digests, validates Desktop/Web schemas via official DSH APIs, and runs Host,
   Client Cordis, headless, and candidate gates. For `0.2.3-alpha.2`, the keyed
   `main` slot uses `conversation` fallback (`activePanelId: null`).

## Three-Carrier And Rendered Acceptance

- **Three-carrier candidate (`npm run package`):** Reads App's
  `app-shell-candidates.json` from `OPL_APP_REPO_ROOT`, rejects dirty tracked
  trees, binds outputs to Studio `HEAD`, and emits local Electron, WebUI, Docker
  smoke, and manifest evidence without proving signing, feeds, or adoption.
- **Rendered browser gates:** `node scripts/acceptance/rendered-ui.mjs` checks
  wide/narrow layouts, inspector tabs, Settings modal focus, and `turn/steer`;
  `node scripts/acceptance/settings-ui.mjs --model-policy-only` checks custom
  model opt-in, bilingual search focus, draft retention, and blocked sends;
  `node tests/renderer/history-pagination.fixture.mjs` + `history-pagination.mount-check.js`
  and `FAKE_APP_SERVER_EXECUTION_DETAILS=1` + `execution-details.mount-check.js`
  verify pagination and default-collapsed disclosures via Playwright CLI.
- **Installed Preview acceptance:** Installs only isolated
  `cn.onepersonlab.opl.studio.preview` (leaving Stable `/Applications/One Person Lab.app`
  untouched) and verifies packaged Host/Codex startup, text-only header, native
  permissions risk flow, Settings placement, Gateway projection, real Codex turn
  round-trip, and inspector responsiveness against exact `app.asar` bytes.

## Desktop, Headless, And OCI Qualification

- **Desktop CI:** `.github/workflows/macos-desktop-release-qualification.yml`
  validates unsigned arm64 DMG/ZIP startup, architecture, AX tree, and cleanup;
  `.github/workflows/additional-carrier-qualification.yml` validates Windows NSIS
  and Linux DEB install/update/rollback/uninstall and UIA/AT-SPI trees with
  `--publish never` (AppImage is excluded due to FUSE/AppArmor Chromium sandbox
  constraints). See [Desktop distribution](delivery/desktop-distribution.md) for
  signing, Squirrel.Mac loopback, Preview/Stable migration, and Windows WSL2 payload checks.
- **Headless & OCI:** `npm run build:webui && npm run start:headless` serves
  `/healthz` and `/readyz` with bounded SIGINT/SIGTERM shutdown; hosted headless
  lanes exercise macOS LaunchAgent and Linux systemd install/update/rollback.
  Docker/OCI lifecycle and dual-arch attestation rules live in
  [OCI distribution](oci-distribution.md).

## False-Ready Guard

These fields in `src/candidateContractEvidence.json` stay `false` unless an
owning App/runtime/domain/release gate supplies fresh evidence:

- `active_shell_adopted`, `release_ready`, `production_ready`, `clean_vm_ready`,
  `remote_ready`, `domain_ready`, `owner_receipt`, `package_truth_owned`,
  `runtime_authority_transfer`, `domain_truth_owned`.

Runtime note: Studio requires Node.js `^24.22.3 || >=26.13.1` (`package.json#engines.node`);
source CI and the digest-pinned Docker carrier run Node.js 26.

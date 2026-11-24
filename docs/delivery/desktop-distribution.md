# Desktop Distribution Evidence

`opl-studio` implements the current One Person Lab App carrier and the retained
Preview migration identity. Standalone Preview publication is retired; source
selection, public assets, and completed installed upgrades remain separate facts
proven by their owning receipts.

| Build | Identity and feed | Existing user state |
| --- | --- | --- |
| Preview | `cn.onepersonlab.opl.studio.preview`, `opl-studio` Releases | Existing `opl-studio` userData |
| Stable | `cn.onepersonlab.opl`, `one-person-lab-app` Releases | Existing `One Person Lab` userData and Framework/Codex owner state |

`electron-builder.stable.yml` and the App controller supply the Stable display
version and strictly increasing updater version. Preview's packaged
`preview-handoff.json` stays disabled until an exact Stable target is available;
its terminal bridge verifies target digest and Developer ID signature, waits for
exit, retains backup, imports allowlisted shell state (leaving Framework, Codex
Home, and credentials with their owners), preserves conflicting drafts, and
stops migration on conflicting channel bindings.

## Carrier transition constraints

App owns activation, target identity, feed routing, migration policy, and
adoption gates (`contracts/app-release-channel.json`,
[App distribution reference](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/delivery/distribution-and-install-ssot.md)).
`contracts/desktop-release-carrier.json` declares Studio's carrier release surface,
while App owns the shared toolchain, signing/notarization stages, and public readback.

- The bridge verifies target version, digest, Developer ID team, and Apple trust
  before replacing the bundle; the final Preview feed continues serving the
  compatible bridge for returning users without retargeting unprepared old updaters.
- Coexisting Preview and Stable installs detect active turns, wait for idle,
  never overwrite running apps, and retain backups until the new App proves
  startup and canonical data access.
- Legacy shell metadata links only owner-confirmed canonical Codex threads
  idempotently without copying messages or creating migration threads.
- App qualifies download, signature, idle handling, install, relaunch, rollback,
  and failure paths in isolated macOS VMs; historical passes do not qualify new bytes.

## Build Cache, Payload Pruning, And First-Install Progress

- **Renderer cache & dependency pruning:** `build:desktop` reuses a renderer
  build only when sources, plugins, lockfile, App contracts, environment, and
  output SHA-256/size match (`--skip-vite` requires a verified hit). Standard and
  Preview carriers keep the unpacked production Host dependency graph while
  pruning source maps, `.ts` authoring files, tests, docs, and changelogs; the
  packaged Host startup check verifies runtime closure.
- **macOS signing exclusions:** Signing excludes Chromium resource data, KaTeX
  fonts, and PDF CMaps from individual signing calls while keeping executables,
  libraries, addons, and the deep strict App seal intact.
- **Standard vs Full runtime & onboarding:** Standard uses Framework's managed
  installer; Full bundles verified Codex npm/platform seed archives validated by
  digest and delegated to Framework before App Server startup (usable existing
  Codex takes precedence; failed seeds never silently fall back online). Desktop
  replays ephemeral `desktop/runtime-setup` progress to late subscribers and
  mounts DSH's official `OnboardingModal` (`@deepseek-ai/dsh-client-ui-settings-models`),
  preserving focus and dismissal ownership in DSH Settings while background
  installation continues.

## Qualification And Update Maintenance

- **macOS packaging & feeds:** `npm run dist:mac` emits Developer ID signed ZIP,
  ULFO DMG, and identical `latest-mac.yml` / `latest-arm64-mac.yml` feeds (using
  `APPLE_KEYCHAIN_PROFILE` for notarization when publishing). Default
  `qualify:desktop:mac` records Gatekeeper/staple state; `qualify:desktop:mac:release`
  fails closed unless Gatekeeper and stapled App/DMG tickets pass (optionally
  reusing an exact-digest `OPL_DESKTOP_NOTARIZATION_RECEIPT`).
  `qualify:desktop:updater:local` verifies Squirrel.Mac replacement on an isolated
  loopback feed.
- **Preview & VM smokes:** `npm run smoke:preview` runs against CDP (`--require-gateway-setup`,
  `--require-codex-turn`); for `--require-codex-turn`, both `passed`
  (`generation_completed`) and structured `INSUFFICIENT_BALANCE`
  (`connectivity_confirmed` / `provider_reachable_without_generation`) satisfy the
  provider reachability contract, while auth/403/transport/timeout errors fail.
  `qualify:desktop:clean-vm` tests a fresh Tart macOS clone (injecting runner CA
  trust via `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` without modifying the bundle);
  `qualify:desktop:fixture-vm -- --dmg <DMG>` drives the real packaged App with
  `tests/fixtures/studio-vm-fixture` (`out/feature-vm-ui.json`). Neither replaces
  App release qualification.
- **Managed updates & Gateway persistence:** `npm run diagnose:gateway:persistence`
  verifies Framework `credentials.json`/`account.json`/`installation.json` across
  cold start. Main process injects `OPL_CODEX_BIN` and `OPL_APP_OPL_BIN` before
  Host boot; `src/host/managed-update-maintenance.mjs` schedules background App
  downloads (installed on idle exit) and `opl update activate` / `opl update apply`
  Framework/Package maintenance (`OPL_STUDIO_MANAGED_UPDATES=0` disables it). Host
  failures never block native App update IPC recovery.
- **Joint Full & OCI builds:** For joint OCI releases, follow
  [publication order](../oci-distribution.md#publication-order) before tagging
  `v<version>`. Use `OPL_APP_REPO_ROOT=/path/to/one-person-lab-app npm run build:full -- --out-dir ... --skip-gui-build`,
  seal Standard feeds/DMG before building Full, notarize both DMGs (`notarize-macos-dmg.ts`),
  refresh feed hashes/manifests, and append Full via `scripts/studio-full-release-adapter.ts`.

## Windows guest Host payload

The Windows Stable carrier ships an App-owned Linux x64 guest Host payload at
`resources/opl-wsl-host` (guest Host entry, DSH plugin closure, production
`node_modules`, pinned Node/Codex runtime, Framework installer, Official
Profile) projected into the App-owned WSL2 `OPL-Linux` distribution.

`scripts/desktop/prepare-wsl-host-payload.mjs` stages tracked sources, runs
`npm ci --omit=dev --ignore-scripts` and `src/host/packaged-host-smoke.mjs` on
Linux x64, materializes symlinks (for NTFS extraction), and writes `manifest.json`
(`opl_studio_windows_guest_host.v1`). Because `electron-builder` omits root
`node_modules` in `extraResources`, `electron-builder.stable.yml` explicitly
declares both `resources/opl-wsl-host` and `resources/opl-wsl-host/node_modules`.
Qualification runs pre-pack (`prepare-wsl-host-payload.mjs --validate`) and
post-pack (`validate-desktop-package.mjs`), failing closed on any byte/symlink
mismatch.

### Post-pack receipt

`node scripts/validate-desktop-package.mjs --distribution --write-receipt --identity stable --version <version>`
writes `out/opl-windows-guest-host-payload-qualification.json` and emits
`packagedWslHostPayload`:

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

On `wsl_guest_bootstrap_failed`, bounded stage/exit/timeout facts are saved in
`installer/receipts/windows-wsl2-bootstrap-failed.json` under user-data (without
raw stdout/commands/credentials); successful installs record `windows-wsl2-ready.json`.

## Codex CLI version ownership

macOS Standard and Full bundles do not embed a second Codex CLI;
`opl-codex-native` launches the user or Framework-managed binary via
`OPL_CODEX_BIN` and the desktop resolver. App pins the stable Codex version and
digests consumed by Windows/WSL bootstrap and Docker (`Dockerfile` and
`compose.yaml` match it). The macOS `afterPack` hook boots the unpacked
`app.asar` Host with isolated fake owners before signing so missing runtime peers
fail the build immediately.

App Server stdio uses LF-delimited UTF-8 JSON framing rather than Node
`readline` so legal Unicode separators (`U+2028`/`U+2029`) inside JSON strings
never split frames.

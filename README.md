<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">OPL Studio</h1>

<p align="center"><strong>The first-party, Codex-native application host for One Person Lab</strong></p>
<p align="center">A DeepSeek Harness/Cordis workbench for persistent conversations, OPL Packages, project progress, files, results, and runtime operations.</p>

<p align="center">
  <a href="https://github.com/gaofeng21cn/opl-studio/releases/latest"><strong>Download the latest Preview</strong></a>
  · <a href="./docs/README.md">Documentation</a>
  · <a href="./docs/architecture.md">Architecture</a>
  · <a href="./docs/verification.md">Verification</a>
</p>

<!--
Owner: `one-person-lab-app`
Purpose: `public_native_product_entry`
State: `public_preview_release_active_active_shell_adoption_separate`
Machine boundary: Human-readable Studio entry. App product and adoption truth stays in one-person-lab-app contracts; runtime and Package truth stays in OPL Framework; domain truth stays with domain owners. A public Preview does not by itself adopt Studio as the Stable App shell or establish production readiness.
-->

## Overview

OPL Studio is the first-party successor Application Host for One Person Lab. It
combines a persistent Codex backend, the OPL App product model, Framework-owned
runtime and Package projections, and a shared desktop/WebUI renderer in one
workbench.

Studio is built on a pinned DeepSeek Harness (DSH) `v0.1.1-rc.2` application
skeleton and GUI source cohort. DSH supplies the Cordis application host,
plugin lifecycle, layout system, UI primitives, and interaction foundations.
OPL supplies the product identity, Codex integration, Framework bridge, product
policy, and first-party plugins.

This repository is not a second OPL Framework implementation. The product
boundary remains:

```text
OPL Base        runtime and Package authority
OPL App         product, GUI contract, adoption, and release authority
OPL Studio      Application Host, Codex backend, renderer, and plugin host
OPL Packages    professional Agents, Skills, Tools, Plugins, and Workflows
OPL Cloud       optional online workspaces and hosted services
```

## Preview Distribution

The public Preview is currently distributed for **macOS arm64** through the
[latest GitHub Release](https://github.com/gaofeng21cn/opl-studio/releases/latest).
The app is signed, notarized, stapled, and connected to its own Preview update
feed. It uses the isolated bundle identifier
`cn.onepersonlab.opl.studio.preview` and does not replace the Stable
`One Person Lab.app` installation.

The same Release contains two payload densities:

| Package | Intended use | Payload |
| --- | --- | --- |
| **Standard** | Upgrades or connected first installs | Smaller app package; the first-run path prepares the exact OPL Base runtime separately |
| **Full** | Recommended for first-time Preview evaluation | Includes the exact OPL runtime payload to reduce first-launch dependency downloads |

Standard and Full are two payloads of one version, not separate product
versions or update channels. Full does not embed Codex; Studio resolves an
exact external Codex carrier through the App-owned launch and qualification
contract.

> **Preview boundary:** the public package is intended for internal evaluation.
> Studio does not become the Stable OPL App shell until the App owner completes
> the separate clean-VM, equivalence, and adoption gates. AionUI remains the
> current Stable App shell during that transition.

Windows, Linux, and standalone Headless WebUI remain development candidates and
are not public Studio distribution targets. Docker/OCI WebUI `v0.1.6` is a
public, signed dual-architecture Preview for Cloud owner evaluation at
`ghcr.io/gaofeng21cn/opl-studio-webui@sha256:2725311bfb74483f71c6a6f363c1e96c62abb272ef9f0bef171131939b4945ea`.
It does not replace the Stable App shell or by itself open Cloud user testing.

## Core Capabilities

- Persistent Codex threads, turns, approvals, streaming events, and history.
- One project and conversation directory backed by canonical Codex App Server
  thread APIs rather than a copied Native conversation store.
- Dynamic OPL Agent and capability discovery from App/Framework projections,
  without a hard-coded roster of Package brands.
- Project progress, files and results, and Agents and capabilities in an
  on-demand task inspector.
- App-owned Settings, Gateway account configuration, model selection,
  permission controls, runtime status, and update status.
- DSH-native tool plugins exposed to Codex through an authenticated loopback
  MCP bridge.
- One renderer and Host contract across Electron and the standalone WebUI
  candidate.

## Architecture

```text
Electron / WebUI renderer
        |
        v
OPL Studio DSH/Cordis Application Host
        |-- opl-codex-native ------> persistent Codex App Server
        |-- opl-dsh-tool-mcp ------> DSH tool plugins
        |-- opl-framework-bridge --> OPL App state/action contracts
        `-- opl-web-routes --------> HTTP/SSE WebUI transport
                                         |
                                         v
                                OPL Framework Host
                           runtime and Package authority
```

Studio runs a dedicated `opl-studio` DSH profile but deliberately excludes
`dsh-base`. It therefore does not adopt a second DSH session store, LLM/provider
router, Agent loop, or credential authority. `opl-codex-native` is the only
owner of the persistent Codex App Server, canonical threads and turns,
approvals, and live turn events inside Studio.

`opl-framework-bridge` consumes only the App/Framework public state, action,
authentication, and channel callback contracts. Framework remains the owner of
runtime currentness, Package discovery, installation, and Package state.

| Concern | Authority |
| --- | --- |
| Product behavior, model policy, GUI ABI, adoption, and release | [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app) contracts and workflows |
| Studio Host, DSH profile, renderer, plugin lifecycle, and Codex integration | This repository |
| Runtime and Package graph | [`one-person-lab`](https://github.com/gaofeng21cn/one-person-lab) / OPL Framework |
| Thread identity, history, approvals, and turns | Codex App Server through `opl-codex-native` |
| Professional quality, artifacts, and delivery decisions | The corresponding OPL Package/domain owner |

See [Implementation and authority architecture](./docs/architecture.md) for the
complete boundary.

## Develop Locally

Install dependencies and start the Electron development carrier:

```bash
npm ci
npm run dev:desktop
```

Start the standalone WebUI candidate at `http://127.0.0.1:4178`:

```bash
npm run dev
```

For App-managed Preview launch and environment injection, use the sibling
`one-person-lab-app` repository:

```bash
npm run gui -- --shell opl-studio
npm run gui -- --shell opl-studio --rebuild
npm run gui -- --shell opl-studio --allow-actions
```

The App-managed route supplies the product profile and external runtime inputs.
Directly opening a locally built bundle is useful for development, but it is
not equivalent to the App-owned launch or release qualification path.
For direct Desktop or WebUI runs, set `OPL_CODEX_BIN` and `OPL_APP_OPL_BIN`
when the corresponding `codex` and `opl` executables are not discoverable on
`PATH`.

### Headless And Docker Candidates

Build and run the standalone Node Host:

```bash
npm run build:webui
npm run start:headless
```

Build the local Docker candidate:

```bash
docker compose up --build
```

Both routes default to loopback. Do not expose the HTTP/SSE bridge to an
untrusted network; the current candidate does not define a public remote-access
security boundary. See [OCI distribution](./docs/oci-distribution.md) and
[desktop distribution](./docs/delivery/desktop-distribution.md) for the exact
carrier status.

## DSH Upstream Maintenance

The DSH source ref, package cohort, vendored GUI roots, and file inventory are
pinned in
[`deepseekHarnessSourceManifest.json`](./src/composition/deepseekHarnessSourceManifest.json).
The binding is designed to follow upstream through an explicit replay rather
than an untracked fork.

Read the current binding and produce a no-write upgrade plan with:

```bash
npm run dsh:status
npm run dsh:preflight -- --source /absolute/path/to/clean/deepseek-harness
```

An upgrade must update the manifest and dependency cohort together, re-vendor
the declared GUI source roots, replay the Studio profile and overlays, and pass
the focused Host, renderer, and candidate gates. Package installation or GUI
byte parity alone is not sufficient compatibility evidence.

## Verification

Run the repository source gate:

```bash
npm test
```

`npm test` covers type checking, Desktop/headless/OCI contracts, the DSH Host
and MCP bridge, thread and workspace services, product projections, Client
Cordis composition, and candidate invariants. It does not construct or certify
a public Release.

For App-contract-driven local carrier evidence from a committed, tracked-clean
Studio checkout:

```bash
OPL_APP_REPO_ROOT=/absolute/path/to/one-person-lab-app npm run package
```

That command produces local Electron, standalone WebUI, and Docker candidate
evidence. Signing, notarization, publication, clean-VM qualification, and
Stable App adoption remain App-owned release operations. See
[Verification and evidence boundaries](./docs/verification.md) before
interpreting a test or package result.

## Documentation

- [Documentation and owner map](./docs/README.md)
- [Implementation and authority architecture](./docs/architecture.md)
- [Architecture whitepaper](./docs/whitepaper.md)
- [Current state and remaining gaps](./docs/active/current-state-vs-ideal-gap.md)
- [Verification and evidence boundaries](./docs/verification.md)
- [Desktop distribution](./docs/delivery/desktop-distribution.md)
- [Historical candidate baseline](./docs/history/README.md)

## License

OPL Studio is licensed under the [Apache License 2.0](./LICENSE). Vendored and
runtime third-party components retain their own licenses and notices in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

# OPL Studio Documentation

Owner: `one-person-lab-app`
Purpose: `docs_index`
State: `active_index`
Machine boundary: Human-readable navigation and ownership map. App contracts,
Framework state/action output, Codex App Server, source/tests, and explicit owner
decisions remain the corresponding machine and product truth.

This repository implements the first-party `opl-studio` DSH/Cordis Application
Host and Studio carrier for the single OPL App product, not a second App. It
does not own App product requirements, OPL runtime/package truth, Codex thread
truth, domain verdicts, release adoption, or production readiness.

The Stable sibling is `opl-aion-shell`. Both carriers consume the same
`one-person-lab-app` product contracts, Framework Host projection, Client Cordis
contribution ABI, and versioned composition inputs. Studio additionally owns
its DSH Host profile and App-process plugin lifecycle, but only the App repository
can change `active_shell` or declare a release combination.

Both carriers sit inside the same `OPL Base + OPL App + OPL Packages + optional
OPL Cloud` ecology. Studio owns its Application Host implementation; it never
promotes itself into Base, Package lifecycle, Cloud service, or App authority.
Framework's Host projection is active. Studio's qualification lane consumes the
canonical producer and App product profile, then compares its Client projection
with AionUI. This repository still owns only candidate compatibility evidence;
App release admission remains separate.

## Current Owners

| Theme | Single Source of Truth |
| --- | --- |
| Public Studio entry | [English README](../README.md) and [Chinese README](../README.zh-CN.md) |
| Application Host implementation boundary | [Architecture](./architecture.md) |
| Application Host architecture rationale | [Whitepaper](./whitepaper.md) |
| Current state, open gaps, and next prompt | [Single Active Truth plan](./active/current-state-vs-ideal-gap.md) |
| Validation meaning | [Verification](./verification.md) |
| Superseded implementation and visual baseline | [History](./history/README.md) |
| App product, candidate role, and adoption | `one-person-lab-app` contracts and GUI docs |
| Runtime/package state and actions | OPL Framework contracts and fresh `opl app ... --json` output |

Canonical filenames are mapped without creating duplicate truth:

- the root English and Chinese README pair carries the `project` role;
- the Active Truth plan carries the `status` role;
- `AGENTS.md` and `architecture.md` carry repo invariants;
- App-owned contracts carry product/adoption decisions, so this repository does
  not create a second `decisions.md`.

## App Authority Inputs

- [`app-shell-candidates.json`](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-candidates.json): Studio is the active-development Native successor and current foreground alternative; AionUI remains active until cutover.
- [`app-shell-adapter.json`](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-adapter.json): only this contract can change the active release shell.
- [`opl-studio-plan.md`](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/product/gui/opl-studio-plan.md): Studio must complete the App-owned minimum product before separate release qualification and explicit mainline cutover.
- [`app-gui-product-contract.json`](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-gui-product-contract.json): product behavior and allowed state/action surfaces.

These links are owner inputs, not copied truth. Read their current `main` bytes
before changing candidate behavior or status language.

## Current Portfolio Coverage

Every tracked `README*` and `docs/**/*.md` file is assigned below; no active
document is unclassified.

| Lifecycle | Covered files |
| --- | --- |
| Public entry | `README.md`, `README.zh-CN.md` |
| Navigation and architecture | `docs/README.md`, `docs/architecture.md`, `docs/whitepaper.md` |
| Active Truth | `docs/active/current-state-vs-ideal-gap.md` |
| Verification support | `docs/verification.md` |
| History/provenance | `docs/history/README.md`, `docs/history/2026-07-candidate-baseline.md` |

## Growth Rule

Do not add candidate roadmaps, product specs, model lists, package catalogs, or
thread-state documents here. Update an existing owner or route a product
decision to App. New candidate docs require one durable purpose, lifecycle
state, and authority boundary.

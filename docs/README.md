# OPL Studio Documentation

Studio owns the DSH/Cordis Application Host implementation and its carrier
adapters. App owns product behavior and release/adoption; Framework owns runtime
and Package composition; Codex App Server owns threads and turns. Each document
below explains one part of that arrangement without becoming another authority.

| Reader task | Document | Responsibility |
| --- | --- | --- |
| Start using or developing Studio | [English README](../README.md), [中文入口](../README.zh-CN.md) | One public entry maintained as a language pair |
| Change implementation boundaries | [Architecture](architecture.md) | Host, bridge, renderer, ownership, and durable design rationale |
| Place a Settings contribution | [Settings projection](settings-information-architecture.md) | Studio rendering of App-owned placement policy |
| Reuse generic DSH plugins | [Ecosystem clients](ecosystem-client-plugins.md) | Reviewed official/community plugins, source provenance, and canonical workspace adapters |
| Select verification | [Verification](verification.md) | Commands, prerequisites, and what their results prove |
| Build and qualify macOS distribution | [Desktop distribution](delivery/desktop-distribution.md) | Desktop bundle, updater, bootstrap, and release qualification |
| Operate the OCI carrier | [OCI distribution](oci-distribution.md) | Immutable-image lifecycle, authentication, and Cloud handoff |
| Evaluate remaining adoption work | [Adoption gaps](active/current-state-vs-ideal-gap.md) | Owner decisions and exact evidence still to check |
| Understand a retired design | [History](history/README.md) | Dated provenance and reasons not to revive old implementation |
| Contribute safely | [AGENTS.md](../AGENTS.md) | Repository working rules |
| Inspect third-party provenance | [Third-party notices](../THIRD_PARTY_NOTICES.md) | Source identity and license obligations |

`resources/opl-framework-bootstrap/README.md` describes only the generated
payload directory. Exact payload identity remains in its generated manifest.

## Authority Inputs

- [App shell adapter](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-adapter.json) selects the active release carrier.
- [App candidate contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-candidates.json) declares Studio's role and local carrier evidence requirements.
- [App GUI contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-gui-product-contract.json) defines product state and actions.
- Framework contracts and fresh `opl app state/action` output own runtime and Package truth.

Read the current owner before changing an implementation or status claim. This
index does not copy the owner's roadmap or publication state.

## Documentation Lifecycle

Update the existing topic owner when behavior changes. New documents need a
distinct reader task and a link from this index; navigation summarizes linked
topics instead of repeating their rules. Keep the public language pair aligned.

Active references describe current code and constraints. Gap records contain
only unresolved work. When a gap closes, fold durable facts into the reference
and remove the completed entry. Retain a historical record only for unique
rationale or provenance that prevents a plausible regression; ordinary task
logs and superseded inventories belong in Git history.

Before retiring or moving a document, transfer unique current guarantees and
repair inbound references in the same change. Do not retain aliases for removed
documentation. Check links, file existence, license identity, and executable
examples mechanically; assess meaning and owner boundaries from source and
contracts, not required prose or heading snapshots.

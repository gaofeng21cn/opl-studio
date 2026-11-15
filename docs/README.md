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
| Connect an iPhone or iPad | [OPL Link connection](opl-link.md) | Scoped companion connection on the existing Host, pairing, revocation and verification |
| Reuse generic DSH plugins | [Ecosystem clients](ecosystem-client-plugins.md) | Reviewed official/community plugins, source provenance, and canonical workspace adapters |
| Select verification | [Verification](verification.md) | Commands, prerequisites, and what their results prove |
| Build and qualify macOS distribution | [Desktop distribution](delivery/desktop-distribution.md) | Desktop bundle, updater, bootstrap, release qualification, and carrier transition constraints |
| Operate the OCI carrier | [OCI distribution](oci-distribution.md) | Immutable-image lifecycle, authentication, and Cloud handoff |
| Evaluate carrier and migration evidence | [Adoption gaps](active/current-state-vs-ideal-gap.md) | Owner decisions and exact evidence still to check |
| Contribute safely | [AGENTS.md](../AGENTS.md) | Repository working rules |
| Inspect third-party provenance | [Third-party notices](../THIRD_PARTY_NOTICES.md) | Source identity and license obligations |

`resources/opl-framework-bootstrap/README.md` describes only the generated
payload directory. Exact payload identity remains in its generated manifest.

## Authority Inputs

- [App shell adapter](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-adapter.json) selects the active release carrier.
- [App distribution reference](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/delivery/distribution-and-install-ssot.md) owns product identities, update routing and migration qualification.
- [App candidate contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-candidates.json) declares Studio's role and local carrier evidence requirements.
- [App GUI contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-gui-product-contract.json) defines product state and actions.
- Framework contracts and fresh `opl app state/action` output own runtime and Package truth.

Read the current owner before changing an implementation or status claim. This
index does not copy the owner's roadmap or publication state.

## Documentation Lifecycle

Document ownership, lifecycle, and retirement rules belong to the family policy
at `one-person-lab/docs/policies/docs-lifecycle-policy.md`. This index only maps
current reader tasks: update the topic owner when behavior changes, require a
distinct reader task for a new document, summarize linked topics instead of
repeating their rules, and keep the public language pair aligned.

[History](history/README.md) holds retained provenance records. They are archive
entries, not part of the current reading path.

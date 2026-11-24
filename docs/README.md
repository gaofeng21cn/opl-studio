# OPL Studio Documentation

Studio owns the DSH/Cordis Application Host implementation and its carrier
adapters. App owns product behavior and release/adoption; Framework owns runtime
and Package composition; Codex App Server owns threads and turns. Each document
below owns one topic without duplicating another authority.

| Reader task | Document | Responsibility |
| --- | --- | --- |
| Start using or developing Studio | [English README](../README.md), [中文入口](../README.zh-CN.md) | Paired public entry and local development overview |
| Understand Host and plugin boundaries | [Architecture](architecture.md) | Application Host, Client Cordis, workbenches, renderer topology, and runtime ownership |
| Author or package DSH plugins | [Plugins entry](../plugins/README.md) | Studio plugin packages, build layout, and DSH Host/Framework boundaries |
| Configure Settings & Software Center | [Settings projection](settings-information-architecture.md) | Unified Software Center, resource/connection routing, and custom model access |
| Connect an iPhone or iPad | [OPL Link connection](opl-link.md) | Scoped companion connection on the existing Host, pairing, revocation, and verification |
| Reuse generic DSH plugins & MCP Apps | [Ecosystem clients](ecosystem-client-plugins.md) | Reused upstream/community UI plugins, sandbox boundary, schedules UI, and MCP App host |
| Select verification | [Verification](verification.md) | Repository suites, DSH upgrade gates, qualification tiers, and false-ready guards |
| Build and qualify desktop releases | [Desktop distribution](delivery/desktop-distribution.md) | Stable/Preview identity, WSL2 guest payload, update maintenance, and desktop qualification |
| Operate the OCI carrier | [OCI distribution](oci-distribution.md) | Immutable-image lifecycle, security boundary, and Cloud handoff |
| Evaluate adoption & remaining gaps | [Adoption gaps](active/current-state-vs-ideal-gap.md) | Owner decisions and exact evidence still required |
| Contribute safely | [AGENTS.md](../AGENTS.md) | Repository working rules |
| Inspect third-party provenance | [Third-party notices](../THIRD_PARTY_NOTICES.md) | Source identity and license obligations |

`resources/opl-framework-bootstrap/README.md` describes only the generated
payload directory, and `templates/plugin-devkit/README.md` documents the
three-tier plugin devkit templates.

## Authority Inputs

- [App shell adapter](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-adapter.json) selects the active release carrier.
- [App distribution reference](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/delivery/distribution-and-install-ssot.md) owns product identities, update routing, and migration qualification.
- [App candidate contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-shell-candidates.json) declares Studio's role and local carrier evidence requirements.
- [App GUI contract](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-gui-product-contract.json) defines product state and actions.
- Framework contracts and fresh `opl app state/action` output own runtime and Package truth.

Read the current owner before changing an implementation or status claim. This
index does not copy another owner's roadmap or publication state.

## Documentation Lifecycle

Document ownership, lifecycle, and retirement rules belong to the family policy
at `one-person-lab/docs/policies/docs-lifecycle-policy.md`. Update the topic
owner in place when behavior changes, keep one durable subject per document,
link rather than copy, and keep the public README language pair aligned.

[History](history/README.md) holds retained visual-provenance records only; it is
an archive boundary, not part of the current reading path.

# Studio Adoption Gaps

This document tracks the evidence needed for Studio adoption. Product
requirements, platform admission, release composition, and the selected Stable
carrier belong to `one-person-lab-app`. Source architecture belongs to
[architecture](../architecture.md); commands and evidence levels belong to
[verification](../verification.md). This page is not an execution prompt or a
release receipt.

## Owner Decisions And Evidence

| Boundary | Owner | Evidence required to close it |
| --- | --- | --- |
| Stable carrier adoption | App | Current `app-shell-adapter.json`, minimum product acceptance, and explicit adoption after the App release gates |
| Cloud Workspace activation | Cloud | Accepted immutable Studio OCI handoff plus real Workspace login, attachment, turn, restart, and rollback readback |
| Additional desktop platforms | App | Platform-specific signed/public artifacts, supported clean installation, update/rollback, and accessibility acceptance |
| Installed Preview acceptance | App | Installed bundle and runtime readback bound to the exact released bytes; earlier candidate receipts do not qualify a later release |

These are separate evidence boundaries, not a declaration that each owner's
latest work remains unfinished. Read the owner contracts and release or
deployment receipts before selecting work. This repository's current source
version is in `package.json`; macOS and OCI publication identifiers belong to
their release assets and handoff receipts rather than a copied status table.

## Scope Of Product Work

Studio develops the App-owned minimum product on the independent DSH/Cordis
Application Host. It preserves required OPL user outcomes. AionUI-specific
providers, Team orchestration, AionCore integration, and custom assistant
catalogs are not automatic Studio parity requirements. Codex-native subagent
display consumes App Server lineage and events without owning scheduling.

Public Preview distribution and a selected local Studio carrier do not transfer
Stable adoption, runtime or Package authority, professional quality, or artifact
acceptance. The retired private cross-thread protocol, host queue, delivery
ledger, and bilateral receipts are not deferred work. A new orchestration
requirement must originate with an explicit App product decision and reuse the
current canonical owner.

## Maintenance

Record only an actionable remaining gap whose owner and closure evidence are
known. When it closes, update its implementation or operating reference and
remove the gap. Keep source hashes, installed artifact digests, screenshots,
command transcripts, and release claims in their actual receipts or Git history.
Do not append completion logs, capability catalogs, or a next-Agent prompt here.

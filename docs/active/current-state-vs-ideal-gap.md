# Studio Adoption Gaps

This document routes carrier and migration evidence. App has adopted Studio as
the current production implementation. Product
requirements, platform admission, release composition, and the selected Stable
carrier belong to `one-person-lab-app`. Source architecture belongs to
[architecture](../architecture.md); commands and evidence levels belong to
[verification](../verification.md). This page is not an execution prompt or a
release receipt.

## Owner Decisions And Evidence

| Boundary | Owner | Evidence required to close it |
| --- | --- | --- |
| Active carrier and future adoption changes | App | Current `app-shell-adapter.json` selects Studio; future changes require the App product/release gates, not local candidate evidence |
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
Application Host while preserving required OPL user outcomes. Codex-native
subagent display consumes App Server lineage and events without owning
scheduling, and retired shell catalogs, providers, or custom assistant lists are
not parity targets unless App explicitly admits them.

With the same `CODEX_HOME`, canonical Codex threads remain available through App
Server list/resume, including paginated history. Studio reads thread history and
identity solely from Codex App Server without importing external or retired
shell databases, cache files, history, or settings. Existing user files stay
untouched. Studio Preview to Stable continuity remains a separate signed,
allowlisted handoff for Studio-owned settings, drafts, and canonical channel
bindings; browser-origin-only expansion state is not a conversation-loss condition.

Workspace browsing, search, and external opening or Web download are the
minimum file outcome. Rich preview is optional. Generic features first reuse
official or community DSH plugins; a dedicated Git workbench and storage
deletion UI remain nonblocking unless App explicitly admits them. Studio's
maintained feature plugins focus on OPL research progress, maps, and canonical
owner adapters.

Public Preview distribution and a selected local Studio carrier do not transfer
Stable adoption, runtime or Package authority, professional quality, or artifact
acceptance. Studio carries no private cross-thread orchestration surface: no
proposal/dispatch/wait protocol, host queue, delivery ledger, or bilateral
receipt is deferred work, so a new orchestration requirement needs an explicit
App product decision and the current canonical owner.

## Maintenance

Record only an actionable remaining gap whose owner and closure evidence are
known. When it closes, update its implementation or operating reference and
remove the gap. Keep source hashes, installed artifact digests, screenshots,
command transcripts, and release claims in their actual receipts or Git history.
Do not append completion logs, capability catalogs, or a next-Agent prompt here.

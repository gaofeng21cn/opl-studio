# OPL Studio Instructions

- This repository implements the independent OPL Studio Application Host for
  One Person Lab App on the pinned DeepSeek Harness/Cordis application
  skeleton.
- Keep product truth in `one-person-lab-app` contracts and docs.
- Prefer the pinned official DSH implementation for generic plugin capabilities.
  Before adding or extending an OPL plugin, inspect the official equivalent.
  When it covers the required behavior, switch the real caller and remove the
  superseded implementation in the same change. Keep only the OPL-specific
  adapter; record the concrete gap when a full replacement is not yet valid.
  Revisit these gaps on every DSH upgrade without changing OPL state ownership.
- Do not copy AionUI, Hermes, AGUI, K-Dense, or OpenClaudeScience source into
  this repository without a separate code-reuse decision.
- `opl-codex-native` is the only owner of the persistent Codex App Server,
  canonical threads, approvals, and live turn events inside Studio.
- DSH Host plugins may contribute tools and application services, but Studio
  must not load `dsh-base` or adopt a second DSH session, LLM, agent-loop, or
  credential authority.
- Use OPL App state/action contracts as the only interface to Framework-owned
  runtime and Package truth; `opl-framework-bridge` remains a consumer bridge,
  not a second owner.
- DSH native plugin composition and repeatable upstream upgrades are engineering
  constraints. Use the official SlotRegistry, Cordis lifecycle and Settings
  store/actions; do not recreate generic loaders, store/factory hosts or source
  interception when a public extension point covers the requirement.
- Keep the pinned DSH ref, package cohort, vendored GUI manifest, Host profile,
  profile patches, and focused Host/MCP tests synchronized so upstream upgrades
  remain replayable and reviewable.
- `npm run package` is the App-contract-driven three-carrier candidate evidence
  entry. Run it only from committed, tracked-clean Studio source and bind it to
  the intended App checkout with `OPL_APP_REPO_ROOT`; its manifest is candidate
  evidence, not release or adoption authority.
- Candidate evidence must not claim active-shell adoption, release readiness,
  production readiness, domain readiness, or artifact authority.
- Keep packaged macOS and WebUI on the same renderer and bridge shape.
- Write new GitHub-visible text in English: commit subjects and bodies, pull request and issue
  titles and bodies, comments, and release notes. Product names, code identifiers, paths, commands,
  and verbatim quotations are excepted. When replying to an issue, pull request, or comment written
  by someone else, reply in that author's language instead of converting the thread to English;
  commits already recorded in another language stay in history as they are.
- Follow the topic owners and lifecycle in `docs/README.md`. Fold completed
  implementation facts into their reference, remove obsolete checklists and
  prompts, and preserve only history with a durable decision or provenance role.

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->

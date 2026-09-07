# OPL Studio Instructions

- This repository implements the independent OPL Studio Application Host for
  One Person Lab App on the pinned DeepSeek Harness/Cordis application
  skeleton.
- Keep product truth in `one-person-lab-app` contracts and docs.
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
- Keep the pinned DSH ref, package cohort, vendored GUI manifest, Host profile,
  overlay patches, and focused Host/MCP tests synchronized so upstream upgrades
  remain replayable and reviewable.
- `npm run package` is the App-contract-driven three-carrier candidate evidence
  entry. Run it only from committed, tracked-clean Studio source and bind it to
  the intended App checkout with `OPL_APP_REPO_ROOT`; its manifest is candidate
  evidence, not release or adoption authority.
- Candidate evidence must not claim active-shell adoption, release readiness,
  production readiness, domain readiness, or artifact authority.
- Keep packaged macOS and WebUI on the same renderer and bridge shape.
- Follow the topic owners and lifecycle in `docs/README.md`. Fold completed
  implementation facts into their reference, remove obsolete checklists and
  prompts, and preserve only history with a durable decision or provenance role.

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->

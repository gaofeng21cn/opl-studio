# DSH 通用客户端插件

Studio 的通用能力优先复用 DSH 官方及社区插件。OPL 保留 Codex 对话、文件访问授权及 Framework/App 状态桥；第三方插件负责界面与格式呈现，不另建会话、模型、凭据或 Package 管理器。自有 DSH 插件的目录规范、构建与装载边界见 [plugins/](../plugins/README.md)。

当前载体包含的通用 UI 能力：

| 插件 | 固定版本与来源 | 使用方式 |
| --- | --- | --- |
| DSH OnboardingModal | npm `@deepseek-ai/dsh-client-ui-settings-models@0.2.3-alpha.2`，MIT | 直接导入官方首启容器、样式和焦点生命周期；仅注入 OPL 本机准备与状态内容，不装载其模型或凭据 controller |
| DSH Client Modules | 与 Studio DSH cohort 同步，MIT | Host 扫描启用包的 `dsh.client` 声明生成 graph，由官方 `AppWebEntry` 装载与挂载（Electron 经受限桥接转发） |
| DSH FilesBody | 与 Studio DSH source ref 同步，MIT | 直接复用官方文件树、store 与 face；通过 canonical thread 文件桥浏览与刷新目录 |
| DSH `ui-sidebar-documentpreview` | 固定 DSH cohort 的 MIT 官方源码 | 预览 UI 源码与 OPL workspace 适配器（`EcosystemFilePreview`）编入 `opl-studio-client`；完整 `apply()` 待官方 Remote/Resource/Sidebar/Session 运行时齐备后切换；Office/Excel/PDF 当前返回不可用 |
| [dsh-settings-search](https://github.com/objectivex666/dsh-settings-search) | npm 1.14.0，GPL-3.0 | 经 SHA-256 校验的 `settings-search-studio.patch` 编入 `opl-studio-client`，保留搜索/快捷键/日志（`createLogStore`），关闭第二套模型与凭据读写 |
| [AKS1st/dock-git](https://github.com/AKS1st/dock-git) | MIT（仅评估候选） | 依赖 `dock-base` 与另一组 Cordis/React peer，尚未集成或验收 |

文件预览验证覆盖 workspace bridge 的二进制窗口、跨任务/越界拒绝、取消、一致性与符号链接；Office/Excel/PDF 的官方 Remote 接入仍是待完成的载体能力。

## 客户端扩展与设置生命周期

`opl-studio-client` 在 Cordis context 中安装官方 `SlotRegistry` 与 renderer，session scope 仅由当前 canonical Codex 线程薄投影提供（切换时销毁旧视图 fiber）。`sidebar.settings` 注册官方 `createSettingsShellStore`，`SettingsRoot` 与 App 导航共用其 actions；React 19 兼容补丁及升级入口见 [验证指南](verification.md#dsh-upstream-upgrade-gate)。

## DSH sandbox reuse boundary

At the pinned `0.2.3-alpha.2` cohort (`4b399c39a6d1479cd84ca591b4d7c88e24d38a96`),
`dsh-sandbox` defines subprocess confinement and per-call escalation, and
`dsh-sandbox-local` supplies platform backends (macOS Seatbelt, Linux
bubblewrap/Landlock, Windows restricted tokens). Studio packages those peer
modules as cohort dependencies, but its Host profile does not mount a sandbox
provider or session policy writer.

Codex execution stays under App Server sandbox/approval ownership, and Framework
Package work stays under Framework ownership. Before enabling any DSH plugin
sandbox provider, each `DshToolMcp` call must bind to its canonical thread,
workspace, and allowed mode (never inferring from last UI selection) and pass
read-only denial, workspace write, path/symlink containment, cancellation, and
fail-closed unavailable-backend tests against the packaged carrier.

Sources: [sandbox contract](https://github.com/deepseek-ai/deepseek-harness/tree/4b399c39a6d1479cd84ca591b4d7c88e24d38a96/packages/sandbox/sandbox),
[local provider](https://github.com/deepseek-ai/deepseek-harness/tree/4b399c39a6d1479cd84ca591b4d7c88e24d38a96/packages/sandbox/sandbox-local),
[policy owner](https://github.com/deepseek-ai/deepseek-harness/tree/4b399c39a6d1479cd84ca591b4d7c88e24d38a96/packages/sandbox/sandbox-policy).

## 计划任务、记忆与数据管理

新增面板复用官方 `Button` 与 Settings slot 的 `close` 回调，经 `opl-framework-bridge` 读取 `workbench_services` 并派发 `package_contribution_execute`，不新增 renderer RPC、业务数据库或调度循环：

| 能力 | Studio 入口与边界 |
| --- | --- |
| 用户计划任务 | 主导航 → 计划任务（设置页仅作运行条件与跳转）；每次运行新建 canonical thread，显式只读或工作区写权限 |
| Codex 执行器记忆 | Settings → 智能体与能力 → 记忆：只读 `CODEX_HOME/memories`，纠错建议写入 `extensions/ad_hoc/notes` |
| 任务知识引用 | 同页按需读取领域 owner 提供的 refs，不读取或缓存业务正文 |
| 数据管理 | Settings → 工作区 → 数据与存储：只读用量与带过期校验的可预览清理 |

官方 [`dsh-schedule`](https://github.com/deepseek-ai/deepseek-harness/tree/4b399c39a6d1479cd84ca591b4d7c88e24d38a96/packages/schedule/schedule)、[`ui-schedule`](https://github.com/deepseek-ai/deepseek-harness/tree/4b399c39a6d1479cd84ca591b4d7c88e24d38a96/packages/client/ui-schedule) 及 `cofy-x/dsh-cron` 等均依赖 DSH root Agent/session，故不采用其后端；调度定义、Temporal 补跑/重叠策略与清理归 Framework 公开插件（见 [工作台服务接口](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/specs/workbench-services.md)、[Architecture](architecture.md#workbench-services) 与[知识来源与记忆政策](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/policies/knowledge-source-and-memory-policy.md)）。

## 能力工作台与标准 MCP Apps

### 能力工作台

`opl-studio-client` 通过 `sidebar.footer.action` 与 `shell.overlay` 安装工作台入口，消费 Framework 投影到 `settings.section` 的 `list_detail`、`timeline`、`approval_diff` 与 `activity_log` 视图（按 `dataRef` 命名空间分组，不按 Package 名称硬编码）。所有读写均通过 stdin/stdout JSON ABI 与 App 统一确认/动作桥执行，失败或超时先回读确认而非自动重发，审核差异仅展示真实 `preview.before/after`，界面不持久化业务状态。`presentation.mode=browser` 仅在视图内存中保留无凭据 HTTPS/回环 URL 链接。

### 标准 MCP Apps

`opl-mcp-apps` 消费当前 Codex 对话连接的 MCP 目录并运行 `@modelcontextprotocol/ext-apps` `2.0.4` 的 `AppBridge` 与 `PostMessageTransport`（弥补固定 `0.2.3-alpha.2` DSH 缺少标准 MCP App UI 宿主的缺口）。界面保留单一应用切换工具栏，在无 `allow-same-origin` 的 opaque CSP iframe 中注入 App 主题、语言与尺寸；`ui/update-model-context` 与 `ui/message` 仅准备上下文或草稿，工具权限、Connect 授权与 `opl-workspace://artifact` 媒体预览均由 Codex/Framework/Thread workspace 实时校验，关闭或切换对话立即释放绑定且不自动重试工具调用。详情规范见 [Framework Mini App 规范](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/mcp-apps/SPEC.md)。

### 语音、Profile 与 设置入口边界

语音识别仅将最终转写追加到当前草稿（取消或切换任务即撤销，无识别服务时提示系统听写替代）；个人 Profile 由启动时 `OPL_PROFILE_WORKSPACE` 固定。功能按语义归入主导航/设置（消息与远程通道归连接设置，服务诊断归服务状态，配置归能力设置，软件详情链接直达，OPL Link 不内置自动注册）；Framework Package 依 descriptor 与 `app-shell-adapter.json` 投影接入，与 DSH Host/Client 插件各自保持独立边界。

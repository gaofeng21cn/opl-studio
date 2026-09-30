# DSH 通用客户端插件

Studio 的通用能力优先复用 DSH 官方及社区插件。OPL 保留 Codex 对话、文件访问授权及 Framework/App 状态桥；第三方插件负责界面与格式呈现，不另建会话、模型、凭据或 Package 管理器。

自有插件的统一开发入口是 [plugins/](../plugins/README.md)，采用 DSH npm 包形态与包名解析。Host 实现、客户端入口和第三方适配包都归入该目录；官方 npm 插件继续使用原包依赖。

当前载体包含：

| 插件 | 固定版本与来源 | 使用方式 |
| --- | --- | --- |
| DSH Client Modules | 与 Studio DSH cohort 同步，MIT | 直接使用官方 `createClientModuleSystem` 装载客户端 factory，React 由 Studio 单实例提供 |
| DSH FilesBody | 与 Studio DSH source ref 同步，MIT | 直接复用官方文件树、store 与 face；通过 canonical thread 文件桥浏览与刷新目录 |
| DSH `ui-sidebar-documentpreview` | npm `0.1.7-rc.2`，MIT，固定 DSH cohort | 官方 npm `./client` 已作为静态客户端载荷登记；完整 `apply()` 仍等待文件面板提供官方 Remote、Resource、Sidebar 与 Session 运行时，当前面板使用窄工作区适配器 |
| [dsh-settings-search](https://github.com/objectivex666/dsh-settings-search) | npm 1.2.0，GPL-3.0 | 使用仅依赖 slots/locale 的本地设置搜索；查询设置页与已渲染选项 |

设置搜索选择 1.2.0 是明确的功能范围选择。核对的 1.9.0 增加独立模型设置、API Key 存储与直连推理；Studio 尚未提供与唯一模型/凭据 owner 一致的适配，因此不装载那些功能。搜索插件本身及许可证随载体保留，未复制改写其实现。

`EcosystemFilePreview` 将当前 canonical thread 的相对路径交给 OPL workspace 适配器。Markdown、HTML、图片和普通文本由窄适配器呈现；官方 `ui-sidebar-documentpreview` 的 npm 客户端独立随载体提供，但只有完整的 `remote.workspaceFiles`、`resources`、`sidebarRightTabs`、Session 生命周期和 `apply()` 注入链到位后才切换真实调用者。当前 Office/Excel/PDF 等格式明确返回不可用；每次 DSH 升级必须重新评估并优先接入官方完整路径。

加载器使用显式审阅的随包客户端列表。它不自动扫描、安装或激活任意外部 npm 包，也不替代 Framework 管理的 OPL Package 图。后续插件应先核对许可证、真实注入依赖和 owner 边界，再加入载体并验证真实界面。

客户端静态构建从 `ecosystem/` 加载；`plugins/` 路由由 DSH Host 的插件服务占用。通用文档预览源码随固定 DSH cohort vendored，OPL 不再维护平行社区 viewer 载荷。

社区检索也确认 [AKS1st/dock-git](https://github.com/AKS1st/dock-git) 提供 Git 历史、差异、暂存、提交、推送和分支功能，采用 MIT。它依赖 `dock-base` 的工作台布局和另一组 Cordis/React peer，目前保留为可选适配候选，尚未集成或完成 Studio 运行验收。Git 不需要由 OPL 从头开发，但包存在与可直接安装是两个不同结论。

验证覆盖 workspace bridge 的二进制窗口、跨任务/越界拒绝、取消、响应一致性与符号链接；文件预览复用官方 Markdown primitive。Office/Excel/PDF 的完整官方 Remote 接入仍是待完成的载体能力，不以源码存在替代运行时验收。

## DSH sandbox reuse boundary

At the pinned `0.1.7-rc.2` source, `dsh-sandbox` defines subprocess
confinement and per-call escalation; `dsh-sandbox-local` supplies platform
backends (macOS Seatbelt, Linux bubblewrap/Landlock, Windows restricted tokens).
These share the host kernel/filesystem and do not replace a container or VM.
Backend availability and full/partial enforcement must be reported as facts.

Studio explicitly packages the sandbox and sandbox-policy peer modules needed
by the DSH cohort. Its Host profile does not mount a sandbox provider or a
second session policy store. Installing the modules does not confine plugins.

The useful next integration is bounded DSH plugin subprocess/file work. Codex
execution remains under App Server sandbox/approval ownership, and Framework
Package/runtime work remains under Framework ownership. An in-process plugin
can access Node APIs directly; only operations routed through a confined
executor receive this protection.

Before enabling a provider, bind each MCP tool call to its canonical thread,
workspace and allowed mode. The current DshToolMcp passes call ID, tool arguments
and cancellation only; an MCP session ID is not a Codex thread identity. Never
infer the workspace from the last selected UI thread or use a global writable
fallback. Resolve escalation through the existing approval owner, scoped to the
single call; do not load the DSH session-backed policy writer as a second store.

Acceptance should prove read-only denial, workspace write success, outside-path
and symlink denial, child-process confinement, cancellation, denied escalation,
and fail-closed unavailable backend behavior. Do not advertise this as active
sandbox enforcement until those tests run against the actual packaged carrier.

Sources: [sandbox contract](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/packages/sandbox/sandbox),
[local provider](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/packages/sandbox/sandbox-local),
[policy owner](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/packages/sandbox/sandbox-policy).

## 计划任务、记忆与数据管理

通用基础组件优先采用固定 DSH cohort 的官方实现。新增面板复用官方
`Button` 和 Settings slot 的 `close` 回调；任务、记忆和清理经现有
`opl-framework-bridge` 读取 `workbench_services` 并派发
`package_contribution_execute`，不新增 renderer RPC、数据库或调度循环。

| 能力 | Studio 入口 |
| --- | --- |
| 用户计划任务 | 主导航 → 计划任务：创建、编辑、暂停、恢复、删除、立即运行 |
| 计划执行 | 每次运行新建 canonical thread，显式只读或工作区写权限；结果打开成功后进入对应会话，失败保留任务页面 |
| Memory | Settings → 智能体与能力 → 记忆：查看现有 Markdown，新增、修改、删除用户纠错建议 |
| 领域记忆引用 | 同页按需读取；没有 refs 不等于没有记忆能力 |
| 数据管理 | Settings → 工作区 → 数据与存储：只读用量与可预览清理 |

官方 [`dsh-schedule`](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/packages/schedule/schedule)
及 [`ui-schedule`](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/packages/client/ui-schedule)
的执行端依赖 DSH root Agent/session；`cofy-x/dsh-cron`、`squirrel20/dsh-cron` 和
`Whale-Zhang/dsh-cron-tasks` 的后端同样依赖 DSH Agent/session，因此整套后端都不
采用。任务定义、调度、队列窗口、清理范围、revision 与确认语义归 Framework 公开
插件：见
[工作台服务接口](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/specs/workbench-services.md)
与 [Architecture](architecture.md#workbench-services)。Studio 侧只渲染投影并派发
owner action，不维护业务状态表；其执行器要求显式受限权限，并让超过五分钟的调度
启动过期而不是静默执行。

这些能力需要 Framework 的公开 `./cordis-profiles` 导出
`startCordisWorkbenchServicesHost`；缺少该导出时旧 Framework 会得到明确的升级
提示，普通聊天不被阻塞。源码接入不代表已发布载体自动具备新导出：测试入口和
证据层级见 [Verification](verification.md)，安装包仍须绑定相应 Framework 版本
再验收。

## 实现位置与设置组织

### 能力工作台

`opl-studio-client` 在 Cordis 生命周期内安装 `opl-workspace-client` 子模块，
通过官方 `sidebar.footer.action` 和 `shell.overlay` 插槽提供工作台入口。
它只消费 Framework 已投影到 `settings.section` 的根级 `list_detail`、
`timeline`、`approval_diff` 与 `activity_log` 视图，不扫描插件、不另建能力目录，
也不根据 Persona、Relay 等 Package 名称决定是否显示。停用或卸载后视图随投影移除。

工作台在宽屏右侧停留，聊天区域为它让出空间；窄屏使用可关闭的全宽面板。
导航按视图 `dataRef` 的稳定能力命名空间分组，不重复显示 Package ID。
模块数据仍由 Package 的 stdin/stdout JSON ABI 读取。`input_schema` 提供读取条件，
`input_required` 会显示选择表单；`query/status/offset/limit` 由模块执行完整集合检索与分页，
`pagination` 提供总数与下一页状态。客户端不会把当前一页搜索误称为完整邮箱检索。
`command_inputs` 提供字段合同与默认值；`collection_actions` 明确声明新增等集合操作，
条目 `actions` 提供绑定到当前内容的编辑或审核参数。同一个 action ref 可同时用于新增和编辑，
不会因为已有条目而隐藏新增入口。读取选项和动作都只接受模块与描述文件允许的范围。
表单等待确认和异步执行结果，只有成功才关闭；取消、拒绝或失败保留输入，就地给出结果。
传输超时或未知执行结果不自动重发，先刷新并从实际 owner 核实。
确认页显示具体动作、正文、目标和来源证据；内容指纹与内部编号自动绑定并默认收起。
审核差异只使用模块提供的真实 `preview.before/after`；旧内容未知时仅显示拟写内容，
不伪造“修改前”。时间线和活动视图显示模块提供的时间序列，正文保持可读排版。
客户端只允许描述文件已声明的动作，并继续经过 App 的统一确认与 Framework 动作桥。
审核内容指纹由领域模块检查，语音、场景切换和打开工作台都不构成邮件发送或网站发布授权。
界面不持久化个人数据，人物、记忆、收件箱及提案状态归当前 Profile Workspace 内的领域模块。

此工作台是现有 Studio 客户端插件的一部分，随 Studio 分发，不需要恢复已退役的
`opl-aion-shell`，也不引入独立 Persona App。安装新版领域 Package 后仍需用其真实
描述文件投影验收；仅有仓库中的视图声明不代表已安装载体自动更新。

语音入口复用当前运行环境的识别服务，只把最终转写追加到当前草稿，不提交对话或执行动作。
取消、切换任务、工作区或语言会撤销旧识别，晚到结果不能写入新任务；没有识别服务时明确显示不可用。
Host 的个人 Profile 由启动时的 `OPL_PROFILE_WORKSPACE` 固定，当前没有动态 Profile 切换投影；
不能把 fast/full 状态读取模式当作个人身份。真人麦克风与打包载体的识别服务仍须在目标环境单独验收。

DSH Host 实现在各插件的 `src/`，共用协议与辅助代码在 `src/host`。DSH 插件包统一位于 `plugins/<plugin-id>/`，profile 按 npm 包名加载。`scripts` 只保留启动、构建和验收入口；桌面、WebUI、Docker 加载同一 Host。设置壳位于 `src/workbench/SettingsPanel.tsx`，领域页面位于 `src/workbench/settings/pages`，共享动作、状态、目录和维护组件位于 `src/workbench/settings`。

计划任务使用主导航入口，设置中的后台任务页仅提供运行条件和跳转，两个入口共用同一 Framework 服务及操作确认组件。模型与执行页包含权限、Codex Auto Review 和逐次发送的时间上下文。偏好页包含自定义快捷键和语音输入；语音由运行环境的识别服务提供，未提供时明确说明系统听写替代入口。能力目录提供用途入口、类型筛选与动态 Package 管理，配置表单仍由其唯一功能页持有。

App 的 `app-shell-adapter.json` 是当前壳采用状态的唯一权威；Studio 候选证据不声明发布就绪。OPL Link 暂不内置、不进入自动注册或未安装推荐目录，保留已安装实例及其数据。

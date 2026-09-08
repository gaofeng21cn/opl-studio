# DSH 通用客户端插件

Studio 的通用能力优先复用 DSH 官方及社区插件。OPL 保留 Codex 对话、文件访问授权及 Framework/App 状态桥；第三方插件负责界面与格式呈现，不另建会话、模型、凭据或 Package 管理器。

当前载体包含：

| 插件 | 固定版本与来源 | 使用方式 |
| --- | --- | --- |
| DSH Client Modules | 与 Studio DSH cohort 同步，MIT | 直接使用官方 `createClientModuleSystem` 装载客户端 factory，React 由 Studio 单实例提供 |
| DSH FilesBody | 与 Studio DSH source ref 同步，MIT | 直接复用官方文件树、store 与 face；通过 canonical thread 文件桥浏览与刷新目录 |
| [dsh-file-viewer](https://github.com/liguobao/dsh-file-viewer) | npm 0.3.3，MIT | 使用未修改的浏览器构建及公开 `registerContentProvider`；Markdown、CSV、图片、PDF 等格式由社区插件呈现 |
| [dsh-settings-search](https://github.com/objectivex666/dsh-settings-search) | npm 1.2.0，GPL-3.0 | 使用仅依赖 slots/locale 的本地设置搜索；查询设置页与已渲染选项 |

设置搜索选择 1.2.0 是明确的功能范围选择。核对的 1.9.0 增加独立模型设置、API Key 存储与直连推理；Studio 尚未提供与唯一模型/凭据 owner 一致的适配，因此不装载那些功能。搜索插件本身及许可证随载体保留，未复制改写其实现。

文件查看器 0.3.3 发布包的可选 DSH peer 范围不接纳 `0.1.3-alpha.2` 预发布版本。Studio 没有覆盖 peer 或假称完整 Node 插件兼容：仅从固定 npm 原包提取未经修改的浏览器文件，保留 npm SRI、逐文件 SHA-256、原 package.json 和许可证；不加载其 Host 半部。同步入口为 `node scripts/ecosystem-client-assets.mjs --sync`，无参数执行字节验证。生成文件位于 `packages/opl-studio-ecosystem/dsh-file-viewer`。

`EcosystemFilePreview` 把插件的 `conversation.view` 接到现有文件面板。`ecosystemWorkspaceProvider` 只识别绑定当前 canonical thread 的 `opl-workspace://` locator；实际目录与字节读取仍经原 workspace bridge，复用 cwd、路径和符号链接校验。插件需要的大窗口由适配器拆成最多 512 KiB 的读取，不引入通用任意路径 RPC。原有外部打开及下载继续可用。

加载器使用显式审阅的随包客户端列表。它不自动扫描、安装或激活任意外部 npm 包，也不替代 Framework 管理的 OPL Package 图。后续插件应先核对许可证、真实注入依赖和 owner 边界，再加入载体并验证真实界面。

客户端静态构建从 `ecosystem/` 加载；`plugins/` 路由由 DSH Host 的插件服务占用。Web 复用已有 ClientModuleSystem，Desktop 仅在需要时初始化官方模块运行时。

社区检索也确认 [AKS1st/dock-git](https://github.com/AKS1st/dock-git) 提供 Git 历史、差异、暂存、提交、推送和分支功能，采用 MIT。它依赖 `dock-base` 的工作台布局和另一组 Cordis/React peer，目前保留为可选适配候选，尚未集成或完成 Studio 运行验收。Git 不需要由 OPL 从头开发，但包存在与可直接安装是两个不同结论。

验证覆盖 workspace provider 的二进制窗口、跨任务/越界拒绝、取消、响应一致性与符号链接。整页 WebUI 在隔离工作区确认官方文件树、社区 Markdown/CSV、PNG 图片和单页 PDF 实际渲染，PDF canvas 非空；浏览器下载与源文件逐字节一致。设置搜索完成更新、诊断和字号跳转，聊天文本和图片附件完成模拟 turn。独立 Markdown 样本还验证了脚本未执行。这些是本地源码运行证据，不替代安装包或发布验收。

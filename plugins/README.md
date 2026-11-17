# DSH 插件开发入口

OPL 自有 DSH 插件统一放在这里，每个目录都是标准 npm/DSH 插件包。官方和社区包
从固定 npm 依赖取得；需要适配时在这里建立自己的包并保留上游来源与许可证。

官方实现优先于 OPL 自研。新增、扩展或升级插件前先检查官方同类实现；官方能够覆盖
现有行为时，在同一改动中切换真实调用者、验证并删除旧实现。需要 OPL 数据或权限
适配时只保留薄适配层。暂不能替换的部分须说明具体差异，并在每次 DSH 升级时重审，
不因已经有自研代码而永久保留。相似名称不代表接口、功能与生命周期等价。

| 包 | 职责 |
| --- | --- |
| `opl-codex-native` | 持久 Codex App Server、会话与审批 |
| `opl-dsh-tool-mcp` | DSH 工具到 Codex 的认证 MCP 桥 |
| `opl-framework-bridge` | Framework 状态、动作、通道回调 |
| `opl-host-core` | Desktop/WebUI 共用应用服务 |
| `opl-web-routes` | 认证 HTTP/SSE 路由 |
| `opl-studio-client` | DSH 客户端中的 OPL 界面入口 |

官方 `ui-sidebar-documentpreview` 不是上表的 OPL 自有插件包。当前文件预览实际使用的
固定 DSH cohort UI 源码与 OPL workspace 适配器一起编入产品 Client Plugin，官方 npm
`./client` 不再复制到 `dist/ecosystem/` 形成独立载荷。完整官方插件所需的 Remote、
Resource、Sidebar 与 Session 运行时齐备后，真实调用者才切换到官方 `apply()`。

`dsh-settings-search` 1.14.0 缺少本地搜索 feature-policy hook，既有 SHA-bound 兼容补丁
保留搜索、索引、快捷键与日志，关闭其独立模型与凭据路径。它作为普通 Vite 构建依赖
编入 `opl-studio-client`，不作为另一个 discovery row 或静态客户端加载器。

每个包用 `package.json` 声明名称、版本、描述、许可、DSH 兼容版本和 `exports`。
统一目录为 package.json、src/index.mjs 和生成的 lib/index.mjs；有客户端时增加
客户端源码入口与生成的 lib/client.js。第三方原始资产保存在包内 upstream/。
Host 入口导出 Cordis `apply` 与 `inject`；客户端声明 `dsh.client` 和 `./client`。
不要建立第二种 OPL 专用 DSH manifest。Host 插件启用关系继续由
[`cordis.yml`](../src/host/dsh/cordis.yml) 和
[`web.patch.yml`](../src/host/dsh/web.patch.yml) 按包名装载。官方 `clientModules` 从当前
启用包的 `dsh.client` 声明生成客户端 graph，由官方 `AppWebEntry` 装载与挂载。
Electron 只通过受限桥接读取同一 Host graph 的 index injections 和 `/plugins` 资源。

Host 实现在各包 `src/`；跨插件的协议和工具代码在 `src/host/`。
`npm run build:plugins` 把 Host 本地依赖打入各包 `lib/`，外部 npm 依赖由宿主提供。
客户端产物遵守 DSH ModuleLoader 格式。`npm install` 的 prepare 与 renderer 构建都会
生成 Host 插件及客户端载荷；仅修改源码后跑 Host 测试前也要运行 `build:plugins`。

所有插件统一从 `node_modules/<package-name>` 解析。源码开发使用本地 file 依赖；
Desktop 打包为真实文件，Docker 保留完整插件目录以满足本地依赖链接。可用性用
DSH inventory 和实际 Host 启动验证，不能只靠目录存在。独立包形态不代表当前已在
npm 发布。兼容 Host/Client 包（包括 `opl-studio-client`）可通过原生 profile 独立更新并在
重启后激活；Electron、DSH core/cohort 和小型 boot shell 仍由 App carrier 更新。

本目录不放 Codex 插件市场的领域能力包；微信等由 Framework 托管的能力通过
`opl-framework-bridge` 接入。它们有自己的 ABI，不是 DSH 插件。

## MCP Apps

`opl-mcp-apps` owns the standard MCP Apps host service and client bridge. Its
Host entry injects `oplCodexNative`; its client entry provides `oplMcpAppsClient`
for the Studio composition. Cordis disposes bindings and the React view tears down
AppBridge sessions. Desktop, WebUI and Docker use this same npm package.

The pinned official DSH MCP client supplies tools/resources but no UI host. The
plugin therefore reuses the official ext-apps SDK and canonical Codex transport.
Revisit this gap on every upstream upgrade. Framework owns the host-neutral task
workbench resource; domain packages own research payloads and actions.

## DSH Host Plugin and Framework Package boundary

`opl-studio/plugins/` is the DSH Application Host source set. These standard npm/Cordis packages share the Studio profile, App/Shell release, and cross-plugin tests; they own Host services, Codex transport, client slots, MCP Apps hosting, collaboration, and Web routes.

A Framework Package is a separate delivery unit. Its owner descriptor, native carrier, and Framework projection own installation and callability. It may contribute Settings, Workspace, Task Detail, or an MCP App without becoming a DSH Host plugin. Codex Plugin Manager is one carrier, not a second DSH profile loader.

User entry points remain Software Center, Settings, App Workspace, Task Detail, and Runtime Maintenance. Repository, Package role, and carrier choices affect development and operations, not the user entry point.

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">OPL Studio</h1>

<p align="center"><strong>One Person Lab 的第一方 Codex 原生应用宿主</strong></p>
<p align="center">基于 DeepSeek Harness/Cordis，在同一工作台中统一承载持久对话、OPL Packages、项目进度、文件与结果以及运行管理。</p>

<p align="center">
  <a href="https://github.com/gaofeng21cn/opl-studio/releases/latest"><strong>下载最新版预览版</strong></a>
  · <a href="./docs/README.md">文档</a>
  · <a href="./docs/architecture.md">架构</a>
  · <a href="./docs/verification.md">验证边界</a>
</p>

<!--
Owner: `one-person-lab-app`
Purpose: `public_native_product_entry`
State: `public_preview_release_active_active_shell_adoption_separate`
Machine boundary: Human-readable Studio entry. App product and adoption truth stays in one-person-lab-app contracts; runtime and Package truth stays in OPL Framework; domain truth stays with domain owners. A public Preview does not by itself adopt Studio as the Stable App shell or establish production readiness.
-->

## 项目定位

OPL Studio 是 One Person Lab 面向下一代体验打造的第一方应用宿主。它把持久化
Codex 后端、OPL App 产品模型、由 OPL Framework 管理的运行时和软件包投影，
以及桌面端与 WebUI 共用的渲染器整合在一个工作台中。

Studio 固定使用 DeepSeek Harness（DSH）`v0.1.1-rc.2` 的应用骨架和配套 GUI
源码。DSH 提供 Cordis 应用宿主、插件生命周期、布局系统、基础 UI 组件和交互
能力；OPL 提供产品身份、Codex 集成、Framework 桥接层、产品策略和第一方插件。

本仓库不是第二套 OPL Framework。整体产品边界仍然是：

```text
OPL Base        运行时和软件包的权威来源
OPL App         产品、界面合同、采用和发布的权威来源
OPL Studio      应用宿主、Codex 后端、渲染器和插件宿主
OPL Packages    专业智能体、技能、工具、插件和工作流
OPL Cloud       可选的在线工作区和托管服务
```

## 预览版分发

当前公开预览版面向 **macOS arm64**，可从
[最新 GitHub 发布页](https://github.com/gaofeng21cn/opl-studio/releases/latest)
下载安装。应用已经完成开发者签名和 Apple 公证，并把公证票据附加到安装包；
同时使用预览版专用的自动更新源。其应用标识符为
`cn.onepersonlab.opl.studio.preview`，不会替换正式版
`One Person Lab.app`。

同一发布版本提供两种载荷规格：

| 安装包 | 适用场景 | 载荷 |
| --- | --- | --- |
| **Standard** | 升级，或联网首次安装 | 体积较小；首次启动时另行准备与版本严格匹配的 OPL Base 运行时 |
| **Full** | 推荐用于首次预览版内测 | 内置与版本严格匹配的 OPL 运行时，减少首次启动时的依赖下载 |

Standard 和 Full 是同一版本的两种载荷规格，不是两个产品版本，也不是两条
更新通道。Full 不内置 Codex；Studio 会按照 App 管理的启动与验收合同，定位
与版本严格匹配的外部 Codex 可执行程序。

> **预览版边界：**公开安装包用于预览版内测。只有 App 负责人完成独立的纯净
> 虚拟机验收、功能等价验证和采用门禁后，Studio 才能成为正式版 OPL App 的
> 应用外壳。在完成切换之前，AionUI 仍是当前正式版的应用外壳。

Windows、Linux、独立 WebUI 服务和 Docker/OCI 已有开发候选实现与测试路径，
但目前不是公开分发目标。只有未来的发布版本明确提供并验收对应产物时，才能
把它们视为已发布平台。

## 核心能力

- 持久保存 Codex 对话线程、执行轮次、审批、流式事件和历史记录。
- 项目与对话目录直接使用 Codex App Server 的规范线程接口，不复制一套本地
  对话存储。
- 根据 App 与 Framework 提供的投影动态发现 OPL 智能体与能力，不维护写死的
  软件包品牌名单。
- 通过按需任务详情面板查看项目进度、文件与结果、智能体与能力。
- 提供 App 管理的设置、Gateway 账号、模型选择、权限控制、运行状态和更新状态。
- 通过经过认证的本机回环 MCP 桥接，将 DSH 原生工具插件提供给 Codex。
- Electron 和独立 WebUI 候选版共用同一个渲染器和宿主合同。

## 架构

```text
Electron / WebUI 渲染器
        |
        v
OPL Studio DSH/Cordis 应用宿主
        |-- opl-codex-native ------> 持久化 Codex App Server
        |-- opl-dsh-tool-mcp ------> DSH 工具插件
        |-- opl-framework-bridge --> OPL App 状态与操作合同
        `-- opl-web-routes --------> HTTP/SSE WebUI 传输层
                                         |
                                         v
                                OPL Framework 宿主
                              运行时和软件包的权威来源
```

Studio 使用独立的 DSH 配置 `opl-studio`，但明确不加载 `dsh-base`，因此不会
引入第二套 DSH 会话存储、LLM 及模型提供方路由、智能体循环或凭据管理权。
`opl-codex-native` 是 Studio 内持久化 Codex App Server、规范线程与执行轮次、
审批和实时执行事件的唯一负责人。

`opl-framework-bridge` 只使用 App 与 Framework 公开的状态、操作、认证和通道
回调合同。运行时当前状态判定、软件包发现、安装和软件包状态仍由 Framework
负责。

| 事项 | 权威来源 |
| --- | --- |
| 产品行为、模型策略、GUI ABI、采用和发布 | [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app) 的合同和工作流 |
| Studio 宿主、DSH 配置、渲染器、插件生命周期和 Codex 集成 | 本仓库 |
| 运行时和软件包关系图 | [`one-person-lab`](https://github.com/gaofeng21cn/one-person-lab) / OPL Framework |
| 线程标识、历史记录、审批和执行轮次 | 由 `opl-codex-native` 管理的 Codex App Server |
| 专业质量、产物和交付决策 | 对应的 OPL 软件包或专业领域负责人 |

完整边界参见[实现与权威架构](./docs/architecture.md)。

## 本地开发

安装依赖并启动 Electron 桌面端开发环境：

```bash
npm ci
npm run dev:desktop
```

启动独立 WebUI 候选版，默认地址为 `http://127.0.0.1:4178`：

```bash
npm run dev
```

如需由 App 管理预览版的启动和运行环境注入，请在相邻的
`one-person-lab-app` 仓库执行：

```bash
npm run gui -- --shell opl-studio
npm run gui -- --shell opl-studio --rebuild
npm run gui -- --shell opl-studio --allow-actions
```

App 管理的入口负责提供产品配置和外部运行时输入。直接打开本地构建的应用包
适合开发调试，但不等同于 App 管理的启动或发布验收路径。直接运行桌面端或
WebUI 时，如果 `PATH` 中无法找到对应的 `codex` 和 `opl`
可执行文件，需要显式设置 `OPL_CODEX_BIN` 和 `OPL_APP_OPL_BIN`。

### 无界面服务与 Docker 候选版

构建并运行独立 Node.js 宿主：

```bash
npm run build:webui
npm run start:headless
```

构建本地 Docker 候选镜像：

```bash
docker compose up --build
```

这两个入口默认只绑定本机回环地址。不要把当前 HTTP/SSE 接口暴露到不可信
网络，因为候选版尚未定义公开远程访问的安全边界。各载体的准确状态参见
[OCI 分发](./docs/oci-distribution.md)和
[桌面端分发](./docs/delivery/desktop-distribution.md)。

## DSH 上游维护

DSH 源码版本、依赖版本组、纳入仓库的 GUI 源码目录和文件清单统一记录在
[`deepseekHarnessSourceManifest.json`](./src/composition/deepseekHarnessSourceManifest.json)
中。Studio 通过可审计的显式重放方式追随上游，而不是维护隐式分叉。

读取当前绑定状态并生成不写入文件的升级计划：

```bash
npm run dsh:status
npm run dsh:preflight -- --source /absolute/path/to/clean/deepseek-harness
```

升级时必须同步更新清单和依赖版本组，重新同步清单声明的 GUI 源码目录，重放
Studio 配置和覆盖层，并通过宿主、渲染器与候选版的专项验证。仅完成依赖安装
或确认 GUI 源码字节一致，不能证明宿主与插件兼容。

## 验证

运行仓库源码验证：

```bash
npm test
```

`npm test` 覆盖静态类型检查、桌面端/无界面服务/OCI 合同、DSH 宿主与 MCP
桥接、线程和工作区服务、产品投影、客户端 Cordis 组合以及候选版不变量，但
不会构建或认证公开发布版本。

如需从已经提交且 Git 工作区干净的 Studio 代码检出目录，生成由 App 合同驱动
的本地载体验证证据：

```bash
OPL_APP_REPO_ROOT=/absolute/path/to/one-person-lab-app npm run package
```

该命令生成 Electron、独立 WebUI 和 Docker 的本地候选验证证据。签名、公证、
公开发布、纯净虚拟机验收和正式 App 采用仍属于 App 负责人管理的发布操作。
解释测试或打包结果前，请先阅读
[验证与证据边界](./docs/verification.md)。

## 文档

- [文档与负责人导航](./docs/README.md)
- [实现与权威架构](./docs/architecture.md)
- [架构白皮书](./docs/whitepaper.md)
- [当前状态与剩余缺口](./docs/active/current-state-vs-ideal-gap.md)
- [验证与证据边界](./docs/verification.md)
- [桌面端分发](./docs/delivery/desktop-distribution.md)
- [历史候选基线](./docs/history/README.md)

## 许可证

OPL Studio 使用 [Apache License 2.0](./LICENSE)。随仓库引入和运行时使用的
第三方组件保留各自许可证，详见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">OPL Studio</h1>

<p align="center"><strong>One Person Lab 第一方、Codex 原生的应用宿主</strong></p>
<p align="center">基于 DeepSeek Harness/Cordis，统一承载持久对话、OPL Packages、项目进度、文件与结果以及运行状态。</p>

<p align="center">
  <a href="https://github.com/gaofeng21cn/opl-studio/releases/latest"><strong>下载最新版 Preview</strong></a>
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

OPL Studio 是 One Person Lab 第一方的下一代应用宿主。它在同一个工作台中
整合持久化 Codex 后端、OPL App 产品模型、由 Framework 管理的运行时与
Package 投影，以及 Desktop/WebUI 共用的渲染器。

Studio 基于固定版本的 DeepSeek Harness（DSH）`v0.1.1-rc.2` 应用骨架和
GUI 源码版本组构建。DSH 提供 Cordis 应用宿主、插件生命周期、布局系统、
基础 UI 组件和交互能力；OPL 提供产品身份、Codex 集成、Framework 桥接层、
产品策略和第一方插件。

本仓库不是第二套 OPL Framework。整体产品边界仍然是：

```text
OPL Base        运行时与 Package 权威
OPL App         产品、GUI 合同、采用与发布权威
OPL Studio      Application Host、Codex 后端、渲染器与插件宿主
OPL Packages    专业 Agents、Skills、Tools、Plugins 与 Workflows
OPL Cloud       可选的在线 Workspace 与托管服务
```

## Preview 分发

当前公开 Preview 通过
[最新版 GitHub Release](https://github.com/gaofeng21cn/opl-studio/releases/latest)
提供 **macOS arm64** 安装包。应用已经完成签名、公证和 stapling，并使用独立
Preview 自动更新源。其 bundle identifier 为
`cn.onepersonlab.opl.studio.preview`，不会替换正式版
`One Person Lab.app`。

同一个 Release 包含两种载荷密度：

| 安装包 | 适用场景 | 载荷 |
| --- | --- | --- |
| **Standard** | 升级，或网络条件良好的首次安装 | 体积较小；首启流程单独准备精确的 OPL Base 运行时 |
| **Full** | 推荐用于首次 Preview 内测 | 内含精确的 OPL 运行时载荷，减少首启依赖下载 |

Standard 和 Full 是同一版本的两种载荷，不是两个产品版本，也不是两条更新
通道。Full 不内置 Codex；Studio 仍通过 App 管理的启动与验收合同解析精确的
外部 Codex 运行载体。

> **Preview 边界：**公开安装包用于内部评估。只有 App owner 完成独立的
> clean-VM、功能等价和采用门禁后，Studio 才能成为正式 OPL App Shell。
> 在完成切换之前，AionUI 仍是当前正式版 App Shell。

Windows、Linux、独立 Headless WebUI 和 Docker/OCI 已有开发候选实现与测试
路径，但目前不是公开 Studio 分发目标。只有未来 Release 明确提供并验收对应
产物时，才能把它们视为已发布平台。

## 核心能力

- 持久化 Codex threads、turns、审批、流式事件和历史记录。
- 项目与对话目录直接使用 Codex App Server 的 canonical thread API，而不是
  复制一套 Native 对话存储。
- 从 App/Framework 投影动态发现 OPL Agents 与能力，不维护写死的 Package
  品牌名单。
- 通过按需任务详情面板查看项目进度、文件与结果、智能体与能力。
- 提供 App 管理的设置、Gateway 账号、模型选择、权限控制、运行状态和更新状态。
- 通过认证的 loopback MCP bridge，把 DSH 原生工具插件提供给 Codex。
- Electron 和 Standalone WebUI candidate 共用同一个渲染器与 Host 合同。

## 架构

```text
Electron / WebUI renderer
        |
        v
OPL Studio DSH/Cordis Application Host
        |-- opl-codex-native ------> persistent Codex App Server
        |-- opl-dsh-tool-mcp ------> DSH tool plugins
        |-- opl-framework-bridge --> OPL App state/action contracts
        `-- opl-web-routes --------> HTTP/SSE WebUI transport
                                         |
                                         v
                                OPL Framework Host
                              运行时与 Package 权威
```

Studio 启动独立的 `opl-studio` DSH profile，但明确不加载 `dsh-base`，因此不会
引入第二套 DSH session store、LLM/provider router、Agent loop 或凭据权威。
`opl-codex-native` 是 Studio 内持久 Codex App Server、canonical threads/turns、
审批和实时 turn events 的唯一 owner。

`opl-framework-bridge` 只消费 App/Framework 公开的 state、action、认证和 channel
callback 合同。运行时 currentness、Package 发现、安装和 Package 状态仍由
Framework 负责。

| 事项 | 权威来源 |
| --- | --- |
| 产品行为、模型策略、GUI ABI、采用与发布 | [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app) 的合同和 workflows |
| Studio Host、DSH profile、渲染器、插件生命周期与 Codex 集成 | 本仓库 |
| 运行时和 Package graph | [`one-person-lab`](https://github.com/gaofeng21cn/one-person-lab) / OPL Framework |
| Thread 身份、历史、审批和 turns | 通过 `opl-codex-native` 管理的 Codex App Server |
| 专业质量、产物和交付决策 | 对应 OPL Package 或专业领域 owner |

完整边界见[实现与权威架构](./docs/architecture.md)。

## 本地开发

安装依赖并启动 Electron 开发 carrier：

```bash
npm ci
npm run dev:desktop
```

启动 Standalone WebUI candidate，默认地址为 `http://127.0.0.1:4178`：

```bash
npm run dev
```

如需使用 App 管理的 Preview 启动和环境注入，请在相邻的
`one-person-lab-app` 仓库执行：

```bash
npm run gui -- --shell opl-studio
npm run gui -- --shell opl-studio --rebuild
npm run gui -- --shell opl-studio --allow-actions
```

App 管理的入口负责提供产品 profile 和外部运行时输入。直接打开本地构建的
bundle 适合开发调试，但不等同于 App 管理的启动或发布验收路径。
直接运行 Desktop 或 WebUI 时，如果 `PATH` 中无法找到对应的 `codex` 和 `opl`
可执行文件，需要显式设置 `OPL_CODEX_BIN` 和 `OPL_APP_OPL_BIN`。

### Headless 与 Docker Candidates

构建并运行 Standalone Node Host：

```bash
npm run build:webui
npm run start:headless
```

构建本地 Docker candidate：

```bash
docker compose up --build
```

这两个入口都默认只绑定 loopback。不要把当前 HTTP/SSE bridge 暴露到不可信
网络，因为当前 candidate 尚未定义公开远程访问的安全边界。各 carrier 的精确
状态见 [OCI 分发](./docs/oci-distribution.md)和
[Desktop 分发](./docs/delivery/desktop-distribution.md)。

## DSH 上游维护

DSH 源码 ref、package cohort、vendored GUI roots 和文件清单统一固定在
[`deepseekHarnessSourceManifest.json`](./src/composition/deepseekHarnessSourceManifest.json)
中。Studio 通过显式 replay 追随上游，而不是维护一份无法审计的隐式 fork。

读取当前绑定并生成无写入的升级计划：

```bash
npm run dsh:status
npm run dsh:preflight -- --source /absolute/path/to/clean/deepseek-harness
```

升级时必须同步更新 manifest 与依赖 cohort，重新 vendor 声明的 GUI source
roots，重放 Studio profile 和 overlays，并通过 Host、renderer 与 candidate 的
聚焦门禁。仅完成依赖安装或 GUI 字节一致性，不能证明 Host/plugin 兼容。

## 验证

运行仓库 source gate：

```bash
npm test
```

`npm test` 覆盖 typecheck、Desktop/headless/OCI 合同、DSH Host 与 MCP bridge、
thread 和 workspace services、产品投影、Client Cordis composition 以及 candidate
不变量，但不会构建或认证公开 Release。

如需从 committed、tracked-clean 的 Studio checkout 生成由 App 合同驱动的本地
carrier evidence：

```bash
OPL_APP_REPO_ROOT=/absolute/path/to/one-person-lab-app npm run package
```

该命令生成 Electron、Standalone WebUI 和 Docker 的本地 candidate evidence。
签名、公证、公开发布、clean-VM 验收和正式 App 采用仍属于 App owner 管理的发布
操作。解释测试或 package 结果前，请先阅读
[验证与证据边界](./docs/verification.md)。

## 文档

- [文档与 owner 导航](./docs/README.md)
- [实现与权威架构](./docs/architecture.md)
- [架构白皮书](./docs/whitepaper.md)
- [当前状态与剩余缺口](./docs/active/current-state-vs-ideal-gap.md)
- [验证与证据边界](./docs/verification.md)
- [Desktop 分发](./docs/delivery/desktop-distribution.md)
- [历史 candidate baseline](./docs/history/README.md)

## 许可证

OPL Studio 使用 [Apache License 2.0](./LICENSE)。Vendored 和 runtime 第三方
组件保留各自许可证，详见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

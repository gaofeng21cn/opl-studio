# Studio 设置页投影实现

本文解释 Studio 如何消费 App 产品合同。App 持有页面语义；Framework 提供
Package 安装状态、原生载体与 App 使用偏好。Studio 通过既有 state/action bridge
展示和操作，不维护第二套安装目录或生命周期。

## 统一软件中心

一级“软件中心”与主对话并行，日常分区为“软件、更新”。软件源与运行组件从管理入口进入。
它管理本机独立软件；云端、移动端和设备端产品只作为部署协助与状态目标。
设置中的“能力配置”保留原生 Skills、MCP 和连接配置，并提供软件中心跳转。
旧智能体设置深链与“更新与修复”设置入口同样转入软件中心，不再重复软件清单或生命周期控件。
目录以独立软件为对象，按 owner 声明的 `software_type` 分为应用、智能体、能力包；
非标准智能体同样属于智能体，未知类型单独显示“类型待确认”。技术 `package_role`
只在详情解释，不替代产品类型。`catalog_scope=host_component` 的宿主组件可切换
查看；缺少 scope 的旧投影显示“分类待确认”，不自动计入软件总数。概念仓、源码
开发依赖和个人数据不因出现在仓库清单中就成为目录软件。

列表保留 DSH Plugin Manager 的官方列表、详情、导航与控件；OPL 的描述插槽展示
正式名称、稳定 ID、用途、本机版本与来源版本。产品成熟度只接受 owner 声明，
`development_only`、固定源码分发、`0.x` 版本都不能推导成“预览版”。
正式 Package 使用不可变 OCI 制品；原生应用与 CLI 复用正式安装器。
源码 checkout 仅作为用户显式接入的开发实例，不是普通安装、修复或更新来源。

Package 来自 Framework 目录，原生分发选项来自软件源 `native_items`；本机基座安装由
根 `installed_products` 独立投影，未安装 Homebrew 时仍可读取。产品按 `product_id`
去重；Stable/Nightly 是发布轨道，Standard/Full 是安装规格，均不是额外的软件或安装。
`selected_for_product` 由 Framework 指定当前更新来源，`recommended_for_product` 标明
发布者默认推荐。Studio 不按名称长度、版本大小或配方顺序选择更新目标；主列表显示
一个精确可用版本，目标缺失时用“—”，具体原因在详情解释。外部 Codex 插件未公开版本
目标时，详情明确由 Codex 维护。

详情依次展示“当前使用”“本机安装”和“获取其他版本”。`installations` 是实际安装
投影，每份包含稳定安装身份、版本、发布或开发模式、管理器和真实绝对路径。
`active_installation_id` 与 `active_installation_status` 决定当前使用的唯一实例；
未激活、未知和冲突分别显示，不选择最高版本冒充激活状态。OPL 软件中心不会扫描
源码目录并自动启用开发版。开发实例只提供 owner 声明的检查、激活、停用和解除接入；
源码更新继续由开发工具负责，解除接入保留源码和数据。

实例动作只能消费 owner 投影，执行前核对精确 `installation_id`、`expected_revision`
及必需 payload，之后沿既有 App state/action 链路回读。安装选项和已装实例分别显示；
缺少 Homebrew 收据不能将有效 Framework runtime 或 App bundle 显示为未安装。
旧版 `local_installations` 只作为兼容读面，不能反推完整路径或激活选择。
尚无本机安装时，`installation_actions` 可提供“安装发布版”，绑定软件 ID、版本和
当前修订号；创建安装时不伪造实例 ID。集成组件已经安装也不会隐藏此入口。

原生受管安装与 Package 共用“更新”清单。安装 owner 提供的更新目标、状态和精确
实例动作优先于安装渠道；Homebrew 收据仍由 Homebrew 维护。Framework 受管安装
不转入合并的 OPL Base 操作。更新暂存后显示“需要重启”，当前使用版本在实际激活
前保持不变。公共源的 `catalog_refresh_required` 与访问、目录刷新要求共用现有 Host
检查链路：仅执行 owner 允许且不需确认的 `source_check`，随后回读一次，不递归重试。
安装模式分别显示“安装版”和“开发版”；是否来自正式发布制品由来源证据说明。
软件中心的更新页默认呈现这份软件清单；当前桌面宿主和 OPL Base 综合维护收进
“桌面宿主与运行组件维护”，保留原有动作。开发宿主版本不作为 OPL App 安装版本
并列展示。Settings 中的维护页继续保留完整控制视图。
未打包的 Electron 宿主不投影 App 版本，维护详情和“关于”显示“开发预览／未发布”；
已打包的签名本地构建继续显示真实 App 版本及开发构建身份。

原生软件优先显示 owner 提供的 `installed_display_version` 和
`available_display_version`；机器版本、构建 ID、配方版本和收据放在对应详情，保留
原更新器的判断。开发类型采用明确 `mode=development` 或
`installed_build_kind=local-development`，不从版本大小推断。

搜索与状态筛选共用目录；软件源页展示渠道级记录。“更新”页复用当前管理者的
动作，Framework 的受管安装从详情进入既有更新页。普通刷新按 owner 的
`access_refresh_required` / `inventory_refresh_required` 调用 `source_check` 后回读，
不会把本机清单检查变成 `brew update`。
只有已回读的条目进入统计；缺少目录、首次加载或读取失败不显示虚假的零条目或
健康状态。共享资源过期或授权失效计入页眉，并保留最近一次回读时间。读取失败时
保留已有信息，用户可重试；变更按钮等当前状态重新确认后恢复。

每项展示版本、发布者、安装状态及来源。可用动作来自该包投影的
`available_actions`，通过 App action 执行。自定义安装仍消费作者提供的
manifest URL 与 trust tier，复用原有安装通道。

安装不意味着必须在 OPL App 中使用。`app_enabled` 单独控制 OPL App 的页面、
新任务入口、命令与状态读取，默认启用。`package_app_set_enabled` 保存此偏好；
关闭后安装、原生平台启用状态、Codex Skills 和 MCP 能力保持原状。目录始终
保留已关闭的包，可筛选并重新启用。已有页面在贡献被撤销时退出到聊天。

## 软件图标与运行组件

软件图标来自 Framework 的 `icon_url`，由 owner 依据发布载荷和精确提交生成。
公开资产仅接受不可变 GitHub raw URL；私有资产不尝试匿名请求。缺图、离线或加载失败
使用 App 资产清单生成的本地 PNG 投影，缺失时使用中性 PNG 占位。产品清单、授权与版本仍来自 Framework。

“运行组件”接收 `management_scope=local_component` 与既有
`managed_update.components[].current.dependency_catalog.dependencies`。组件详情保留
版本、位置、所属产品和维护方，维护入口复用软件中心的更新页。不扫描全机工具目录，
也不将未被 owner 声明的 Python、uv 等自动纳入。Host 压缩层只传递必要字段。

## 共用资源的配置

“设置 → 资料与连接”集中提供资料库和业务账号两组。模型、基础能力与运行组件使用各自既有入口。知识来源
可直接连接已有 Obsidian / Markdown 资料夹，选择读取和维护权限；操作经过
Framework action 与版本校验，成功后重新读取。正文与资料位置不进入共享投影，
资料仍在原处维护。多项目精细授权由来源管理者调整，扁平表单不能扩大其权限。

账号与连接复用设置页的 `ConnectionsSection`，提供已连接账户、待授权请求、
授予权限、撤销、使用记录和已有 Relay 邮箱接入。邮箱选项来自 owner 实际发现，
连接安全版本兼容 UUID。软件源账号从此处跳转到软件中心的“软件源”，不重复建立凭据页；
模型访问继续复用既有账户与模型设置。

软件源“账户已连接”仅表示身份已连接，安装权限逐项判断。Homebrew 版本来自
本机配方，界面区分已安装版本与来源版本；未由 Homebrew 管理不否定其他方式的
安装。检查本机、启用 tap、刷新目录、安装、更新与卸载由对应 owner 执行；版本
未知不伪称最新。失败或部分完成仍回读清单，避免退出码为零被误报为完成。

## 状态按包归属

| 用户任务 | 位置 | 数据与动作归口 |
| --- | --- | --- |
| 登录 Gateway、切换账户或 API Key | 账户与访问 | App settings read model 与 action |
| 查看包安装、版本、升级或 App 开关 | 软件中心的软件详情 | Framework Package 投影与 action |
| 绑定微信、消息通道或远端设备 | 设置 → 连接与部署 → 资料与连接 → 远程访问 | 动态 `channel_access`、`remote_companion_access` 与原生 OPL Link |
| 查看插件状态和配置 | 设置 → 能力配置 → 扩展设置 | 当前启用插件的 `settings.section` typed contribution |
| 查看 Skills、原生插件及连接能力 | 软件中心的其他来源；能力设置保留配置 | Codex App Server capability catalog |
| 查看任务服务、执行进程和定时服务 | 服务状态 | Framework runtime projection |
| 查看磁盘用量及清理动作 | 数据与存储 | Framework storage lifecycle |

远程通道和伴侣连接按功能语义放在设置，不以安装器或软件分类决定可见性。设置页打开且 `app_enabled=true` 时读取远程贡献；无提供者时保留配置引导。其他配置统一按插件分组呈现在能力设置，折叠时不挂载、不读取；软件和运行组件使用同一路径。`activity_log` 只在用户启用技术详情后于相应扩展设置组呈现。软件中心只提供同一设置页的直达入口。新包依 descriptor 接入，不增加固定包名单或专用状态页。

Package 适配器的安装不证明独立桌面 App 的安装或进程状态。例如 Fleet 或 iPhone
Steward 的 contribution 只展示领域 owner 明确提供的事实，不能替代其独立 App
的生命周期。

## 实现入口

`plugins/opl-studio-client/src/client/workbench/settings/packages.tsx` 复用目录与生命周期操作；
`plugins/opl-studio-client/src/client/composition/contributionProjection.ts` 消费 App 使用偏好并过滤贡献；
`plugins/opl-studio-client/src/client/workbench/App.tsx` 将包详情懒渲染及动作接入既有 bridge。
`settings.section` 由 DSH root 唯一声明；设置页与软件中心共用该 owner 的 renderer，
避免重复声明或从其他插槽跨越 DSH 的渲染归属边界。

设置搜索、外观与字号继续复用现有 DSH 客户端能力，来源见[生态客户端](ecosystem-client-plugins.md)。
源码实现与本地渲染不等于已发布或已安装的 App 版本。

## 连续使用

软件中心的主要分区为软件、更新。软件源和运行组件经管理入口进入。已安装且 owner 允许使用的软件提供“开始使用”，导航到同一产品声明的任务或 MiniApp，业务操作仍通过原有任务/界面执行。安装、配置过程中保留产品上下文，fresh 回读后提供“继续使用”。

软件中心的资料与账户授权入口跳转到设置；ConnectionsSection 仅在“设置 → 资料与连接”实例化。知识接入复用桌面目录选择器，WebUI 只接受服务端资料库位置，不把上传目录当资料源。Framework 提供知识范围选项与明确默认值，授权仍经原 revision/confirmation 合同。

需要用户介入的事项按明确 source/resource identity 合并并列出受影响的软件；独立安装冲突单独保留。未检查、未使用的可选资源和普通更新不制造失败告警。当前安装首先显示，其他安装与发行选项折叠；位置回读与操作仍来自 owner。

图标来自 App 的 `contracts/software-artwork-assets.json` 资产清单，由 renderer build 校验 PNG 与 digest 并生成 `softwareArtwork.generated.ts`。该文件只投影离线资产，不参与软件纳管、版本或授权判定。缺图不使用首字母或 SVG 字母拼接。

安装与更新任务共用页头、软件行和窗口级入口的阶段文案。页头显示单一主状态、受影响
软件数及上次读取时间；更新作为普通待办，未知状态不能显示为健康。确认页使用目录正式
名称与来源说明，版本、大小和路径仍来自实际预检查。下载 ETA 在一分钟内按秒显示，
校验、解压与结果检查只显示阶段。离开软件中心后仍观察 Framework 后台任务；失败读取
隐藏过期进度，中断结果先检查。完成记录的“开始使用”受最新 Package 调用状态约束。

## 功能与交付边界

插件的仓库、安装器与软件／运行组件分类不决定使用入口。消息与远程连接进入连接设置，
服务状态和启用后的技术诊断进入服务状态页。业务列表、审阅、任务板及产物由同一个
标准 MCP App 工作台承载；移除并行“模块视图”模式。旧能力配置页提供“打开应用工作台”，
软件详情按功能链接到连接设置或服务状态，不把业务视图再放回“扩展设置”。

共享 OPL Apps 从安装描述动态提供业务视图，专用 MiniApp 复用同一个切换器、权限、
回读与返回路径。原生 DSH 客户端插件继续通过公开 slots 和 Settings 组合 App。

## 高级模型选项

“账户与模型 → 模型与执行”在“默认模型”之后提供默认折叠的“高级模型选项”。
“启用自定义模型”默认关闭，复用 App 本地设置持久化；它不依赖“技术详情”，也不放入
运行维护或通用偏好。中英文搜索可以展开并聚焦开关。普通模型菜单保持原有层级。

关闭时，固定选择使用 App 内置官方列表与实时目录的交集；开启后加入本机目录中
可见的自定义模型，保留官方标签与顺序。开关和自定义选择解释标准智能体的行为差异。
Auto 始终使用 App 模型策略，目录扩展不回写 App 合同、本机目录或凭据。关闭开关后
保留已固定的自定义选择和草稿，使用 DSH InputBar 的原生 blocked 状态禁用发送，
模型选择入口继续可用；发送处理函数同时拒绝无有效模型的请求。
## 资料与连接的唯一管理面

资料库、业务账号与逐应用授权在“设置 → 资料与连接”配置。软件中心只显示资料与账户是否可用、缺失授权和影响范围，并携带软件与来源焦点导航到设置；旧 `/apps?section=resources` 深链兼容跳转，不再挂载配置表单。

App 静态定义目的地，资源 owner 或插件声明读取、动作和已批准的 view type；Framework 验证并投影，Studio 使用统一设置容器组合。Profile/Workspace 知识来源不要求插件化。远程通道、OPL Link 和网页访问在同一连接设置中的独立分组，模型与运行依赖保留各自入口。

资料库优先显示可读名称、授权应用和可用／待复核条目数。名称由原来源 registry 保存，使用精确 revision 改名。应用按 Package 身份归组展示，各 domain 的读取和维护权限独立保留；内部标识、检查、断开与历史按需展开。

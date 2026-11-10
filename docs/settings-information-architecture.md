# Studio 设置页投影实现

本文解释 Studio 如何消费 App 产品合同。App 持有页面语义；Framework 提供
Package 安装状态、原生载体与 App 使用偏好。Studio 通过既有 state/action bridge
展示和操作，不维护第二套安装目录或生命周期。

## 统一应用管理

一级“应用管理”与主对话并行，分为“软件目录、更新、共享资源、软件源”。
目录以独立软件为对象，按 owner 声明的 `software_type` 分为应用、智能体、能力包；
非标准智能体同样属于智能体，未知类型单独显示“类型待确认”。技术 `package_role`
只在详情解释，不替代产品类型。`catalog_scope=host_component` 的宿主组件可切换
查看；缺少 scope 的旧投影显示“分类待确认”，不自动计入软件总数。概念仓、源码
开发依赖和个人数据不因出现在仓库清单中就成为目录软件。

列表保留 DSH Plugin Manager 的官方列表、详情、导航与控件；OPL 的描述插槽展示
正式名称、稳定 ID、用途、本机版本与来源版本。产品成熟度只接受 owner 声明，
`development_only`、固定源码分发、`0.x` 版本都不能推导成“预览版”。
软件源的发行包或固定源码版本在详情显示，来源版本不称为“最新版本”。

Package 来自 Framework 目录，原生分发渠道来自软件源 `native_items`；本机基座安装由根 `installed_products` 独立投影，未安装 Homebrew 或尚未检查软件源时也可读取。原生产品按
`product_id` 去重；同一 App 的 Standard、Full、Nightly 配方在详情列为安装渠道，
不重复计算软件数。详情采用 owner 的 `product_display_name` 与安装身份，各渠道
仍保留原配方名、来源版本和 Homebrew 安装记录。

软件版本与安装实例分开读取。`installed` 是当前 Package carrier 的安装状态；未发现该 carrier 时只表述“未在此宿主安装”，不推断整台机器不存在此软件。
`local_installations` 可补充已验证的独立安装或开发接入，保留各自版本、管理者和
位置引用。开发接入单独计数，不能计成安装版。插件管理操作只作用于当前宿主副本，
不能卸载或更新由 uv 或软件自身管理的实例。原生软件的 `installed_version` 来自
实际检测，`homebrew_installed` 与 `homebrew_installed_version` 只代表渠道收据；
OPL 受管运行时和 App bundle 已存在时，不能因 Brew 无记录而标成未安装。

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

## 共用资源的配置

“共享资源”集中提供知识与记忆、账号与连接、模型能力、基础依赖四组。知识来源
可直接连接已有 Obsidian / Markdown 资料夹，选择读取和维护权限；操作经过
Framework action 与版本校验，成功后重新读取。正文与资料位置不进入共享投影，
资料仍在原处维护。多项目精细授权由来源管理者调整，扁平表单不能扩大其权限。

账号与连接复用设置页的 `ConnectionsSection`，提供已连接账户、待授权请求、
授予权限、撤销、使用记录和已有 Relay 邮箱接入。邮箱选项来自 owner 实际发现，
连接安全版本兼容 UUID。软件源账号从此处进入同级“软件源”，不重复建立凭据页；
模型访问继续复用既有账户与模型设置。

软件源“账户已连接”仅表示身份已连接，安装权限逐项判断。Homebrew 版本来自
本机配方，界面区分已安装版本与来源版本；未由 Homebrew 管理不否定其他方式的
安装。检查本机、启用 tap、刷新目录、安装、更新与卸载由对应 owner 执行；版本
未知不伪称最新。失败或部分完成仍回读清单，避免退出码为零被误报为完成。

## 状态按包归属

| 用户任务 | 位置 | 数据与动作归口 |
| --- | --- | --- |
| 登录 Gateway、切换账户或 API Key | 账户与访问 | App settings read model 与 action |
| 查看包安装、版本、升级或 App 开关 | 扩展与应用的包详情 | Framework Package 投影与 action |
| 查看包服务状态、绑定微信或远端设备 | 同一包的展开详情 | 包声明的 `settings.section` typed contribution |
| 查看 Skills、原生插件及连接能力 | 扩展与应用内的能力目录 | Codex App Server capability catalog |
| 查看任务服务、执行进程和定时服务 | 服务状态 | Framework runtime projection |
| 查看磁盘用量及清理动作 | 数据与存储 | Framework storage lifecycle |

包详情关闭时不挂载贡献视图；展开且 `app_enabled=true` 才开始读取。包状态不再
自动堆在服务状态或资源与连接页。`channel_access`、`remote_companion_access`、
`service_status` 和其他已准入类型均按 Package 分组；`activity_log` 仍不是普通
设置页入口。新包依 descriptor 接入，不增加固定包名单或专用状态页。

Package 适配器的安装不证明独立桌面 App 的安装或进程状态。例如 Fleet 或 iPhone
Steward 的 contribution 只展示领域 owner 明确提供的事实，不能替代其独立 App
的生命周期。

## 实现入口

`src/workbench/settings/packages.tsx` 复用目录与生命周期操作；
`src/composition/contributionProjection.ts` 消费 App 使用偏好并过滤贡献；
`src/workbench/App.tsx` 将包详情懒渲染及动作接入既有 bridge。

设置搜索、外观与字号继续复用现有 DSH 客户端能力，来源见[生态客户端](ecosystem-client-plugins.md)。
源码实现与本地渲染不等于已发布或已安装的 App 版本。

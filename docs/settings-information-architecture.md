# Studio 设置页投影实现

本文解释 Studio 如何消费 App 产品合同。App 持有页面语义；Framework 提供
Package 安装状态、原生载体与 App 使用偏好。Studio 通过既有 state/action bridge
展示和操作，不维护第二套安装目录或生命周期。

## 统一应用管理

一级“应用管理”与主对话并行，分为“我的应用、更新、共享资源、软件源”。
“我的应用”统一展示领域智能体、工作流、应用与共享能力，以及 Homebrew 管理的
原生 App 和命令行工具，共用搜索、状态筛选和统计。Package 来自 Framework
目录，原生软件来自同一个软件源的 `native_items` 投影。软件源页复用相同行组件；
“更新”页复用其待更新筛选。设置中的“扩展与应用”和“智能体”仍消费同一目录。

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

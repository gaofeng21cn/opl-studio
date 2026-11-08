# Studio 设置页投影实现

本文解释 Studio 如何消费 App 产品合同。App 持有页面语义；Framework 提供
Package 安装状态、原生载体与 App 使用偏好。Studio 通过既有 state/action bridge
展示和操作，不维护第二套安装目录或生命周期。

## 统一扩展目录

“扩展与应用”（`capabilities` 路由）是安装、更新、修复、卸载、状态与 App
开关的统一入口。它默认展示全部动态发现的包，包括私有本地安装；“官方”只是
可选筛选。领域智能体、工作流、应用与共享能力使用同一 `PackageCatalog`。
“智能体”页是该目录的角色筛选视图。

每项展示版本、发布者、安装状态及来源。可用动作来自该包投影的
`available_actions`，通过 App action 执行。自定义安装仍消费作者提供的
manifest URL 与 trust tier，复用原有安装通道。

安装不意味着必须在 OPL App 中使用。`app_enabled` 单独控制 OPL App 的页面、
新任务入口、命令与状态读取，默认启用。`package_app_set_enabled` 保存此偏好；
关闭后安装、原生平台启用状态、Codex Skills 和 MCP 能力保持原状。目录始终
保留已关闭的包，可筛选并重新启用。已有页面在贡献被撤销时退出到聊天。

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

# Agent 工具的宿主适配层应该收敛在哪里

Labels: wayfinder:map

## Destination

以 Impeccable 4.8.2 与 agent-notes 0.3.0 为固定基线，在 Notes 领域模型、项目锁定 runtime、统一 Result、安装清单所有权和事务保证不变的前提下，形成可证伪的宿主适配架构推荐，并交付决策备忘录、宿主能力矩阵、实验/失败矩阵、新增 target 改动面与兼容性方案、反例与未验证假设。

## Notes

- 用户于 2026-11-10 明确确认：本轮执行研究和可复现实验，交付五项材料，不实现适配层。本 effort 覆盖 wayfinder 默认仅建图的流程；研究推荐不等于已采纳的产品决定。
- 未配置仓库 tracker，本轮按 wayfinder 默认使用本地 Markdown：map.md 为索引，issues/ 每票一文件，Status/Assignee 表示认领与解决，Blocked by 表示依赖，Answer 追加解决内容。未更改仓库 tracker 配置。
- 调查使用 research；汇总使用 domain-modeling、codebase-design；Codex 官方能力使用 OpenAI Docs。
- host 是 agent 执行环境；target 是 CLI 安装选择；Provider 是候选的适配描述，三者不能预先等同。
- agent-notes release commit 为 f74deccc5991e0452b3cb83feba51fe1c6bb1c1c；npm 0.3.0 gitHead 为 2f40a83c64e896b4bba17e95e24a249057c52702，两者仅 release manifest 版本不同。Impeccable cli-v4.8.2 / skill-v4.8.2 commit 为 035c8f319edd019936525a062fe99e83ca8d12c6。以实际 tarball 验证分发行为。
- 证据分 D 文档声明 / C 代码行为 / I 实际安装结果 / A agent 实际行为。关键结论至少两个独立来源；复制同源文档不算。源码与实验佐证本实现，不能自动证明宿主行为；不足则标待验证。
- 实验记录环境、argv、cwd、stdout、stderr、退出码、文件树和 hash diff；第三方可重跑。隔离 HOME/缓存/项目，不更改用户全局宿主配置，不调用付费模型。
- research 分支依 wayfinder 为临时证据分支，可推送 origin，不开 PR、不合并。工作区保留可读副本；原始大产物放 .cache/host-adapter-study。

## Decisions so far

- [agent-notes 新增 target 的真实改动面与清单兼容边界](issues/01-notes-surface.md)：合成目标实改七源码文件；原样旧 reader 拒绝新 target，恢复授权也是适配面。
- [两种 CLI 的安装适配与失败恢复边界](issues/02-impeccable.md)：Impeccable 的多处 Provider 知识、分离版本链与部分写入不能替代 Notes 的清单和 journal 保证。
- [宿主能力、加载语义与可验证性矩阵](issues/03-host-capabilities.md)：共享 skills 根不等于共享入口/导入/扩展协议；逐格保留能力与证据缺口。
- [在现有保证下选择宿主适配抽象层](issues/04-adapter-decision.md)：推荐 distribution 的声明式安装 profile 与安装投影 Interface；兼容与回滚有明确前置条件。

## Not yet specified

本轮研究目的地已达到，四张 research 票据均 resolved。没有尚需决定才能交付研究的事项。后续正式支持承诺的入口加载、A 层、原生平台等门槛已收敛到[可证伪性与未验证假设](falsifiability.md)，不把缺口改写为已验证。

## Out of scope

- 实现或发布适配层、修改 Notes 领域模型、引入 hooks/事件/会话状态、改变统一 Result、绕过路径所有权或事务保证。
- 将静态安装成功等同于 agent 必定调用 context/check；将 macOS 换行实验等同于 Windows 原生验证。

# 可证伪性、反例与未验证假设

本文件约束[决策备忘录](decision-memo.md)的适用范围。建议是基于固定基线与观察形成的设计推断，不是已实现的 Provider 层验收。 下列未验证项是将研究推荐升级为具体宿主正式支持承诺时的验证门槛；本轮已按用户确认范围完成研究与可复现实验，不把这些门槛隐去，也不把它们列作本轮尚未完成的执行任务。

## 会推翻或改变推荐的证据

| 可检验命题 | 推翻它的证据 | 应如何改变决定 | 最小验证方式 |
| --- | --- | --- | --- |
| 主要宿主差异可以收敛为项目内静态安装投影 | 任一必须支持的具体宿主/客户端，无法通过已验证入口策略提供等价的查询/检查引导，只能依赖会话事件或 hooks | 重新讨论产品范围；不要把 hooks 塞进声明式路径表 | 隔离固定版本 host，检查入口注入日志和工具调用，分别验证 skill 发现、入口读取、context/check 调用 |
| 受限声明式表比散落枚举提高 locality | 两个新的真实宿主接入后，仍必须修改 CLI、manifest、layout、git-rules 和 transaction 的宿主分支 | 表抽象失败，应检查事实来源与投影 Interface，而不是继续增加 callbacks | 为两个不同目录/入口策略的 profile 做真实补丁并记录文件集；同一 authoring 事实只维护一次 |
| `.agents` profile 能让部分新增 host 无需新 target | 固定宿主 loader 明确不读其路径或入口，或真实无模型发现复现失败 | 添加独立 profile 或撤销支持声明；不得只加营销 alias | 重跑 hosts/discover.py 并检验具体版本；入口加载另有独立试验 |
| 保留 install/1 可以保持已有数据与所有权保证 | 投影所需的最小事实无法随工具 bundle 固定，必须依赖持久化但现有清单无法表达的用户路径/策略 | 显式提出新安装协议，不再声称清单不变 | 明确一个无法重建或无法验证的路径/策略实例，对照同版本 repair 和旧 reader 行为 |
| 旧 0.3.0 无法读取新增 target | 未修改的实际 npm0.3.0 在真实新 profile 清单上 status/context/upgrade/repair 都成功，并证明不是绕过清单或未发现安装 | 重写兼容性方案；撤销 bridge 前置条件 | 重跑 notes/strict 与 synthetic phases，校验 tarball integrity 和实际 spawn 链 |
| 现有项目 target-set 不可变是产品约束 | 用户明确把原地增删 target 纳入目标，并接受新的安装管理语义 | 另立 target migration 决定，定义删除/冲突/回滚与入口共享 | 当前 init 改集合和 upgrade --target 拒绝实验作为 before；新方案须保持 journal 与所有权保证 |
| 当前项目事务 seam 能继续复用 | 必须提供 global 安装、跨仓库写入或跨机器原子性，且不能接受独立事务 | 重新设计 scope/锁/所有权，不再使用项目事务作全局保证 | 原生多项目与 global 目录失败注入；当前 macOS 项目测试不能证明 |

## 已观察到的反例

- **没有新布局的新宿主**：多个 host 可消费 `.agents/skills`；新增 host 不必新增 target，机械扩枚举反而制造重复身份。Codex 与 OpenCode 的隔离发现、固定 loader 以及宿主官方文档见[能力矩阵](research/hosts/report.md)。
- **有表仍散落知识**：Impeccable 构建 Provider 表、Rust 安装表和运行时身份并非同一份；新增 Replit/Devin 的真实历史及安装验证见[对照报告](research/failures/report.md)。这反驳“引入一张表即完成收敛”。
- **只改安装不改恢复**：合成第三目标的安装可以生成新路径，但缺少 `distributionPath` 扩展时 prepared journal 被拒绝；补回授权后才恢复。见[改动面报告](research/notes/report.md)。
- **同实现换版本号不是真实跨版本兼容**：真实 0.2.0 使用 `.agent-notes` 工具根而 config.notes_dir 指向 `.agents/notes`，0.3.0 的一致性检查拒绝升级。当前测试的版本夹具不能证明此历史升级成功。见[失败实验](research/failures/report.md)。
- **退出 0 不等于自含离线运行**：固定 Impeccable bundle 可落盘但引擎下载失败仍退出 0；文件树可缺 engine。回放校验过的官方 engine 后 installed launcher 离线探针成功，说明是分发就绪层与安装命令层不同。见同一报告。
- **`@path` 不是统一导入协议**：Claude、Gemini、Copilot CLI 的适用入口/路径限制不同；Cursor/OpenCode 的普通引用不能直接当成内联。见[逐格来源](research/hosts/report.md)。

## 没有被验证的层

| 层 | 本次能确认 | 未能确认与后果 |
| --- | --- | --- |
| D 官方文档 | 多宿主网页实际抓取，记录日期/字节hash；不是未打开链接 | Codex官方站在本环境SSL timeout，用固定源码及discovery补C/I，不冒充已读D |
| C 固定实现 | 两产品固定源码、发布launcher/engine，部分宿主loader | 闭源Claude/Cursor/Copilot CLI无开放loader；官方文档为单一权威，相关格为中置信度 |
| I 安装/发现 | npm包、研究者独立验签并核对hash的固定bundle、按发布manifest核对hash的engine；独立进程文件树、退出码、离线/权限/并发/中断；Codex/OpenCode无模型discovery | Gemini未安装、Cursor/VS Code/云Copilot未做真实发现；不能将其他宿主支持外推过去 |
| A agent实际行为 | 无 | 没有运行模型turn，没有证明agent会读入口或调用context/check；发现成功不能填补这一缺口 |
| 平台 | Darwin arm64；源码平台分支可审查，Git换行实验范围见报告 | 没有原生Windows/Linux完整安装/权限/锁/终端实验；macOS CRLF不能替代Windows验证 |
| 因果独立性 | 源码与独立发布产物进程实验是不同观察渠道 | 同一实现的源码+单测不等于两个独立宿主权威；同站多篇文档、镜像或README转述不凑数 |

Impeccable bundle 的签名证据来自研究者独立核验：固定源码公钥、Ed25519 envelope、size 与 ZIP hash 均检查后使用 local override。它证明本次输入的身份与完整性，不证明 CLI 自身的远程下载/验签端到端流程已被实验覆盖。

严格的“双独立来源”门槛没有在所有宿主格满足。报告对这些格降置信度并保留缺口，没有用二手材料补齐。推荐的核心论据以固定源码、发布产物及可重复故障实验支持；闭源host的最终支持承诺仍需后续真实加载/行为证据。

## 只靠二手材料的结论

没有将README、博客或二手总结用于成立任何关键事实。研究入口可从它们发现问题，但最终正文只使用固定源码、官方文档、npm/发布产物与实验。无法追到一手或独立复现的能力标为未知或文档声明，而不是当成已支持。

## 最小后续证据包

若要把本研究升级为正式支持承诺，对每个具体 host/client/version 使用相同项目fixture，分别记录：1. skill名单；2. 常驻入口的实际注入内容/来源；3. 一个需要Note context的任务的工具调用日志；4.交付前check是否执行；5.禁用/审批/不受信任项目下的对照。不得把模型回答“我读过了”当注入证明。A层需要宿主及凭据/额度，未把它伪装为本次已完成实验。

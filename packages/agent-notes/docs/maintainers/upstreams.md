# 上游依据

本文供追溯治理原则和更新上游研究时使用，区分来源事实、本包采纳的规则和验证缺口。它不定义当前命令或持久格式；当前设计见[设计约束](design.md)，实际宿主观察见[实现验收记录](adapter-validation.md)。

## 研究基线与原始材料

[upstreams.lock.json](upstreams.lock.json) 是研究身份的唯一清单，记录仓库 URL、完整 commit、观察日期、阅读范围，以及宿主资料的抓取时间、hash 和快照路径。下面的源码链接固定到该清单中的提交，网页链接的原文身份由锁中的 hash 确认。

| 材料 | 本地位置 | 保留方式 |
| --- | --- | --- |
| 上游仓库学习副本 | 仓库根 `.cache/upstreams/` | 忽略，不提交或打包 |
| 宿主资料抓取原文 | 仓库根 `.cache/host-adapter-study/hosts/docs/` | 忽略，位置与 hash 由版本锁记录 |
| 采纳结论与来源身份 | 本文及版本锁 | 随仓库维护，不进入 npm 包 |

缓存可能只在研究机器存在，复查时以固定来源身份重新取得材料；当前正文不把缓存存在视为验证已完成。

## DeepSeek Harness

基线：`687f282e8625c6b8d11ff58211a90524be2e4317`。这是 Notes 治理的主要依据，以下链接均固定到该提交。

| 依据 | 保留的结论 |
| --- | --- |
| [Notes README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/.agents/notes/README.md#when-to-write-one) | 只记录代码/测试/现有文档不能承载的长期理由，必要记录与代码同 PR；机械/局部 UI 改动豁免 |
| [已交付记录维护规则](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/.agents/notes/implemented/AGENTS.md) | 同一决定的事实随代码维护，另一决定新建并互链 |
| [维护 skill](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/.agents/skills/dsh-archive-agent-notes/SKILL.md) | 新增决定时同步检查替代范围；保留仍有效的指导，有条件清理失去防错价值或已完整吸收的记录 |
| [冻结归档决定](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/.agents/notes/implemented/process/2026-07-26-frozen-agent-note-archive.md) | 归档按未来指导价值判断，封存后不追随代码、链接或格式变化，默认搜索排除 |
| [归档校验实现](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/scripts/archived-agent-notes.ts)及[测试](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/scripts/archived-agent-notes.spec.ts) | hash 与追加 seal 还需可信基线，不能允许正文和清单一起篡改 |
| [文档层次](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/AGENTS.md) | 规则入口短、事实只有一个归属，决策理由与使用参考分开 |

上游的 [Plan](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/plan/plan-mode/README.md) 是会话规划，未绑定 Note 创建。[指令加载](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/context/agent-instructions/README.md)也不等于首次编辑前已读 Note。上游有 [Git hook](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/lefthook.yml) 与 CI 调用校验脚本，但不能将其描述为 coding agent 工具调用前的 Notes 阅读门禁。

### 采纳范围与本包扩展

上游提供目录、格式、链接与归档校验；“值得写”“应归档”“已完整吸收”仍由作者和审查判断。本包增加稳定 ID、scope 查询、事务性转换、rejected 基线保护及首次归档来源校验，这些是本包设计，不应归为上游已有保证。上游的多文件翻译布局、历史格式例外和特定 seal 修补也不作为本包通用契约。

## Matt Pocock skills

固定基线与阅读范围见[版本锁](upstreams.lock.json)：仅 wayfinder、grill-with-docs 的入口、metadata 及各自说明，不扩展到它们委托的其他 skills。以下链接固定到锁定提交。

- [wayfinder](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/wayfinder/SKILL.md)在路线清楚、单会话可完成时允许不建地图，但没有实现自动进入原生 Plan 的协议。工作规模与文档价值应分别判断；其地图、ticket、认领及任务树不进入本产品。
- [grill-with-docs](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/grill-with-docs/SKILL.md)本身是委托入口；[自身文档](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/docs/engineering/grill-with-docs.md)说明定案内容仍需满足持久化门槛，零 ADR 是正常结果。它没有提供本包所需的脚本校验与冻结闭环，其 ADR 判据不替代 Harness Notes 的记录标准。

## 项目 skill 接入依据

2026-11-10 的研究用于选择本地 CLI 的候选静态目录。抓取身份以[版本锁](upstreams.lock.json)为准；本节结论限定于该次基线。

| 来源 | 观察结论 | 证据边界 |
| --- | --- | --- |
| Claude Code [项目 skills](https://code.claude.com/docs/en/skills.md) | 官方文档描述 `.claude/skills/<name>/SKILL.md` 与按需加载正文 | loader 闭源，没有固定实现证据；新产物发现和实际加载仍需独立验证 |
| Codex 固定提交的 [host roots](https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/host_roots.rs)、[host loader](https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/loader/host.rs) 与 [discovery](https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/loader/discovery.rs) | 实现包含项目 `.agents/skills` 发现与作用域处理 | 固定源码未证明与本地 executable 为同一构建，实际发现另验 |

当时 Codex 官方 skills/AGENTS/config 等页面抓取超时，属于文档层缺口，不能解释为能力不支持。generic 仅表示通用 `.agents/skills` 布局；其他宿主能读该目录也不足以证明完整接入。

共享 skill 根不等于共享指令导入、作用域、优先级或插件协议。旧研究中的 `.claude/CLAUDE.md` 和 `@` 导入不用于当前安装策略；安装器不生成、解析导入来择路或维护常驻规则文件。两份 skill 的资源及 Notes 正文按需读取。

固定本地 CLI 的发现结果和缺项统一保存在[宿主和证据边界](adapter-validation.md#宿主和证据边界)。完整支持声明遵循[证据门槛](validation.md#宿主声明与平台政策)，不从静态安装推断正文已加载或模型已理解。

## 更新上游研究

1. 以版本锁中的 commit、范围和抓取身份复查原始材料，再读取目标版本的差异。
2. 分别记录上游事实和本包准备采纳的变化；超出原阅读范围时显式更新范围。
3. 同步版本锁的 commit、观察日期、抓取时间/hash/快照位置及本文固定链接，保持来源一致。
4. 对照[设计约束](design.md)决定是否采纳，并按[维护验证](validation.md)检查受影响行为。

上游更新不直接收紧既有文档契约，也不授权重写归档。需要改变本包行为时，应在对应契约或实现中完成明确变更；无法取得的证据继续标明缺口。

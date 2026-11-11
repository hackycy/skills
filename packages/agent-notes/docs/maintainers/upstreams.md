# 上游依据

研究基线记录于 [upstreams.lock.json](upstreams.lock.json)，含仓库 URL、完整 commit、仓库根相对的本地学习路径与阅读范围，以及宿主 skill 资料的抓取时间、hash 和快照路径。学习副本位于已忽略的 `.cache/upstreams/`，宿主资料原文位于 `.cache/host-adapter-study/hosts/docs/`；保留版本锁用于后续对比，不提交或打包副本。

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

上游提供目录、格式、链接与归档校验；“值得写”“应归档”“已完整吸收”仍由作者和审查判断。本包增加稳定 ID、scope 查询、事务性转换、rejected 基线保护及首次归档来源校验，这些是本包设计，不应归为上游已有保证。上游的多文件翻译布局、历史格式例外和特定 seal 修补也不作为本包通用契约。

## Matt Pocock skills

基线：`5beb35b040e3de97e54fa9e386d7e42d15c295c2`。阅读范围仅为 wayfinder、grill-with-docs 的入口、metadata 及各自说明；未扩展到它们委托的其他 skills。

- [wayfinder](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/wayfinder/SKILL.md)在路线清楚、单会话可完成时允许不建地图，但没有实现自动进入原生 Plan 的协议。工作规模与文档价值应分别判断；其地图、ticket、认领及任务树不进入本产品。
- [grill-with-docs](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/grill-with-docs/SKILL.md)本身是委托入口；[自身文档](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/docs/engineering/grill-with-docs.md)说明定案内容仍需满足持久化门槛，零 ADR 是正常结果。它没有提供本包所需的脚本校验与冻结闭环，其 ADR 判据不替代 Harness Notes 的记录标准。

## 项目 skill 接入依据

2026-11-10 的研究用于选择本地 CLI 的候选静态目录，不据此管理 AGENTS/CLAUDE 或宣称模型已读正文。采纳范围为：

| 依据 | 保留的结论与证据边界 |
| --- | --- |
| Claude Code [项目 skills](https://code.claude.com/docs/en/skills.md)，抓取原文 SHA-256 为 `50c0f7621b93db9b7d7d4db4bb079341354915aa5f33533950d3dbad8b124ff9` | 官方文档描述 `.claude/skills/<name>/SKILL.md` 和按需正文加载；闭源 loader 无固定实现证据，新产物发现/实际加载另验 |
| Codex 固定提交 `551fc719d67b69997a5997d6a3f187a72ca2ab74` 的 [host roots](https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/host_roots.rs)、[host loader](https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/loader/host.rs) 与 [discovery](https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/loader/discovery.rs) | 实现包含项目 `.agents/skills` 发现与作用域处理；固定源码未证明与本地 executable 完全同一构建，实际发现证据单列 |

当时 Codex 官方 skills/AGENTS/config 等页面抓取均超时，保留为文档层缺口，不能解释为能力不支持；本次文档整理未重新联网验证。generic 只表示通用 `.agents/skills` 布局，不把其他宿主兼容读取该目录外推为完整支持。

共享 skills 根不等于共享指令导入、作用域、优先级或插件协议。旧入口研究中的 `.claude/CLAUDE.md` 和 `@` 导入不再作为本产品安装策略；安装器不生成、解析导入来择路或维护任何常驻规则文件。两份 skill 的资源链接和实际 Notes 正文均按需读取。

新产物在 Codex CLI 0.156.1 的发现观察及 Claude Code 2.1.319 的未验证项见[实现验收记录](adapter-validation.md)；完整宿主声明须满足[证据门槛](validation.md#宿主声明与平台政策)，不以静态文件测试推导会话已加载或已理解。

## 更新上游研究

更新时先对照版本锁中的 commit 阅读指定范围的差异，再分别记录上游事实与本包采纳的变化。更新 lock 中的 commit、观察日期和必要的阅读范围，同步固定提交链接；新上游规则必须符合本包[设计约束](design.md)，不能因上游变化直接收紧已有文档契约或重写归档。

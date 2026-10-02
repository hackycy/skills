# Agent 工程治理指令

本目录保存当前仓库的 Agent 工程治理资产。

- 先读取项目根 `AGENTS.md`，再读取当前路径范围内更具体的 `AGENTS.md`。
- `.agents/notes/` 只保存未来维护者或 Agent 可能需要重新理解的长期决策理由；`.agents/skills/` 保存可复用执行流程。
- 当前行为、API、运行机制和用户说明仍属于源码、测试和普通文档。生产事故为何逃过防线应写 postmortem；对用户有影响的 breaking change 应进入升级/迁移文档，必要时再与 Agent Note 互链。
- 真实 Agent Notes 与 `.agents/notes/archived/manifest.json` 属于项目。治理模板同步可以更新框架托管规则、Skills 和 verifier，但不得改写真实决策或已封存历史。
- 新建 Note 前搜索活跃 Note，判断 independent / duplicate authority / partial supersession / full supersession。
- Note 结构、生命周期、关系或链接变化后运行 `python3 .agents/scripts/governance_check.py --root .`。
- archive 只能通过 `python3 .agents/scripts/archive_agent_note.py ...` 完成；不要手工移动到 `archived/`。

框架安装状态保存在 `.agents/framework.json`。除非明确修复框架状态，不要手工修改其中的 hash、ownership 或 pending 状态。

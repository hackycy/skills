# Agent 工程治理指令

本目录保存当前仓库的 Agent 工程治理资产。

- 先读取项目根 `AGENTS.md`，再读取当前路径范围内更具体的指令。
- `.agents/notes/` 只用于未来维护者或 Agent 可能需要重新理解的长期决策理由。
- `.agents/skills/` 用于可复用操作流程，不用于保存当前产品事实。
- 当前行为、API、运行机制和用户说明仍属于源码、测试和普通文档。
- 真实 Agent Note 属于项目。治理模板同步可以更新框架托管规则和 Skills，但不得改写决策内容。
- 新建 Note 前搜索活跃 Note，先判断 overlap / partial supersession / full supersession。
- Agent Note 只维护单个 `.md` 文件，默认正文使用简体中文。
- Note 结构变化后运行 `python3 .agents/scripts/verify_agent_notes.py --root .`。

框架安装状态保存在 `.agents/framework.json`。除非明确修复框架状态，不要手工修改其中的 baseline hash 或 ownership。

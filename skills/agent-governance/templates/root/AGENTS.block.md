<!-- agent-governance:begin -->
## Agent 工程治理

- 长期、可复审的工程决策理由记录在 `.agents/notes/`；不要把聊天过程、chain-of-thought 或实现流水账写进去。
- 新建或修改 Agent Note 前先搜索活跃 Note，判断是否存在重复 authority、部分替代或完全 supersession。
- Agent Note 为单文件简体中文正文；文件名使用英文 kebab-case。模板包含 `REQUIRED` 占位符，未填写完成时治理检查必须失败。
- `archived` 是冻结历史：只能通过 `.agents/scripts/archive_agent_note.py` 归档并写入 SHA-256 seal，归档后不得编辑。
- 可复用流程放在 `.agents/skills/`；当前系统事实仍以源码、测试和普通文档为准。事故复盘与用户迁移说明分别归属 postmortem / upgrade guide，不由 Agent Note 代替。
- 真实 Agent Notes 和 archive manifest 属于项目，治理模板同步不得改写其决策内容或历史 seal。
- 提交前运行 `python3 .agents/scripts/governance_check.py --root .`；详细规则见 `.agents/AGENTS.md` 和 `.agents/notes/README.md`。
<!-- agent-governance:end -->

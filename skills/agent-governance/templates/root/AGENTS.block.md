<!-- agent-governance:begin -->
## Agent 工程治理

- 长期、可复审的工程决策理由记录在 `.agents/notes/`；不要把聊天过程或实现流水账写进去。
- 新建 Agent Note 前先搜索活跃 Note，判断是否存在重叠、部分替代或完全 supersession。
- Agent Note 只维护一个 `.md` 文件，默认正文使用简体中文，不生成翻译副本或 i18n sidecar。
- 可复用流程放在 `.agents/skills/`；当前系统事实仍以源码、测试和普通文档为准。
- 真实 Agent Notes 属于项目，治理模板同步不得改写其决策内容。
- 详细规则见 `.agents/AGENTS.md` 和 `.agents/notes/README.md`。
<!-- agent-governance:end -->

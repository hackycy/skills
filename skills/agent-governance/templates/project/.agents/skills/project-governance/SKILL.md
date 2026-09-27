---
name: project-governance
description: 维护仓库的 Agent 工程治理边界，包括 AGENTS.md 路由、长期 rationale 与普通文档/Skills 的知识归属、单语 Agent Note 约定、框架健康度和机械校验。适用于新增治理规则、调整 .agents 结构、检查 instruction ownership 或诊断框架漂移。
---
# Project Governance

每类知识尽量只有一个 owner：

- 根/子目录 `AGENTS.md`：简洁的长期约束与 owner 链接；
- `.agents/notes/`：长期工程 rationale 和决策历史；
- `.agents/skills/`：可复用流程与决策工作流；
- source/tests/docs：当前行为、API、运行事实和用户说明；
- `.agents/scripts/`：确定性的结构校验与辅助工具。

不要为了“让 Agent 更容易找到”就把详细产品事实同时复制进 Skills 和 Agent Notes。应链接到真正拥有该事实的来源。

## 语言

项目级治理指令和 Agent Note 模板以中文维护。真实 Agent Note 只维护一个 `.md` 文件，默认正文为简体中文，不需要中英文配对或翻译 sidecar。

## 治理变更

修改框架通用模板时，优先更新全局 `agent-governance` Skill 并通过 `upgrade` 同步项目，不要在多个仓库手工复制同一套变化。

项目特定 standing order 可以留在 managed block 之外。如果某项目需要长期偏离通用框架，应在真正 owning 的规则附近说明偏离理由，不要直接手工篡改 baseline/状态文件。

## 校验

```bash
python3 .agents/scripts/verify_agent_notes.py --root .
```

如果全局框架管理器可用，再运行它的 `doctor`，检查模板漂移和 pending conflict。

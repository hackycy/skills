---
name: project-governance
description: 维护仓库的 Agent 工程治理边界，包括 AGENTS.md 路由、长期 rationale 与普通文档/Skills 的知识归属、Agent Note 约定、框架健康度和机械校验。适用于新增治理规则、调整 .agents 结构、检查 instruction ownership 或诊断框架漂移。
---
# Project Governance

每类知识尽量只有一个 owner：

- 根/子目录 `AGENTS.md`：简洁 standing instructions 与知识路由；
- `.agents/notes/`：长期工程 rationale 和决策历史；
- `.agents/skills/`：可复用执行流程；
- source/tests/docs：当前行为、API、运行事实和用户说明；
- postmortem：真实事故为什么逃过既有测试/review/监控，以及新增什么 guardrail；
- upgrade/migration guide：下游或用户必须执行的 breaking-change 迁移；
- `.agents/scripts/`：确定性 verifier 和辅助工具。

不要为了“更容易被 Agent 找到”而复制同一份详细事实；应链接到真正 owner。

## 框架与项目 ownership

真实 Agent Notes 与 archive seal manifest 属于项目。框架拥有规则模板、项目级 Skills、verifier 和根 `AGENTS.md` managed block。项目对框架文件的长期偏离应通过全局 `agent-governance resolve --mode keep-local|detach` 明确表达，而不是长期保留未决冲突或手工改 `framework.json`。

## 机械约束

`framework.json` 是安装状态，不是治理 schema。canonical lifecycle/class 由 verifier 和当前框架 manifest 决定，手工修改 state 不能扩展 taxonomy。

归档历史必须 hash-sealed；Note 的 REQUIRED 占位符必须全部填完；活跃 Note 的相对 Markdown 链接和结构化关系目标必须存在。

## 校验

```bash
python3 .agents/scripts/governance_check.py --root .
```

如全局框架管理器可用，再运行 `doctor` 检查当前 bundle 漂移、未决 conflict 和可选 framework update。

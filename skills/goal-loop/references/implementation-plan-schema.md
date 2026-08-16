# Implementation Plan Schema

`implementation-plan.md` 是决策文档到执行账本之间的稳定计划层。它描述要做什么、按什么顺序、如何证明完成；不记录当前状态、每轮进度或临时调试结果。状态和证据只进入 `goal-runbook.md`。

新生成的计划不包含 `Current Execution State`、`active`、`passed` 或 `blocked`。如果输入是旧计划并已经包含状态，goal-loop 只在初始化时按 runbook schema 导入并校验这些状态；导入后不再回写计划。

## 顶层结构

按以下顺序写入：

1. `# <effort 名称> Implementation Plan`
2. `## Source Decisions`
3. `## Outcome`
4. `## Non-Negotiable Rules`
5. `## Gate Overview`
6. 按执行顺序排列的 Gate 详情
7. `## Definition Of Done`
8. `## Explicitly Out Of Scope`

## Source Decisions

列出决定计划的 map、ADR、spec、decision 和已解决 issue，使用仓库相对 POSIX 路径或本地链接。每条链接只说明它贡献的决定，不在计划中重复完整决策正文。

## Outcome

用一段话和一个可选的结构图说明最终可观察结果。Outcome 不写实现步骤，也不把测试命令当作结果。

## Non-Negotiable Rules

只写跨多个 Gate 都必须保持的不变量，例如单一状态源、切换边界、兼容性、回退原则或禁止的双轨行为。项目特有的规则应放在对应 Gate 的 `Constraints`。

## Gate Overview

使用固定表格，Gate 从 G0 连续编号，按依赖顺序排列：

```markdown
| Gate | Name | Unlock condition | Outcome |
| --- | --- | --- | --- |
| G0 | <名称> | 开始 | <一句话结果> |
| G1 | <名称> | G0 Exit 全部满足 | <一句话结果> |
```

每个 Gate 只能有一个直接前驱；不要把并行任务伪装成线性 Gate。若工作确实需要并行决策，先在 Wayfinder 中完成决策，再将可执行结果编排为线性 Gate。

## Gate 详情

```markdown
## G0: <名称>

### Purpose

<该 Gate 关闭的风险或建立的能力；一个 Gate 只有一个主题>

### Inputs

- `<必须读取的决策文档、代码入口或环境入口>`

### Objective

<一个可验证的执行目标>

### Scope boundary

<本 Gate 允许改变的范围，以及明确留给后继 Gate 的内容>

### Constraints

- <当前 Gate 必须保持的约束；没有时写“无”>

### Slice policy

<按行为、调用簇、数据流或其他领域边界选择最小可回退 slice；每个 slice 只能有一个行为或调用簇>

### Verification

#### Directed

- <入口、适用条件、执行时机（每个 slice 或 Gate 收尾）、预期证据>

#### Repository

1. `<准确命令或脚本；执行时机和顺序>`
2. `<准确命令或脚本；执行时机和顺序>`

#### Manual acceptance

- <URL、场景、检查项和用户确认方式；没有时写“无”>

### Evidence rule

<每条 Exit condition 由哪些 Directed、Repository 或 Manual 证据证明>

### Stop conditions

- <必须暂停的外部依赖、冲突决策、缺失验证或无法安全判断>

### Rollback

<唯一 seam、提交边界或可逆动作>

### Exit conditions

- <可观察、可证明的条件，逐项编号>
```

### 计划约束

- `Objective`、`Scope boundary`、`Constraints`、`Slice policy`、`Verification`、`Evidence rule`、`Stop conditions`、`Rollback` 和 `Exit conditions` 都必须存在。
- `Verification` 只能写仓库真实存在或决策文档明确提供的入口；不得写固定的跨项目命令。
- `Exit conditions` 必须可由 `Evidence rule` 证明，不能只写“代码完成”或“测试通过”。
- 人工验收是 Gate 合同的一部分；需要用户确认时，写清暂停点和确认结果的形式。
- 计划不得包含 `active`、`passed`、`blocked` 等执行状态，也不得追加 Progress Log。

## Definition Of Done

列出整个 effort 的最终条件，例如所有 Gate 通过、公共契约稳定、迁移/删除边界完成、人工验收完成或发布证据齐全。每项都必须能回溯到一个或多个 Gate Exit。

## Explicitly Out Of Scope

列出 map 已明确排除且本 effort 不会实现的工作。不要把尚未决策的事项写在这里；未决事项应回到决策文档或 `Not yet specified`。

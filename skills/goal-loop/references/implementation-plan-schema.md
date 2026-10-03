# Implementation Plan Schema

`implementation-plan.md` 是决策文档到执行状态之间的稳定合同层。它描述最终结果、Gate 顺序、每个 Gate 的执行边界和可证明完成条件；不记录当前执行状态、slice 历史或临时调试结果。

## 顶层结构

按以下顺序写入：

1. `# <effort 名称> Implementation Plan`
2. `## Contract Sources`
3. `## Source Decisions`
4. `## Outcome`
5. `## Non-Negotiable Rules`
6. `## Gate Overview`
7. 按执行顺序排列的 Gate 详情
8. `## Definition Of Done`
9. `## Explicitly Out Of Scope`

## Contract Sources

`Contract Sources` 是 `goal/contract-baseline.json` 的机器可校验输入集合。只列实际参与 Gate 合同形成的仓库文件，不包含 `goal/` 下的运行态文件。

使用固定表格：

```markdown
| Path | Role |
| --- | --- |
| `docs/decisions/ADR-001.md` | 决定数据边界与回退策略 |
| `docs/spec.md` | 决定行为、验收与兼容性要求 |
```

规则：

- `Path` 使用仓库相对 POSIX 路径，按字典序排列且不得重复。
- 所有用于编译计划的 map、spec、ADR、decision、issue、验收依赖，以及会改变 Gate 合同的适用 `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` 都必须列出。
- `implementation-plan.md` 不写入该表；baseline manifest 会自动加入计划文件本身。
- 只提供术语、且不改变 Gate 合同的上下文文件可以不列入；如果其变化可能改变 Scope、Verification、Stop conditions、Rollback 或 Exit conditions，则必须列入。
- `goal/` 运行态文件、生成的 prompt、history 和 baseline manifest 不得列入。

## Source Decisions

逐项说明 `Contract Sources` 中哪些文件贡献了哪些已经批准的决定。使用仓库相对路径或本地链接；不复制完整决策正文。

## Outcome

用一段话和可选结构图说明最终可观察结果。Outcome 不写实现步骤，也不把测试命令本身当作结果。

## Non-Negotiable Rules

只写跨多个 Gate 必须保持的不变量，例如单一状态源、兼容性、切换边界、回退原则或禁止的双轨行为。项目特有约束放在对应 Gate 的 `Constraints`。

## Gate Overview

使用固定表格，Gate 从 G0 连续编号并按依赖顺序排列：

```markdown
| Gate | Name | Unlock condition | Outcome |
| --- | --- | --- | --- |
| G0 | <名称> | 开始 | <一句话结果> |
| G1 | <名称> | G0 Exit 全部满足 | <一句话结果> |
```

每个 Gate 只能有一个直接前驱。并行决策必须先在决策阶段收敛，再把可执行结果编排为线性 Gate。

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

<按行为、调用簇、数据流或其他领域边界选择最小可回退 slice；一个 slice 只包含一个行为或调用簇。说明什么构成稳定、可恢复的 slice 边界。>

### Verification

#### Directed

- <入口、适用条件、执行时机（每个 slice 或 Gate 收尾）、预期证据>

#### Repository

1. `<准确命令或脚本；执行时机和顺序>`

#### Manual acceptance

- <URL、场景、检查项和用户确认格式；没有时写“无”>

### Evidence rule

| Exit | Required evidence |
| --- | --- |
| E1 | <Directed / Repository / Manual 中能够证明 E1 的具体证据> |
| E2 | <能够证明 E2 的具体证据> |

### Stop conditions

- <必须停止当前 Gate 的外部依赖、冲突决策、缺失验证或无法安全判断>

### Rollback

<唯一 seam、提交边界或可逆动作>

### Exit conditions

- `E1`: <可观察、可证明的条件>
- `E2`: <可观察、可证明的条件>
```

## 计划约束

- `Purpose`、`Inputs`、`Objective`、`Scope boundary`、`Constraints`、`Slice policy`、`Verification`、`Evidence rule`、`Stop conditions`、`Rollback` 和 `Exit conditions` 都必须存在。
- 每个 Gate 的 Exit id 从 `E1` 开始连续编号；编号语义只在 Gate 内有效。
- `Evidence rule` 必须覆盖且只覆盖当前 Gate 的 Exit id。
- `Verification` 只能引用仓库真实存在或决策文档明确提供的入口；不得写跨项目固定命令。
- `Exit conditions` 必须能够被 Evidence rule 证明，不能只写“代码完成”或“测试通过”。
- `Slice policy` 必须允许每个稳定 slice 独立验证和恢复；Agent 可在稳定 slice 后持久化 `checkpoint` 并结束当前 Goal，不需要等到整个 Gate 完成。
- 人工验收是 Gate 合同的一部分；需要用户确认时，写清验收入口、自动化边界、最小验收清单和明确结果格式。
- 计划不得包含 `active`、`passed`、`blocked` 等运行态状态，也不得包含 Current Checkpoint 或 slice history。

## Definition Of Done

列出整个 effort 的最终条件。每项必须能回溯到一个或多个 Gate Exit。

## Explicitly Out Of Scope

列出决策文档已经明确排除且本 effort 不会实现的工作。尚未决策的事项不得放在这里，应回到决策文档处理。

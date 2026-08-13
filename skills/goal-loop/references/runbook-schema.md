# Goal Runbook Schema

`goal-runbook.md` 是执行期间唯一的状态和证据账本。正文可以使用中文；状态值固定为 `planned`、`active`、`blocked`、`passed`。

## 顶层结构

按以下顺序写入：

1. `# <effort 名称> Goal Runbook`
2. `## 用途`
3. `## 源码基线`
4. `## Execution Contract`
5. `## Goal Ledger`
6. 按 ledger 顺序排列的 Gate 详情
7. `## Current Execution State`

用途段说明：账本记录已批准的 Gate 顺序、状态、合同和执行证据；完整执行提示词属于 `goal-prompt.md`，不写入账本。

## 源码基线

使用固定表格，路径相对仓库根目录，采用 POSIX 分隔符并按字典序排列：

```markdown
| 路径 | SHA-256 |
| --- | --- |
| `CLAUDE.md` | `<64 位小写十六进制>` |
```

只包含实际读取并参与决策的上下文、map/spec、ADR、decision、issue、验收依赖文档和 `implementation-plan.md`。排除 `goal-runbook.md` 与 `goal-prompt.md`。

验证时路径集合和哈希必须完全相等。新增、缺失或变化都属于源码漂移，保持账本原样并停止。

## Execution Contract

此节只放所有 Gate 共享的规则，不放项目命令：

```markdown
### Invariants

- 一次只执行一个 Gate，并按 ledger 顺序推进。
- Gate 的 Objective、Scope boundary、Inputs、Verification 和 Exit conditions 在执行期间不可改写。
- 每个 slice 只有一个行为或调用簇，并且可独立验证、可回退。
- 每轮执行都向当前 Gate 的 Progress Log 追加证据。
- 测试失败保持 `active`；`blocked` 只用于合同明确的外部依赖、用户决策或无法安全判断。
- 当前 Gate 通过后只激活直接后继，立即停止，不开始后继 Gate。
- 保留无关工作区修改；只改变当前 Gate 合同授权的语义。

### Evidence standard

<什么算作可接受的命令输出、测试结果、场景观察、人工确认或其他证据；必须与源码中的验证政策一致。>
```

## Goal Ledger

使用固定表格：

```markdown
| Gate | 状态 | 依赖 | Objective |
| --- | --- | --- | --- |
| G0: <名称> | active | 无 | <一句话目标> |
| G1: <名称> | planned | G0 | <一句话目标> |
```

Gate 从 G0 连续编号。G0 依赖为“无”；每个后继只依赖紧邻前驱，形成严格线性链。

## Gate 详情

每个 Gate 使用完全相同的字段：

```markdown
## G0: <名称>

**状态：** active

**依赖：** 无

**Inputs：**

- `<源码文档或代码入口>`

**Objective：** <一个可验证的执行目标>

**Scope boundary：** <允许改变什么，以及明确留给后继 Gate 的内容>

**Constraints：**

- <当前 Gate 必须保持的技术、产品或兼容性约束；没有时写“无”>

**Slice policy：** <如何按行为、调用簇、数据流或其他领域边界切出一个 slice；一条 slice 只允许一个可回退单元>

**Verification：**

### Directed

- <命令、脚本、测试文件、场景或检查入口；写清适用条件、执行时机和预期证据>

### Repository

1. `<仓库命令或脚本；执行时机和顺序>`
2. `<下一个命令或脚本；执行时机和顺序>`

若没有仓库级验证，写“无；原因：<源码依据>”。不得用占位命令。

### Manual acceptance

- <URL、人工场景、检查项和确认方式；没有时写“无”>

**Evidence rule：** <逐项 Exit 如何由证据证明>

**Stop conditions：**

- <触发暂停的外部依赖、冲突决策、缺失验证或无法安全判断>

**Rollback：** <唯一 seam、提交边界或可逆动作>

**Exit conditions：**

- <可观察、可证明的条件，逐项编号>

### Progress Log

- <YYYY-MM-DD>: `active`。账本已初始化；本 Gate 尚未开始实施。
```

`Inputs` 只列开工时必须读取的材料。`Verification` 必须有真实入口或明确的“无及原因”。每个验证入口必须说明适用条件、预期证据和不可用时的处理；未声明的替代命令不能自行添加。`Exit conditions` 必须来自决策源码；不得把“实现完成”当作唯一条件。`Stop conditions` 与 `Rollback` 不得留空。

## 初始状态导入

如果编译源码中的 `implementation-plan.md` 已有 `Current Execution State`，初始化可以导入状态，但必须满足：

- Gate 名称、顺序和数量与计划中的 Gate 详情一一对应；
- 最多一个 `active` 或 `blocked`；
- `passed` Gate 的计划文本包含逐项 Exit 证据和最终验证结果；
- `blocked` Gate 的计划文本包含具体阻塞、已完成检查和恢复条件；
- `planned` Gate 没有实施证据。

不满足时停止初始化并报告差异。导入完成后，`goal-runbook.md` 是唯一状态来源；执行 prompt 只更新它的 Progress Log 和原子状态，不更新计划源码。

## 状态机检查

Ledger 与 Gate 详情中的状态、依赖必须一致，并满足以下唯一形状之一：

- 正常：`passed* active planned*`
- 阻塞：`passed* blocked planned*`
- 完成：`passed+`

其他组合无效，包括零 Gate、多个 active、active 与 blocked 并存、`planned` 后出现 `passed`，或越过未通过前驱。

每个 `passed` Gate 的 Progress Log 必须逐项覆盖 Exit conditions，并记录 Directed、Repository 和适用的 Manual acceptance 结果。`blocked` Gate 必须记录具体阻塞、已完成的安全检查和恢复条件。`planned` Gate 不得包含实施证据。

## Current Execution State

使用固定表格同步人类可读状态：

```markdown
| Gate | Status | Unlock evidence |
| --- | --- | --- |
| G0 <名称> | passed | <证据位置或摘要> |
| G1 <名称> | active | <前驱证据> |
| G2 <名称> | planned | <G1 通过后解锁> |
```

它必须与 Goal Ledger 和 Gate 详情一致。它是状态摘要，不是第三套状态源。

## 原子转换

执行 prompt 只能追加 Progress Log；证据齐全后执行一次转换：

1. 当前 Gate：Ledger、详情和 Current Execution State 从 `active` 改为 `passed`，追加逐项最终证据。
2. 有直接后继时：三处都把后继从 `planned` 改为 `active`，追加“已激活，尚未开始实施”，然后立即停止。
3. 没有后继时：确认所有 Gate 都为 `passed`，追加 Goal 完成证据并停止。

任何源码漂移、状态无效或证据缺失都保持账本原样。普通验证失败不能触发 Gate 状态转换。

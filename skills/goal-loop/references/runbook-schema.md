# Goal Runbook Schema

`goal-runbook.md` 只记录执行状态和证据。稳定 Gate 合同全部保留在 `implementation-plan.md`；runbook 通过 Gate 编号和名称引用它们，不复制其内容。

## 顶层结构

按以下顺序写入：

1. `# <effort 名称> Goal Runbook`
2. `## Source Baseline`
3. `## State Rules`
4. `## Goal Ledger`
5. `## Progress Log`

## Source Baseline

使用固定表格：

```markdown
| Path | SHA-256 |
| --- | --- |
| `implementation-plan.md` | `<64 位小写十六进制>` |
```

规则：

- 路径相对仓库根目录，使用 POSIX 分隔符并按字典序排列。
- 包含 `implementation-plan.md` 以及实际参与计划的上下文、map/spec、ADR、decision、issue 和验收依赖文档。
- 哈希覆盖原始字节。验证时路径集合和哈希必须完全一致。
- 排除 runbook 本身和所有便利性派生产物。

## State Rules

生成的 runbook 只写以下状态规则：

```markdown
- `implementation-plan.md` 是 Gate 合同的唯一来源；本账本只记录状态和证据。
- 一次只执行 Goal Ledger 中唯一 `active` 的 Gate。
- 每轮向对应 Gate 的 Progress Log 追加 slice、修改、验证结果、风险和下一动作。
- `passed` 需要计划中每条 Exit condition 的明确证据；普通实现或验证失败保持 `active`。
- `blocked` 只用于计划声明的 Stop condition，并记录阻塞与恢复条件。
- 当前 Gate 通过后只激活直接后继并立即停止；最后一个 Gate 通过后结束 Goal。
```

不要在此重写项目约束、验证命令、回退策略或 Gate 合同。

## Goal Ledger

Goal Ledger 是唯一状态表示，不在其它章节重复状态字段：

```markdown
| Gate | Status | Depends on | Plan contract | Unlock evidence |
| --- | --- | --- | --- | --- |
| G0: <名称> | active | none | `implementation-plan.md` -> `G0: <名称>` | no predecessor |
| G1: <名称> | planned | G0 | `implementation-plan.md` -> `G1: <名称>` | G0 pending |
```

Gate 从 G0 连续编号。G0 无依赖；每个后继只依赖紧邻前驱。`Plan contract` 中的编号和名称必须与计划标题完全一致。

状态只允许以下形状：

- 正常：`passed* active planned*`
- 阻塞：`passed* blocked planned*`
- 完成：`passed+`

零 Gate、多个 active、active 与 blocked 并存、越过未通过前驱或计划/账本 Gate 不一致都属于无效状态。

## Progress Log

按 Ledger 顺序为每个 Gate 建一个日志段，不复制 Gate 合同：

```markdown
## Progress Log

### G0: <名称>

- <YYYY-MM-DD>: initialized as `active`; implementation has not started.

### G1: <名称>

- <YYYY-MM-DD>: initialized as `planned`; no implementation evidence.
```

执行期间只能追加日志。每条实施日志至少记录：slice、修改文件、Directed/Repository/Manual 验证结果、失败及修复、风险和下一动作。

`passed` Gate 的日志必须逐项覆盖计划中的 Exit conditions，并记录最终验证和适用的人工确认。`blocked` Gate 必须记录触发的 Stop condition、已完成检查和恢复所需输入。`planned` Gate 只允许初始化日志。

## 初始状态导入

旧 `implementation-plan.md` 若有 `Current Execution State`，仅在初始化时导入，并要求：

- Gate 名称、顺序和数量与计划详情一致；
- 最多一个 active 或 blocked；
- passed Gate 有逐项 Exit 和最终验证证据；
- blocked Gate 有阻塞、已完成检查和恢复条件；
- planned Gate 没有实施证据。

导入证据写入对应 Progress Log。初始化完成后，状态只在 Goal Ledger 中更新，不回写计划。

## 原子转换

证据齐全后执行一次转换：

1. 在当前 Gate 的 Progress Log 追加逐项 Exit 和最终验证证据。
2. 将当前 Gate 在 Goal Ledger 中从 `active` 改为 `passed`，填写 Unlock evidence。
3. 若有直接后继，将其从 `planned` 改为 `active`，记录前驱证据，并在其日志追加“已激活，尚未开始实施”；立即停止。
4. 若无后继，确认所有 Gate 都为 `passed`，记录 Goal 完成并停止。

源码漂移、状态无效或证据缺失时保持账本原样。普通验证失败不能触发状态转换。

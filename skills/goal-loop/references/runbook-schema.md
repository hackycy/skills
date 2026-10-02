# Goal Runbook Schema

`goal/runbook.md` 是轻量热状态。稳定 Gate 合同保留在 `implementation-plan.md`；完整 slice、失败诊断、验证过程和人工验收事件保留在 `goal/history/G<n>.md`。runbook 不得充当 append-only 日志。

## 顶层结构

固定顺序：

1. `# <effort 名称> Goal Runbook`
2. `Schema: \`goal-loop/runbook-v2\``
3. `## Source Baseline`
4. `## State Rules`
5. `## Goal Ledger`
6. `## Current Checkpoint`

## Source Baseline

```markdown
| Path | SHA-256 |
| --- | --- |
| `<repo-relative-effort>/implementation-plan.md` | `<64 位小写十六进制>` |
```

规则：

- 路径相对仓库根目录，使用 POSIX 分隔符并按字典序排列。
- 包含 effort 的 `implementation-plan.md` 以及实际参与计划的上下文、map/spec、ADR、decision、issue 和验收依赖文档。Baseline 路径一律相对仓库根目录；runbook/history 内部运行态引用则相对 effort。
- 哈希覆盖原始字节。
- 验证时路径集合和哈希必须一致；漂移时保持 Ledger 与 checkpoint 原样并停止。
- 排除 `goal/` 下所有运行态文件和便利性派生产物。

## State Rules

生成的 runbook 只写以下规则：

```markdown
- `implementation-plan.md` 是 Gate 合同唯一来源；本账本只保存当前状态和压缩 checkpoint。
- `goal/history/G<n>.md` 是对应 Gate 的 append-only 事件与证据历史；默认不进入 Goal 启动上下文。
- 一次只执行 Goal Ledger 中唯一 `active` 的 Gate；`blocked` 只用于计划声明的 Stop condition。
- 每个执行事件先追加到当前 Gate history，再用该事件结果重写 Current Checkpoint。
- Gate 通过后只在 Ledger 保留 `gate-passed` event locator；详细 slice 留在 history，后续 Goal 默认不读取。
- 人工验收待确认时 Gate 保持 `active`，checkpoint 记录 acceptance id；当前 Goal 结束，不等待或轮询。
- 当前 Gate 通过后只激活直接后继并结束本次 Goal；直接后继由新的 Goal 执行。
```

不要在此重写项目约束、验证命令、回退策略或 Gate 合同。

## Goal Ledger

固定表格：

```markdown
| Gate | Status | Depends on | Plan contract | History | Unlock evidence |
| --- | --- | --- | --- | --- | --- |
| G0: <名称> | active | none | `implementation-plan.md` -> `G0: <名称>` | `goal/history/G0.md` | no predecessor |
| G1: <名称> | planned | G0 | `implementation-plan.md` -> `G1: <名称>` | — | G0 pending |
```

规则：

- Gate 从 G0 连续编号；G0 无依赖，每个后继只依赖紧邻前驱。
- 状态仅允许 `planned`、`active`、`blocked`、`passed`。
- 合法形状只有 `passed* active planned*`、`passed* blocked planned*` 或 `passed+`。
- `active` / `blocked` Gate 必须有 history 文件；`passed` Gate 必须有 history 和 `gate-passed` event locator。
- `planned` Gate 尚未激活时不要求创建 history。
- `Plan contract` 编号和名称必须与计划标题完全一致。
- `Unlock evidence` 对 passed Gate 使用 `<history-path>@<gate-passed-event-id>`；后继激活时记录同一个前驱 locator。

## Current Checkpoint

checkpoint 是可重写压缩状态，不是历史。正常执行只保留继续当前 Gate 所需事实。

当前 Gate 存在时：

```markdown
## Current Checkpoint

- Gate: `G2: <名称>`
- History: `goal/history/G2.md`
- Last event: `G2-E0012`
- Last completed slice: `S8`
- Current slice: `S9`
- Satisfied exits: `E1, E2`
- Manual acceptance: `none`
- Blocker: `none`
- Risks: <无或压缩后的当前风险>
- Next action: <一个明确动作>
```

人工验收交接后：

```markdown
- Manual acceptance: `pending G2-A1`
- Last event: `G2-E0013`
- Next action: 等待用户在新的 Goal 中明确回复 G2-A1 的结果。
```

blocked 时：

```markdown
- Gate: `G2: <名称>`
- Blocker: <命中的 Stop condition 与恢复所需输入>
- Next action: <恢复后第一个动作>
```

effort 完成时：

```markdown
## Current Checkpoint

- Gate: `none`
- History: `none`
- Last event: `<最后 Gate 的 gate-passed event>`
- Last completed slice: `none`
- Current slice: `none`
- Satisfied exits: `all`
- Manual acceptance: `none`
- Blocker: `none`
- Risks: none
- Next action: effort complete
```

约束：

- checkpoint 必须与 Ledger 中唯一 `active` / `blocked` Gate 对齐；完成态则 Ledger 全部 `passed`。
- `Last event` 必须存在于对应 history。
- `Satisfied exits` 只列计划真实存在且已有 history 证据的 Exit。
- checkpoint 不复制已完成 slice 的逐条过程，只能做压缩摘要；历史事实通过 event id 引用。
- 正常执行更新 checkpoint 时允许重写旧 checkpoint；不得为了“保留历史”追加第二份 checkpoint。

## 原子状态转换

Gate 通过时：

1. 当前 history 追加最终 verification event，并用 `Satisfies` 标明它证明的 Exit。
2. history 追加 `gate-passed` event；其 `Exit evidence` 字段必须完整映射计划全部 Exit 到既有 evidence event。
3. Ledger 当前 Gate `active -> passed`，Unlock evidence 写为 `<history-path>@<gate-passed-event-id>`。
4. 若存在后继：创建其 history 初始化 event，`planned -> active`，Current Checkpoint 重建为后继的最小启动状态。
5. 若无后继：Current Checkpoint 切为 effort complete。
6. 运行 validator；通过后显式结束整个 Goal，不执行后继。

普通验证失败保持当前 Gate `active`，只追加 history event 并更新 checkpoint。源码漂移、状态无效或证据缺失时不得转换状态。

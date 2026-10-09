# Goal Runbook Schema

`goal/runbook.md` 是唯一热状态来源。Gate 合同在 `implementation-plan.md`，history 只保存每个 Gate 的简短追溯记录。

Schema: `goal-loop/runbook-v2`

## Revision

`Revision` 是并发写入 token。除 bootstrap/recover 外，每个 mutation 必须携带当前 `--expected-revision`；成功写入递增 1。

## Contract Baseline

```markdown
## Contract Baseline

- Manifest: `goal/contract-baseline.json`
- Manifest SHA-256: `<64 位小写十六进制>`
```

baseline 只保存 implementation plan 与 Contract Sources 的当前摘要。

## Goal Ledger

```markdown
| Gate | Status | Depends on | Plan contract | History | History head | Unlock evidence |
| --- | --- | --- | --- | --- | --- | --- |
| G0: Prepare | active | none | `implementation-plan.md -> G0: Prepare` | `goal/history/G0.md` | `G0-E0001` | `no predecessor` |
| G1: Finish | planned | G0 | `implementation-plan.md -> G1: Finish` | `—` | `—` | `G0 pending` |
```

状态只能是 `planned`、`active`、`blocked`、`passed`。线性形状是 `passed* active planned*`、`passed* blocked planned*` 或全部 passed。只有已激活 Gate 创建 history。

## Current Checkpoint

checkpoint 每次替换，固定包含：

- 当前 Gate、History、History head；
- 最后完成的 slice、当前 slice；
- 每个检查的最新状态；
- 已满足的 Exit；
- Manual acceptance 状态；
- Blocker、Risks、Next action；
- 最近一次合同修订摘要。

checkpoint 不追加 slice、命令输出、完整文件清单或事件 hash。`Satisfied exits` 由当前 Gate 的最新检查结果计算，不能手写绕过检查。

Manual acceptance pending 时 Gate 保持 active；blocked 时必须有合同声明的 Stop condition 和非空 Blocker。Gate pass 只激活直接后继；最后一个 Gate 通过后 `Gate: none`、`Next action: effort complete`。

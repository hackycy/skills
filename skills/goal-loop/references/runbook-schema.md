# Goal Runbook Schema

`goal/runbook.md` 是轻量热状态。Gate 合同保留在 `implementation-plan.md`；完整执行事实保留在 `goal/history/G<n>.md`；Repository check 输出保留在 `goal/evidence/`。

Schema: `goal-loop/runbook`

## Revision

`Revision` 是 optimistic concurrency token。除 `bootstrap` / `recover` 外，每个 state mutation 都必须携带 `--expected-revision <n>`。成功 mutation 将 Revision 增加 1；陈旧 Revision 必须拒绝。

`bootstrap` 创建 Revision `0`。

## Contract Baseline

固定为：

```markdown
## Contract Baseline

- Manifest: `goal/contract-baseline.json`
- Manifest SHA-256: `<64 位小写十六进制>`
```

validator 校验 manifest 自身哈希、路径集合和每个合同输入文件的 SHA-256。合同输入漂移时 Ledger 和 checkpoint 不变化，Gate 不继续执行。

## State Rules

runbook 必须逐字包含 validator 定义的 State Rules。项目命令、Gate 合同和临时执行事实不得写入该 section。

## Goal Ledger

固定表格：

```markdown
| Gate | Status | Depends on | Plan contract | History | History head | Unlock evidence |
| --- | --- | --- | --- | --- | --- | --- |
| G0: Prepare | active | none | `implementation-plan.md -> G0: Prepare` | `goal/history/G0.md` | `<tail-hash>` | `no predecessor` |
| G1: Finish | planned | G0 | `implementation-plan.md -> G1: Finish` | `—` | `—` | `G0 pending` |
```

状态只允许 `planned`、`active`、`blocked`、`passed`。合法形状只有 `passed* active planned*`、`passed* blocked planned*` 或全部 `passed`。一次只能有一个执行中的 Gate。

`active`、`blocked`、`passed` Gate 必须有 history；`History head` 必须等于 history tail event hash。`planned` Gate 不创建 history。

## Current Checkpoint

checkpoint 固定记录：Gate、History、History head、Last event、Last completed slice、Current slice、Satisfied exits、Manual acceptance、Blocker、Risks、Next action。

`Satisfied exits` 完全由当前 Gate 的 Verification ID 证据推导。每个 Exit 只有在 `Evidence rule` 声明的 required checks 最新 effective result 都为 pass 时才满足；手工写入 `all` 不能绕过 validator。

人工验收 pending 时：

```markdown
- Manual acceptance: `pending G2-M1`
- Next action: `wait for explicit result for G2-M1`
```

blocked 时必须有非空 `Blocker`；恢复必须先追加 `resumed` event。

## 稳定 checkpoint

稳定且已验证的 slice 完成后，如果下一 slice 不适合在当前 Goal 的剩余上下文或工具预算中完整完成，追加 `checkpoint` event。Gate 保持 `active`；后续 Goal 从 checkpoint 恢复，不需要默认加载完整 history。

# Goal Runbook Schema

`goal/runbook.md` 是唯一热状态来源。Gate 合同在 `implementation-plan.md`，history 只保存每个 Gate 的简短追溯记录。

标识：`goal-loop/runbook`。读取以必要的执行事实为准，已有标识和说明文案不要求随执行材料更新。

## Revision

`Revision` 是并发写入 token。执行状态写入必须携带当前 `--expected-revision`，成功写入递增 1。bootstrap 初始化 Revision，recover 恢复 transaction 中的值；执行材料 refresh 检查 expected Revision 并保留其值，不改变任务进度。

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

checkpoint 不追加 slice、命令输出、完整文件清单或事件 hash。`Satisfied exits` 由 Current Checks 中的最新结果计算，不能手写绕过检查。History 和 History head 是追溯定位信息，不要求正常执行读取或重放相应记录。

Manual acceptance pending 时 Gate 保持 active；blocked 时必须有合同声明的 Stop condition 和非空 Blocker。Gate pass 只激活直接后继；最后一个 Gate 通过后 `Gate: none`、`Next action: effort complete`。

## Current Checks

使用 JSON 代码块保存当前 Gate 的检查快照，以检查 ID 为键。每项包含 outcome、fingerprint、matched_files、result、acceptance 和 exit_code。尚未执行的检查没有条目；再次检查替换对应条目，取消待验将 outcome 置为 cancelled。切换 Gate 后清空当前检查详情，完成整个 effort 后为 `{}`。

这份快照完整保存脚本放行、过期判断和人工验收对象校验所需的事实，不依赖历史反推。默认 context 只输出检查状态、过期原因、待验说明与恢复点，不输出内部指纹和文件数量；其大小不随执行轮数增长。

缺少此区段的已有 runbook 可以兼容读取相关历史，刷新时补齐快照并保留原文备份。已有区段损坏时报告错误，不能用历史静默覆盖当前事实。计划范围、约束和验收条件在 context 中完整提供。

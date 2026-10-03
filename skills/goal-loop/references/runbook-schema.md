# Goal Runbook Schema

`goal/runbook.md` 是轻量热状态。Gate 合同保留在 `implementation-plan.md`；完整 slice、失败诊断、验证过程和人工验收事件保留在 `goal/history/G<n>.md`。

Schema: `goal-loop/runbook-v3`

## 顶层结构

固定顺序：

1. `# <effort 名称> Goal Runbook`
2. `Schema: \`goal-loop/runbook-v3\``
3. `Revision: \`<非负整数>\``
4. `## Contract Baseline`
5. `## State Rules`
6. `## Goal Ledger`
7. `## Current Checkpoint`

## Revision

`Revision` 是运行态的 optimistic concurrency token。任何 state mutation 都必须读取当前 Revision，并通过 `goal_loop_ctl.py --expected-revision <n>` 提交。成功操作把 Revision 增加 1；不匹配的写入必须拒绝。

`bootstrap` 创建 Revision `0`。

## Contract Baseline

固定为：

```markdown
## Contract Baseline

- Manifest: `goal/contract-baseline.json`
- Manifest SHA-256: `<64 位小写十六进制>`
```

`goal/contract-baseline.json` 使用 schema `goal-loop/contract-baseline-v1`：

```json
{
  "files": [
    {
      "path": "docs/spec.md",
      "sha256": "<64-hex>"
    },
    {
      "path": "efforts/example/implementation-plan.md",
      "sha256": "<64-hex>"
    }
  ],
  "schema": "goal-loop/contract-baseline-v1"
}
```

规则：

- 路径相对仓库根目录、使用 POSIX 分隔符、按字典序排列且不得重复。
- 路径集合必须精确等于 `implementation-plan.md` 的 `Contract Sources` 加上计划文件自身。
- 每个哈希覆盖对应文件原始字节。
- runbook 中保存 manifest 文件自身的 SHA-256。
- 合同输入漂移时 validator 失败，Ledger 和 checkpoint 保持不变。
- 如果 `implementation-plan.md` 内容发生变化，必须重新审查和编译 Gate 合同；`reconcile-baseline` 不允许只刷新计划文件哈希。
- 如果计划文件未变化、Contract Sources 路径集合未变化，并且操作者明确确认现有 Gate 合同仍有效，可运行 `reconcile-baseline --confirm-plan-valid --reason ...`。该操作刷新合同输入哈希、追加 `contract-reconciled` event、更新 History head 和 Revision。

## State Rules

runbook 必须逐字包含 validator 中定义的八条 State Rules。控制脚本每次写 runbook 时会按固定顺序重新生成这些规则。项目约束、验证命令、回退策略或 Gate 合同不得写入此处。

## Goal Ledger

固定表格：

```markdown
| Gate | Status | Depends on | Plan contract | History | History head | Unlock evidence |
| --- | --- | --- | --- | --- | --- | --- |
| G0: Prepare | active | none | `implementation-plan.md -> G0: Prepare` | `goal/history/G0.md` | `<tail-hash>` | `no predecessor` |
| G1: Finish | planned | G0 | `implementation-plan.md -> G1: Finish` | `—` | `—` | `G0 pending` |
```

规则：

- Gate 从 G0 连续编号；G0 无依赖，每个后继只依赖紧邻前驱。
- 状态只允许 `planned`、`active`、`blocked`、`passed`。
- 合法形状只有 `passed* active planned*`、`passed* blocked planned*` 或全部 `passed`。
- `active` / `blocked` / `passed` Gate 必须有 history；`History head` 必须等于 history tail event hash。
- `planned` Gate 的 History 和 History head 必须为空标记。
- `passed` Gate 必须有且只有一个最终 `gate-passed` event。
- passed Gate 的 `Unlock evidence` 使用 `<history-path>@<gate-passed-event-id>#<event-hash>`。
- 后继 Gate 激活时复用直接前驱的 `Unlock evidence`。

## Current Checkpoint

存在当前 Gate 时：

```markdown
## Current Checkpoint

- Gate: `G2: <名称>`
- History: `goal/history/G2.md`
- History head: `<tail-hash>`
- Last event: `G2-E0012`
- Last completed slice: `S8`
- Current slice: `S9`
- Satisfied exits: `E1, E2`
- Manual acceptance: `none`
- Blocker: `none`
- Risks: `<压缩后的当前风险或 none>`
- Next action: `<一个明确动作>`
```

约束：

- `Last event` 必须等于当前 history 的 tail event，而不仅仅是“存在于 history”。
- `History head` 必须等于 tail event 的 `Event hash`。
- `Satisfied exits` 必须与当前 history 的 effective evidence 精确一致；`all` 等价于计划中全部 Exit，不能绕过 evidence 校验。
- pending manual acceptance 必须与 history 中唯一未解决的 acceptance id 一致。
- checkpoint 只保存继续执行需要的压缩事实，不复制事件正文。

人工验收 pending 时：

```markdown
- Manual acceptance: `pending G2-A1`
- Next action: `wait for explicit result for G2-A1`
```

blocked 时必须有非空 `Blocker`；恢复时必须先追加 `resumed` event，再把 Ledger 改回 `active` 并清空 Blocker。

完成态：

```markdown
- Gate: `none`
- History: `none`
- History head: `<最后 Gate 的 gate-passed hash>`
- Last event: `<最后 Gate 的 gate-passed event id>`
- Last completed slice: `none`
- Current slice: `none`
- Satisfied exits: `all`
- Manual acceptance: `none`
- Blocker: `none`
- Risks: `none`
- Next action: `effort complete`
```

## 稳定 checkpoint 与 Goal 结束

稳定且已验证的 slice 完成后，如果下一 slice 不适合在当前 Goal 的剩余上下文或工具预算中完整完成，使用 control script 追加 `checkpoint` event、刷新 runbook 并运行 validator。validator 通过后当前 Goal 可以成功结束，Gate 保持 `active`。后续 Goal 从该 checkpoint 开始，不需要加载完整 history。

## 状态写入与事务恢复

所有运行态修改使用 `scripts/goal_loop_ctl.py`。脚本：

1. 校验当前控制面；
2. 校验 `--expected-revision`；
3. 对 history / runbook / baseline 等目标文件生成完整目标字节；
4. 写入 `goal/.goal-loop-transaction.json`；
5. 使用原子文件替换写入目标内容；
6. 运行 validator；
7. 成功后删除 transaction journal；失败则恢复操作前字节。

如果宿主在多文件提交过程中中断，validator 会报告 pending transaction。运行：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py recover <effort-path>
```

恢复命令会先尝试完成 transaction 并验证；目标状态无效时恢复操作前状态。

## Gate 通过

`pass-gate` 操作负责：

1. 确认当前 Gate 为 `active`，没有 pending manual acceptance，并且所有 Exit 都有 effective evidence；
2. 追加最终 `verification` event；
3. 追加唯一的 `gate-passed` event，并完整映射 Exit evidence；
4. 把当前 Ledger 行改为 `passed`，写入 event locator 与 History head；
5. 有直接后继时创建其 `initialized` history、把后继改为 `active`、重建 checkpoint；没有后继时写 effort complete；
6. Revision 增加 1，完成 transaction 并运行 validator；
7. 当前 Goal 结束，不执行后继 Gate。

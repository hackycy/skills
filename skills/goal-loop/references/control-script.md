# Goal Loop Control Script

`scripts/goal_loop_ctl.py` 是运行态文件的唯一写入入口。模型负责判断事实和下一动作；脚本负责 event id、hash chain、Revision、Ledger/checkpoint 写入、transaction 和最终验证。

## Revision

runbook 包含：

```markdown
Revision: `<非负整数>`
```

除 `bootstrap` / `recover` 外，每个 mutation command 都要求：

```text
--expected-revision <当前 Revision>
```

Revision 不匹配时拒绝写入。成功 mutation 将 Revision 增加 1。

## Commands

### bootstrap

从已经验证的 `implementation-plan.md` 创建 Contract Baseline、Revision 0 runbook、G0 initialized history 和固定 prompt：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py bootstrap <effort-path>
```

已有 `goal/runbook.md` 时拒绝覆盖。

### record

记录普通执行事实：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py record <effort-path> \
  --expected-revision <n> \
  --type slice \
  --slice S3 \
  --changed "src/a.ts" \
  --verification "directed=PASS" \
  --result "<可观察结果>" \
  --satisfies "E1" \
  --next-action "<明确动作>"
```

`--type` 支持 `slice`、`verification`、`failure`、`checkpoint`、`rollback`。

稳定 slice 后需要结束当前 Goal 时使用 `--type checkpoint`。checkpoint 不改变 Gate 状态。

### correct

修正旧 event：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py correct <effort-path> \
  --expected-revision <n> \
  --corrects G2-E0008 \
  --evidence-effect invalidate \
  --result "<具体修正>" \
  --next-action "<明确动作>"
```

`Evidence effect` 为 `retain` 或 `invalidate`。`invalidate` 使被引用 event 不再计入 effective Exit evidence。

### block / resume

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py block <effort-path> \
  --expected-revision <n> \
  --blocker "<命中的 Stop condition>" \
  --next-action "<恢复条件>"
```

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py resume <effort-path> \
  --expected-revision <n> \
  --result "<阻塞如何解除>" \
  --next-action "<恢复后的动作>"
```

`resume` 只能从 `blocked` 执行。

### manual-handoff / manual-result

`manual-handoff` 生成稳定 acceptance id 并把 checkpoint 设为 pending；Gate 保持 `active`。`manual-result` 必须引用该 acceptance id，并清除 pending 状态。

### pass-gate

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py pass-gate <effort-path> \
  --expected-revision <n> \
  --verification "<最终验证证据>"
```

只有当前 Gate 全部 Exit 都有 effective evidence 且不存在 pending manual acceptance 时允许执行。脚本追加最终 verification 与唯一 gate-passed event，更新当前 Gate，激活直接后继或写 effort complete，然后运行 validator。

### reconcile-baseline

详见 [`contract-baseline-schema.md`](contract-baseline-schema.md)。

### recover

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py recover <effort-path>
```

存在 `goal/.goal-loop-transaction.json` 时，recover 先应用 transaction 目标字节并验证；目标无效时恢复操作前字节。

## Transaction

mutation 写入多个文件时：

1. 读取并验证当前控制面；
2. 检查 Revision；
3. 计算所有目标文件完整字节；
4. 在 `goal/.goal-loop-transaction.json` 保存操作前字节和目标字节；
5. 对目标文件执行原子替换；
6. 使用允许 transaction journal 存在的内部模式运行 validator；
7. 验证成功后删除 journal；
8. 验证失败时恢复操作前字节并删除 journal。

公共 validator 发现残留 transaction journal 时必须失败，防止 Agent 在不一致状态继续实施 Gate。

# Goal Loop Control Script

`scripts/goal_loop_ctl.py` 是运行态文件的唯一写入入口。模型负责语义判断；脚本负责 Revision、event id、hash chain、Verification ID 约束、Repository command 执行、evidence snapshot、Ledger/checkpoint、transaction 和最终验证。

## 只读命令

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py status <effort-path>
python3 <skill-dir>/scripts/goal_loop_ctl.py context <effort-path>
```

`status` 输出 Revision、当前 Gate、人工验收、Satisfied exits、Next action 和 stale checks。`context` 输出 checkpoint、Contract Sources 路径和当前 Gate contract，不读取 passed Gate history。

## bootstrap

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py bootstrap <effort-path>
```

创建 Contract Baseline、Revision 0 runbook、G0 history 和固定 prompt。已有 `goal/runbook.md` 时拒绝覆盖。

## verify-directed

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py verify-directed <effort-path> \
  --expected-revision <n> \
  --check D1 \
  --outcome pass \
  --verification "<观察方式>" \
  --result "<可观察事实>" \
  --next-action "<明确动作>"
```

只接受当前 Gate 声明的 Directed check，并保存 Evidence inputs snapshot。

## verify-repository

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py verify-repository <effort-path> \
  --expected-revision <n> \
  --check R1 \
  --next-action "<明确动作>"
```

脚本从 plan 读取 R1 Command，在仓库根目录执行，记录 exit code，并保存 stdout/stderr artifact。调用者不能替换 command。

## manual-handoff / manual-result

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py manual-handoff <effort-path> \
  --expected-revision <n> --acceptance M1 --result "ready for M1"

python3 <skill-dir>/scripts/goal_loop_ctl.py manual-result <effort-path> \
  --expected-revision <n> --acceptance G2-M1 --outcome pass \
  --result "accepted" --next-action "pass Gate"
```

## block / resume

`block` 必须引用当前 Gate 声明的 Stop condition id：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py block <effort-path> \
  --expected-revision <n> --condition SC1 --next-action "restore dependency"
```

恢复条件满足后使用 `resume`。

## pass-gate

`pass-gate` 要求 required checks 全部 latest effective result 为 pass、没有 unresolved manual acceptance、每个 passing check 的 Evidence snapshot 与当前 Evidence inputs 一致。满足条件后记录完整 `Check@Event` 映射，只激活直接后继。

## reconcile-baseline

只在 `implementation-plan.md` 内容和 Contract Sources 路径集合都未变化、并明确确认现有 Gate 合同仍有效时使用：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py reconcile-baseline <effort-path> \
  --expected-revision <n> --confirm-plan-valid \
  --reason "<合同为什么仍有效>" --next-action "<明确动作>"
```

## Transaction 与 recover

mutation 先写 `goal/.goal-loop-transaction.json`，再原子替换目标文件并运行 validator。journal 同时保存 before/after bytes 和 SHA-256。`recover` 会先验证 journal path、base64 和 bytes hash，再尝试完成目标状态；目标状态无效时恢复操作前状态。

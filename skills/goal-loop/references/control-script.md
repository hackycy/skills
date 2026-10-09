# Goal Loop Control Script

`scripts/goal_loop_ctl.py` 是运行态文件的唯一写入入口。模型负责语义判断；脚本负责 Revision、Verification ID、Repository command、evidence fingerprint、Ledger/checkpoint、transaction 和最终验证。

所有修改命令携带 `--expected-revision <n>`。成功后重新读取 Revision。支持命令为 `bootstrap`、`status`、`context`、`validate`、`recover`、`record`、`check start`、`check finish`、`check run`、`check cancel`、`block`、`resume`、`pass-gate`、`revise-contract`。

## 只读与初始化

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py bootstrap <effort-path>
python3 <skill-dir>/scripts/goal_loop_ctl.py status <effort-path>
python3 <skill-dir>/scripts/goal_loop_ctl.py context <effort-path>
python3 <skill-dir>/scripts/goal_loop_ctl.py validate <effort-path>
```

bootstrap 创建 baseline、Revision 0 runbook、G0 history 和固定 prompt；只激活 G0，拒绝已有运行目录。status/context 提供当前 checkpoint 与当前 Gate 合同。默认不读取 passed Gate history。

## Slice

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py record <effort-path> \
  --expected-revision <n> --kind slice --slice S1 \
  --files "src/app.py, tests/test_app.py" --changed "新增输入校验" \
  --result "D1 与 R1 通过" --last-completed-slice S1 --current-slice S2 \
  --next-action "实现空值分支"
```

`--kind` 只接受 `slice`、`checkpoint`、`failure`。history 追加简短记录，checkpoint 被替换；已经解决的调试过程不继续写入 checkpoint。

## Checks

Directed check 固定输入后记录明确结果：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py check start <effort-path> \
  --expected-revision <n> --kind Directed --check D1 --result "开始检查" --next-action "完成 D1"
python3 <skill-dir>/scripts/goal_loop_ctl.py check finish <effort-path> \
  --expected-revision <n> --kind Directed --check D1 --outcome pass \
  --result "观察到合同要求的行为" --next-action "执行 R1"
```

Repository check 从计划读取命令，在仓库根目录执行，保存结果摘要与 exit code。标准输出和错误仅向当前命令输出最多 4 KiB，不写入运行目录。

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py check run <effort-path> \
  --expected-revision <n> --check R1 --timeout 300 --next-action "检查 Exit"
```

Manual acceptance 使用 `check start --kind "Manual acceptance" --check M1` 固定受验对象、入口、自动检查与最小清单。当前 Goal 随即结束。收到对应 `G<n>-M<n>` 的明确结果后使用：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py check finish <effort-path> \
  --expected-revision <n> --kind "Manual acceptance" --check M1 \
  --acceptance G0-M1 --outcome pass --result "用户明确接受" --next-action "检查 Exit"
```

等待人工验收时 Gate 保持 active，不使用 blocked，不轮询。`check cancel` 终止待检查记录。输入 fingerprint 改变后必须重新检查。

## 状态转换

`block --condition SC<n>` 只接受合同声明的 Stop condition。`resume --result <摘要> --next-action <动作>` 解除阻塞。普通测试失败保持 active 并进入修复。

`pass-gate` 要求全部 Exit 的 checks 最新结果为 pass、fingerprint 新鲜且无 pending manual acceptance。通过后只激活直接后继，结束当前 Goal。最后一个 Gate 通过后报告 effort complete。

## 合同修订与恢复

`revise-contract` 的 preview/commit 流程见 [合同修订](contract-revisions.md)。`recover` 只完成或清理未完成的控制面 transaction，不恢复代码、不重跑检查、不回退工作区。详见 [存储与恢复](storage-and-recovery.md)。

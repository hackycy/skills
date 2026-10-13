# Goal Loop Control Script

`scripts/goal_loop_ctl.py` 是运行态文件的唯一写入入口。模型负责语义判断；脚本负责 Revision、Verification ID、Repository command、evidence fingerprint、Ledger/checkpoint、transaction 和最终验证。

所有修改命令携带 `--expected-revision <n>`。成功输出包含新 Revision，直接用于下一次写入；只有冲突或需刷新状态时才重新读取。支持命令为 `bootstrap`、`status`、`context`、`validate`、`recover`、`record`、`check start`、`check finish`、`check run`、`check cancel`、`block`、`resume`、`pass-gate`、`revise-contract`。

## 只读与初始化

```bash
python3 -X utf8 "<skill-dir>/scripts/goal_loop_ctl.py" bootstrap "<effort-path>"
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" status "<effort-path>"
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" context "<effort-path>"
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" validate "<effort-path>"
```

bootstrap 创建 baseline、Revision 0 runbook、G0 history、固定 prompt，以及 `goal_loop_ctl.py` / `validate_goal_loop.py` 的固定副本；只激活 G0，拒绝覆盖已有 runbook。bootstrap 使用 skill 内脚本，之后使用生成 prompt 的解释器和 effort 本地路径（Windows 通常为 `python`，上例为 `python3`）。

正常启动只运行 `context`：一次校验 transaction、baseline、运行记录，输出 Revision、active/blocked/complete 状态、checkpoint、过期检查、共享规则和当前 Gate 合同。校验失败时只输出错误，停止实现。`status` 用于执行中按需刷新简短状态；`validate` 用于专项诊断，不作为重复的启动步骤。

`context` 每页最多 4,000 个字符（UTF-8 正文最多 16 KB，另有短页头/页尾）。agent 按 `Next page: context --offset <n>` 使用同一 effort 继续读取，直到 `Context complete`，期间 Revision 改变则从头读取。分页无状态，不写文件、不生成下一轮 prompt。保留全部合同而非静默截断；字段再长也受同一页大小约束。

脚本校验 history 的磁盘读取不会把历史正文交给模型。普通 context 不输出 history；agent 仅在诊断具体问题时读取相关片段。两个 Python 入口统一输出 UTF-8。

## Slice

```bash
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" record "<effort-path>" \
  --expected-revision <n> --kind slice --slice S1 \
  --files "src/app.py, tests/test_app.py" --changed "新增输入校验" \
  --result "D1 与 R1 通过" --last-completed-slice S1 --current-slice S2 \
  --next-action "实现空值分支"
```

`--kind` 只接受 `slice`、`checkpoint`、`failure`。history 追加简短记录，checkpoint 被替换；已经解决的调试过程不继续写入 checkpoint。保存后继续下一 slice，直到 Gate 通过、等待人工验收、触发 Stop condition 或确需中断交接。

## Checks

Directed check 固定输入后记录明确结果：

```bash
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" check start "<effort-path>" \
  --expected-revision <n> --kind Directed --check D1 --result "开始检查" --next-action "完成 D1"
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" check finish "<effort-path>" \
  --expected-revision <n> --kind Directed --check D1 --outcome pass \
  --result "观察到合同要求的行为" --next-action "执行 R1"
```

Repository check 从计划读取命令，在仓库根目录执行，保存结果摘要与 exit code。标准输出和错误各输出末尾最多 4 KiB，不写入运行目录。

```bash
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" check run "<effort-path>" \
  --expected-revision <n> --check R1 --timeout 300 --next-action "检查 Exit"
```

Manual acceptance 使用 `check start --kind "Manual acceptance" --check M1` 固定受验对象、入口、自动检查与最小清单。当前 Goal 随即结束。收到对应 `G<n>-M<n>` 的明确结果后使用：

```bash
python3 -X utf8 "<effort-path>/goal/goal_loop_ctl.py" check finish "<effort-path>" \
  --expected-revision <n> --kind "Manual acceptance" --check M1 \
  --acceptance G0-M1 --outcome pass --result "用户明确接受" --next-action "检查 Exit"
```

等待人工验收时 Gate 保持 active，不使用 blocked，不轮询。`check cancel` 终止待检查记录。输入 fingerprint 改变后必须重新检查。

## 状态转换

`block --condition SC<n>` 只接受合同声明的 Stop condition。`resume --result <摘要> --next-action <动作>` 解除阻塞。普通测试失败保持 active 并进入修复。

`pass-gate` 要求全部 Exit 的 checks 最新结果为 pass、fingerprint 新鲜且无 pending manual acceptance。通过后只激活直接后继，结束当前 Goal。最后一个 Gate 通过后报告 effort complete。

## 合同修订与恢复

`revise-contract` 的 preview/commit 流程见 [合同修订](contract-revisions.md)。`recover` 只完成或清理未完成的控制面 transaction，不恢复代码、不重跑检查、不回退工作区。详见 [存储与恢复](storage-and-recovery.md)。

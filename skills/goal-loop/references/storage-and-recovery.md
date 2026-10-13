# 存储与恢复

bootstrap 创建以下文件：

```text
<effort>/
  implementation-plan.md
  goal/
    contract-baseline.json
    runbook.md
    prompt.md
    goal_loop_ctl.py
    validate_goal_loop.py
    history/G0.md
```

后续 Gate 通过后才创建对应的 `history/G<n>.md`。不会创建 `goal/commits/`、`goal/objects/`、`goal/spool/`、`goal/state.json`、`goal/evidence/` 或 `goal/history/effort.md`。不支持的运行目录只报告格式问题并保留原文件。

两个脚本副本与固定 prompt 在首次 bootstrap 的同一 transaction 中保存，正常执行不需要读取 skill。它们不是运行状态，不随 Revision 更新。validator 同时接受 prompt-v2 和 prompt-v3；普通接续命令不重写 prompt。

用户明确要求 prompt-v2 → prompt-v3 升级时，`upgrade` 在同一 transaction 中保存 `goal/backup-v2/` 备份、替换 `goal/prompt.md` 并安装两个脚本。备份只包含被替换的 prompt 和原本存在的脚本。计划、baseline、runbook、Revision 和 history 均保留，不重新 bootstrap。备份已存在且入口仍为 v2 时停止并报告，不覆盖备份；入口已为 v3 且脚本齐全时重复调用不写文件。

`.goal-loop.lock` 和 `.goal-loop-transaction.json` 只用于进程协调，成功后 transaction 删除。锁文件、transaction 和 Python 的 `__pycache__/` 应加入忽略规则，不作为 Git 运行记录。

## Transaction

多文件控制面写入先创建 transaction journal，再原子替换文件并运行 validator。journal 包含路径、before/after bytes 和 SHA-256，供 `recover` 校验。recover 只完成或清理控制面写入，不恢复代码、不重跑检查、不回滚工作区。

## 责任边界

Goal Loop 维护 Gate 顺序、唯一当前 Gate、跨 Goal checkpoint、必要检查结果和最小历史。Git 负责用户代码的提交、版本和回退。Goal Loop 不创建、修改或把 Git commit 当作状态，不保存代码回滚方案，也不提供抗篡改审计能力。

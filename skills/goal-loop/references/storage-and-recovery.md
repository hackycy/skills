# 存储与恢复

新 effort 只维护：

```text
<effort>/
  implementation-plan.md
  goal/
    contract-baseline.json
    runbook.md
    prompt.md
    history/G0.md
```

后续 Gate 通过后才创建对应的 `history/G<n>.md`。不会创建 `goal/commits/`、`goal/objects/`、`goal/spool/`、`goal/state.json`、`goal/evidence/` 或 `goal/history/effort.md`。旧目录统一报告不支持的运行目录，用户重新 bootstrap。

`.goal-loop.lock` 和 `.goal-loop-transaction.json` 只用于进程协调，成功后 transaction 删除。锁文件和 transaction 应加入忽略规则，不作为 Git 运行记录。

## Transaction

多文件控制面写入先创建 transaction journal，再原子替换文件并运行 validator。journal 包含路径、before/after bytes 和 SHA-256，供 `recover` 校验。recover 只完成或清理控制面写入，不恢复代码、不重跑检查、不回滚工作区。

## 责任边界

Goal Loop 维护 Gate 顺序、唯一当前 Gate、跨 Goal checkpoint、必要检查结果和最小历史。Git 负责用户代码的提交、版本和回退。Goal Loop 不创建、修改或把 Git commit 当作状态，不保存代码回滚方案，也不提供抗篡改审计能力。

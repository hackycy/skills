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

两个脚本副本与固定 prompt 在首次 bootstrap 的同一 transaction 中保存，正常执行不需要读取 skill。它们是执行材料，不随 Revision 更新；普通接续命令不重写 prompt。校验器检查入口文件可读且非空，规则语义由 agent 审阅，不将某版提示词措辞当成数据合同。

用户要求优化执行材料时，`refresh` 在同一 transaction 中保存 `goal/backups/refresh-<timestamp>-<id>/` 备份、替换审阅后的 `goal/prompt.md` 并安装两个脚本。只备份实际被替换的已有文件；内容相同则不写文件，不同刷新使用独立备份。计划、baseline、Revision 和 history 保留。已有完整快照的 runbook 原字节保留；缺少快照时兼容读取相关历史并补齐当前事实，原 runbook 一起备份。

Runbook 中的 Current Checks 只保存当前 Gate 每项检查的最新状态。快照完整时，正常执行与校验不解析历史；缺少快照时，兼容读取只查恢复当前事实所需的历史。无法可靠还原则报告具体缺口。旧格式标识由兼容读取处理，不要求重写全部资料或按版本迁移。

`.goal-loop.lock` 和 `.goal-loop-transaction.json` 只用于进程协调，成功后 transaction 删除。锁文件、transaction 和 Python 的 `__pycache__/` 应加入忽略规则，不作为 Git 运行记录。

## Transaction

多文件控制面写入先创建 transaction journal，再原子替换文件并运行 validator。journal 包含路径、before/after bytes 和 SHA-256，供 `recover` 校验。recover 只完成或清理控制面写入，不恢复代码、不重跑检查、不回滚工作区。控制命令持有进程锁，已有命令执行期间不替换脚本或并发写状态；收到占用提示时等待该命令结束，再重读状态。

## 责任边界

Goal Loop 维护 Gate 顺序、唯一当前 Gate、跨 Goal checkpoint、必要检查结果和最小历史。Git 负责用户代码的提交、版本和回退。Goal Loop 不创建、修改或把 Git commit 当作状态，不保存代码回滚方案，也不提供抗篡改审计能力。

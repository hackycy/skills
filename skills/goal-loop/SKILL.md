---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为按 Gate 执行的轻量 Goal Loop 控制面。
disable-model-invocation: true
---

# Goal Loop

Goal Loop 维护 Plan 的 Gate 顺序、唯一当前 Gate、跨 Goal checkpoint、必要的 Directed/Repository/Manual 检查，以及每个已激活 Gate 的简短 history。Git 负责代码提交、版本和代码回退；Goal Loop 不创建、修改或回滚 Git commit，也不把代码回滚作为运行状态。

初始化前读取已收敛的 map、ADR、spec 或 implementation plan，以及适用的 `AGENTS.md`、`CLAUDE.md` 和 Contract Sources。未解决的产品决策、缺失链接、`TBD` 或 open question 不能由经验补齐。

## 控制面文件

```text
<effort>/
  implementation-plan.md
  goal/
    contract-baseline.json
    runbook.md
    prompt.md
    history/
      G0.md
      G1.md
```

bootstrap 只创建 G0 history，后续 Gate 通过时创建直接后继 history。不创建 `commits/`、`objects/`、`spool/`、`state.json`、`evidence/` 或 `history/effort.md`。发现这些旧目录时报告“不支持的运行目录，请重新 bootstrap”，不做迁移或兼容读取。

`runbook.md` 是当前状态权威来源，Revision 只用于并发写入检查。checkpoint 每次替换，保存当前 Gate、slice、每个检查最新状态、Exit、Manual acceptance、Blocker、Risks、Next action 和合同修订摘要。`history/G<n>.md` 只保存 slice、修改文件、检查结果、失败修复摘要、风险、交接和 Gate pass 事实，不保存 hash chain、完整输出、完整文件清单或对象引用。

## 合同与执行

计划 Gate 必须包含 Purpose、Inputs、Objective、Scope boundary、Constraints、Slice policy、Verification、Evidence rule、Stop conditions 和 Exit conditions；不包含 rollback 字段。检查 ID 为 `D<n>`、`R<n>`、`M<n>`，Evidence rule 只引用当前 Gate 的检查。

固定入口和控制命令详见：

- [控制脚本](references/control-script.md)
- [计划合同](references/implementation-plan-schema.md)
- [runbook](references/runbook-schema.md)
- [history](references/history-schema.md)
- [合同 baseline](references/contract-baseline-schema.md)
- [合同修订](references/contract-revisions.md)
- [存储与恢复](references/storage-and-recovery.md)
- [固定 prompt](references/goal-prompt-template.md)

固定 prompt 要求先运行 `status`、`context`，锁定当前 Gate；默认不读取 passed Gate history。普通测试失败进入修复和重验；只有合同声明的 Stop condition 才进入 `blocked`。Manual acceptance pending 时结束当前 Goal，不轮询；下一轮收到明确结果后使用 `check finish`。

证据新鲜度通过稳定 fingerprint 表示：按相对路径和文件 SHA-256 排序后计算单一摘要，并记录匹配文件数量。fingerprint 变化时检查 stale，必须重新验证。Repository 命令输出只向当前命令输出最多 4 KiB，不写入 `goal/`。

## 验证

使用 `python3 scripts/validate_goal_loop.py <effort-path>` 检查计划、baseline、runbook、history、prompt、Gate 线性状态和 pending transaction。`recover` 只恢复控制面 transaction，不恢复代码、不重跑检查、不回滚工作区。

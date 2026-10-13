---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为按 Gate 执行的轻量 Goal Loop 控制面。
disable-model-invocation: true
---

# Goal Loop

用户初始化一次，保存并反复发送同一份固定 prompt，直到 effort 完成。agent 在启动后读取状态并执行控制命令；用户无需选择 Gate、查询 Revision 或获取下一轮 prompt。一个 Goal 可以连续完成多个 slice，Gate 通过后本轮结束。

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
    goal_loop_ctl.py
    validate_goal_loop.py
    history/
      G0.md
      G1.md
```

bootstrap 只创建 G0 history，后续 Gate 通过时创建直接后继 history。同时固定控制脚本及 validator 副本，prompt 指向 effort 内的准确入口，普通执行不依赖 skill 安装路径。不创建 `commits/`、`objects/`、`spool/`、`state.json`、`evidence/` 或 `history/effort.md`。

初始化后验证生成入口能在目标仓库根目录执行，并完整交付 `goal/prompt.md` 正文。普通接续保留已有 effort 的记录、脚本和固定 prompt。用户明确要求 prompt-v2 → prompt-v3 升级时，按[控制脚本](references/control-script.md)的 `upgrade` 流程在原目录安装入口、备份并替换固定正文，保留执行进度；不重新 bootstrap。不支持的运行格式只报告问题并保留文件。

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

固定 prompt 只需一次 `context` 获取已校验状态与当前 Gate 合同。长内容由 agent 分页读取；默认不读取 passed Gate history。稳定 slice 保存 checkpoint 后继续当前 Gate，slice 本身不结束 Goal。普通测试失败进入修复和重验；只有合同声明的 Stop condition 才进入 `blocked`。Manual acceptance pending 时结束当前 Goal，不轮询；下一轮收到明确结果后使用 `check finish`。

证据新鲜度通过稳定 fingerprint 表示：按相对路径和文件 SHA-256 排序后计算单一摘要，并记录匹配文件数量。fingerprint 变化时检查 stale，必须重新验证。Repository 命令的 stdout/stderr 各输出末尾最多 4 KiB，不写入 `goal/`。

## 验证

维护时使用 `python3 <skill-dir>/scripts/validate_goal_loop.py <effort-path>` 检查计划、baseline、runbook、history、prompt、Gate 线性状态和 pending transaction。执行态使用固定 prompt 中的 effort 本地入口。`recover` 只恢复控制面 transaction，不恢复代码、不重跑检查、不回滚工作区。

脚本回归验证：在本仓库根目录运行 `python -m unittest discover -s skills/goal-loop/tests`。

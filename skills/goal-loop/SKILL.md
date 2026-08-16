---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为 Gate 计划、状态账本和跨轮复用的固定执行提示词。
disable-model-invocation: true
---

# Goal Loop

把决策文档编译成三层工件：

- `implementation-plan.md`：稳定的 Gate 合同，回答做什么、边界是什么、如何验证和何时停止。
- `goal-runbook.md`：唯一的执行状态与证据账本，只回答当前执行到哪里、已有何种证据。
- `goal-prompt.md`：方便人工复制的固定入口，只指向前两份文档；不绑定 Gate，也不重复合同。

本 skill 只建立或验证执行控制面，不实施 Gate，不重做已批准决策。

## 定位输入

用户提供 effort 目录、`map.md`、ADR/spec 或已有 `implementation-plan.md`。解析 Git 仓库根目录并定位 effort；无法唯一定位时停止，列出检查过的路径。

读取适用的 `CLAUDE.md`、`AGENTS.md`、`CONTEXT.md` / `CONTEXT-MAP.md`，以及 effort 中的 map、spec、implementation plan 和它们链接的本地 ADR、decision、issue 与验收依赖。`CONTEXT.md` 只提供术语和领域事实，不单独产生 Gate。

支持两种已收敛入口：

- **Decision-only**：Gate、范围、验证和 Exit 能从已接受 ADR、spec 或已解决 issue 得到。
- **Wayfinder**：map 的 `Not yet specified` 为空或明确为“无”，参与执行顺序和验收的 decision 全部已解决。

本地决策链接缺失、ADR 未接受、decision 未解决，或文档仍有 `TBD`、`TODO`、open question、pending decision 时停止，逐项报告缺口。不得用经验补齐产品决定、验收政策或回退边界。

## 编译计划

若 `implementation-plan.md` 不存在，完整读取 [`references/implementation-plan-schema.md`](references/implementation-plan-schema.md)，从已收敛决策生成计划。若已存在，只读取和验证，不覆盖。

计划独占所有稳定 Gate 合同：Objective、Inputs、Scope boundary、Constraints、Slice policy、Verification、Evidence rule、Stop conditions、Rollback 和 Exit conditions。项目命令与技术约束只写入计划，不进入固定 prompt。

若旧计划包含 `Current Execution State`，初始化 runbook 时可以导入一次；Gate 名称、顺序和状态必须一致，`passed` / `blocked` 必须已有对应证据。导入后不再更新计划。

## 编译或验证账本

完整读取 [`references/runbook-schema.md`](references/runbook-schema.md)。

`goal-runbook.md` 不存在时：

1. 从计划读取 Gate 编号、名称、依赖和合同位置。
2. 写入源码基线、唯一 Goal Ledger 和每个 Gate 的 Progress Log。
3. 没有可导入状态时只将 G0 标为 `active`，其余标为 `planned`。
4. 不复制计划中的 Objective、Constraints、Verification 或其它 Gate 合同。

`goal-runbook.md` 已存在时：

1. 对比源码路径集合和 SHA-256；计划或决策漂移时保持账本原样并停止。
2. 验证 Gate 顺序、计划引用、严格线性依赖、状态机和 Progress Log 证据。
3. 账本只能呈现 `passed* active planned*`、`passed* blocked planned*` 或 `passed+`。

计划是合同的唯一来源；账本是状态和证据的唯一来源。两者不得相互复制字段或双写状态。

## 人工验收与运行时暂停

人工验收有两套必须同时成立、但不能混写的状态：

- `goal-runbook.md` 中当前 Gate 保持 `active`。用户尚未确认时，Gate 没有通过，也不应被伪装成 `blocked` 或 `passed`。
- 运行时 Goal 进入 `waiting_for_user`。这是宿主的暂停状态，不是 Goal Ledger 的 Gate 状态；暂停期间不得开启新的自动续跑轮次、调用工具或轮询等待。

固定 prompt 必须在请求验收后发出一次可识别的暂停事件（例如 `goal-loop: waiting_for_user`），并交给宿主提供的 user-input / pause 控制机制。恢复条件必须是用户新的、明确的确认消息；确认、拒绝和补充问题不能由模型自行推断。

如果宿主没有可暂停并在用户输入后恢复的运行时能力，goal-loop 无法仅靠提示词解决这个问题。此时应报告“宿主缺少 `waiting_for_user` 控制”，结束当前响应，不得用 sleep、工具轮询、重复询问或立即 `complete` / `blocked` 来伪造暂停。平台侧应补充一等的 `waiting_for_user` 状态（或等价的 `pause_goal` / `request_user_input` 原语）；在该原语存在前，不应向自动 Goal 发放包含人工验收的执行授权。

## 写入固定 prompt

完整读取 [`references/goal-prompt-template.md`](references/goal-prompt-template.md)，只替换 `{{EFFORT_PATH}}`，写入或替换 `goal-prompt.md`。

固定 prompt 必须：

- 在同一 effort 的所有 Gate 中保持完全相同；
- 不出现 G0/G1 等具体 Gate、Gate 名称或 Objective；
- 不展开 Inputs、Constraints、Verification、Stop conditions、Rollback 或 Exit conditions；
- 保留跨项目稳定的执行循环和行为约束：最小 slice、范围控制、验证失败闭环、职责分片、保留无关实现、不弱化测试、人工验收暂停和禁止 push；
- 要求在 Goal 启动时锁定当前唯一 active Gate，并只执行该 Gate；人工验收时请求用户确认并强制暂停；Gate 通过后将当前 Gate 标为 `passed`、直接后继标为 `active`，汇总证据并显式结束整个 Goal，不得把后继 Gate 纳入同一 Goal。

`goal-prompt.md` 是可删除、可重建的复制便利文件。它不属于源码基线，不被计划或 runbook 引用，也不参与状态验证。

最终回复说明是编译还是验证，给出计划、runbook 和固定 prompt 的路径，并输出 prompt 内容。只优化工件时不得实施 Gate。

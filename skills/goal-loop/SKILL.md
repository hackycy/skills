---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为 Gate 合同、精确合同输入基线、可恢复运行账本、按 Gate 归档的证据历史和跨轮复用的固定执行提示词。
disable-model-invocation: true
---

# Goal Loop

把已收敛的决策文档编译成长期 Agent 执行控制面。Gate 是执行边界和上下文压缩边界；稳定 slice 也可以成为跨 Goal 的恢复边界。模型判断语义事实，控制脚本负责运行态写入和状态转换。

生成五类工件：

- `implementation-plan.md`：稳定 Gate 合同；
- `goal/contract-baseline.json`：合同输入文件及 SHA-256；
- `goal/runbook.md`：唯一当前状态、Revision、Goal Ledger 和压缩 checkpoint；
- `goal/history/G<n>.md`：按 Gate 分离、带 event hash chain 的 append-only 证据历史；
- `goal/prompt.md`：跨 Gate 固定执行入口。

本 skill 只建立、恢复、reconcile 或验证执行控制面，不实施 Gate，不重做已经批准的产品决策。

## 定位与收敛条件

用户提供 effort 目录、`map.md`、ADR/spec 或已有 `implementation-plan.md`。解析 Git 仓库根目录并唯一定位 effort；无法唯一定位时停止并列出检查过的路径。

读取适用的 `CLAUDE.md`、`AGENTS.md`、`CONTEXT.md` / `CONTEXT-MAP.md`，以及 effort 中的 map、spec、implementation plan 和它们链接的本地 ADR、decision、issue 与验收依赖。`CONTEXT.md` 只提供术语和领域事实，不单独产生 Gate。

支持两种已收敛入口：

- **Decision-only**：Gate、范围、验证和 Exit 能从已接受 ADR、spec 或已解决 issue 得到；
- **Wayfinder**：map 的 `Not yet specified` 为空或明确为“无”，参与执行顺序和验收的 decision 全部已解决。

本地决策链接缺失、ADR 未接受、decision 未解决，或仍有 `TBD`、`TODO`、open question、pending decision 时停止并逐项报告缺口。不得用经验补齐产品决定、验收政策或回退边界。

## 编译 implementation plan

若 `implementation-plan.md` 不存在，完整读取 [`references/implementation-plan-schema.md`](references/implementation-plan-schema.md) 并从已收敛决策生成计划。若已存在，只读取和验证，不覆盖。

计划必须包含 `Contract Sources`，精确列出实际参与 Gate 合同形成的仓库文件。Gate 合同独占 Purpose、Inputs、Objective、Scope boundary、Constraints、Slice policy、Verification、Evidence rule、Stop conditions、Rollback 和 Exit conditions。Exit id 在 Gate 内从 `E1` 连续编号，Evidence rule 必须逐项覆盖。

项目命令和技术约束只写入计划，不进入固定 prompt。

文档、UI 文案、脚本输出和最终回复直接描述具体结构、行为或可观察结果。不得因重构使用“新布局”“新结构”“新版”等相对名称；说明差异时明确文件、字段、状态或行为以及具体变化。

## 编译执行控制面

完整读取：

- [`references/runbook-schema.md`](references/runbook-schema.md)
- [`references/history-schema.md`](references/history-schema.md)
- [`references/contract-baseline-schema.md`](references/contract-baseline-schema.md)
- [`references/control-script.md`](references/control-script.md)
- [`references/goal-prompt-template.md`](references/goal-prompt-template.md)

目录结构固定为：

```text
<effort>/
├── implementation-plan.md
└── goal/
    ├── contract-baseline.json
    ├── runbook.md
    ├── prompt.md
    └── history/
        ├── G0.md
        ├── G1.md
        └── ...
```

使用确定性 bootstrap：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py bootstrap <effort-path>
```

bootstrap 从 `Contract Sources + implementation-plan.md` 生成 baseline，创建 Revision `0` 的 runbook、G0 initialized history、History head 和固定 prompt，并在提交后运行 validator。不得手工计算 event hash、Revision 或 Gate 状态转换。

## Contract Baseline

每次执行前运行 validator。baseline 路径集合、每个合同输入文件哈希和 manifest 自身哈希必须一致。

漂移处理遵守 [`references/contract-baseline-schema.md`](references/contract-baseline-schema.md)：

- `implementation-plan.md` 内容变化：重新审查并编译 Gate 合同；
- Contract Sources 路径集合变化：重新审查并编译计划；
- 计划内容和路径集合均未变化：只有明确确认现有 Gate 合同仍有效后，才能使用 `reconcile-baseline` 刷新输入哈希。

漂移未解决前保持 Ledger 与 checkpoint 不变，不实施 Gate。

## 运行态只通过 control script 写入

`goal/runbook.md` 是热状态，不是日志；`goal/history/G<n>.md` 是冷历史。所有运行态修改使用 [`scripts/goal_loop_ctl.py`](scripts/goal_loop_ctl.py)，并携带当前 runbook Revision。陈旧 Revision 必须拒绝。

控制脚本负责 `record`、`correct`、`block` / `resume`、`manual-handoff` / `manual-result`、`pass-gate`、`reconcile-baseline` 与 `recover`。多文件操作使用 transaction journal；宿主中断留下 `goal/.goal-loop-transaction.json` 时，先执行 `recover`，不得继续 Gate 实现。

## 最小上下文加载

Goal 启动：

1. 读取 `goal/runbook.md`，锁定唯一 `active` Gate 和 Revision；`blocked` 时只处理恢复条件。
2. 运行 validator；pending transaction 或 Contract Baseline drift 优先处理。
3. 人工验收 pending 且没有明确结果时，只输出一次验收提醒并结束；不加载代码、Gate 细节或完整 history。
4. 否则读取当前 Gate contract、必要 Source Decisions、适用治理文件和 checkpoint 指向的代码入口。
5. 默认不读取 `goal/history/`；只在诊断、rollback、correction、人工验收结果、证据核验、baseline reconcile 或状态异常时按 event / Exit 引用读取必要片段。
6. passed Gate history 不默认加载。

正常启动上下文主要由 `runbook + 当前 Gate contract + 当前代码` 决定，而不是累计 slice 数。

## 稳定 slice checkpoint

Gate 不要求在一次 Goal 内执行完。完成一个稳定、可独立验证、可恢复的 slice 后，如果下一 slice 不适合在当前 Goal 的剩余上下文或工具预算中完整完成：

1. 完成本 slice 验证；
2. 使用 `record --type checkpoint` 持久化恢复点；
3. 让 checkpoint 只保留最近 event、slice 游标、effective satisfied exits、风险、人工验收状态和下一动作；
4. 运行 validator；
5. 以 Gate 仍为 `active` 的状态成功结束当前 Goal。

`checkpoint` 不是失败，也不是 `blocked`。

## append-only evidence

history 使用连续 event id、`Prev event hash` 和 `Event hash`；runbook Ledger 与 Current Checkpoint 保存 history tail hash。validator 重算 hash chain，并要求 `Last event == history tail`、`History head == tail hash`。

历史事实错误时追加 `correction`，不得改写旧 event。`Evidence effect: invalidate` 会使被修正 event 不再计入 effective Exit evidence。`Satisfied exits` 必须与 effective evidence 精确一致；`all` 不能绕过证据检查。

hash chain 用于发现控制面内部断链或未同步改写。需要抵抗能够同时重写全部控制文件的修改时，应使用 Git commit、只读存储或其他外部不可变锚点。

## Stop condition、人工验收与 Gate pass

`blocked` 只用于计划声明的 Stop condition；恢复必须通过 `resume` 追加 `resumed` event。

人工验收通过稳定 acceptance id 关联 handoff 与 result。等待期间 Gate 保持 `active`，当前 Goal 结束，不等待、不轮询、不自唤醒。

当前 Gate 的 effective evidence 覆盖全部 Exit 且没有 pending manual acceptance 后，使用 `pass-gate`。该操作追加最终 verification 和唯一 gate-passed event，记录完整 Exit evidence，把当前 Gate 改为 `passed`，只激活直接后继或写 effort complete，更新 History head / Revision，并运行 validator。操作完成后结束当前 Goal，不执行后继 Gate。

## 验证

生成、恢复、baseline reconcile 或任何人工修改后运行：

```bash
python3 <skill-dir>/scripts/validate_goal_loop.py <effort-path>
```

validator 检查 plan Contract Sources、Contract Baseline、固定 prompt、State Rules、Revision、线性 Ledger、checkpoint、event hash chain、effective evidence、correction、blocked/resumed、manual acceptance、Gate pass evidence 和 pending transaction。

最终回复说明完成的是编译、reconcile、恢复或验证，并给出计划、baseline、runbook、history 目录和固定 prompt 路径。只优化控制面时不得实施 Gate。

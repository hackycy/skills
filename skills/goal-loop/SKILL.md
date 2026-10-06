---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为 Gate 合同、精确合同输入基线、可恢复运行账本、可执行 Verification ID、按 Gate 归档的证据历史和固定执行提示词。
disable-model-invocation: true
---

# Goal Loop

把已收敛的决策文档编译成长期 Agent 执行控制面。Gate 是执行边界和上下文压缩边界；稳定 slice 是跨 Goal 的恢复边界。模型判断语义事实，control script 负责确定性状态转换、Repository check 执行和证据完整性。

生成并维护：

- `implementation-plan.md`：稳定 Gate 合同；
- `goal/contract-baseline.json`：合同输入文件及 SHA-256；
- `goal/runbook.md`：唯一当前状态、Revision、Goal Ledger 和压缩 checkpoint；
- `goal/history/G<n>.md`：按 Gate 分离、带 event hash chain 的 append-only 证据历史；
- `goal/evidence/`：Repository verification stdout/stderr artifact；
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

计划必须包含 `Contract Sources`。Gate 合同独占 Purpose、Inputs、Objective、Scope boundary、Constraints、Slice policy、Verification、Evidence rule、Stop conditions、Rollback 和 Exit conditions。

Verification 合同使用稳定 ID：

- Directed verification 使用 `D<n>`；
- Repository verification 使用 `R<n>`，命令由 control script 从 plan 读取并执行；
- Manual acceptance 使用 `M<n>`；
- Stop condition 使用 `SC<n>`；
- Evidence rule 只引用当前 Gate 的 Verification ID；
- 每个 Verification check 声明 Evidence inputs，用于 Gate pass 时检测 evidence stale。

`Evidence rule` 只接受 `Required checks`，不接受自由文本 evidence 描述。Exit 只能由 Verification check 的 effective result 满足。

项目命令和技术约束只写入计划，不进入固定 prompt。文档、UI 文案、脚本输出和最终回复直接描述具体结构、行为或可观察结果；说明差异时明确文件、字段、状态或行为和具体变化，不使用依赖重构阶段或发布时间点的相对名称。

## 编译执行控制面

完整读取：

- [`references/runbook-schema.md`](references/runbook-schema.md)
- [`references/history-schema.md`](references/history-schema.md)
- [`references/contract-baseline-schema.md`](references/contract-baseline-schema.md)
- [`references/control-script.md`](references/control-script.md)
- [`references/goal-prompt-template.md`](references/goal-prompt-template.md)

目录结构：

```text
<effort>/
├── implementation-plan.md
└── goal/
    ├── contract-baseline.json
    ├── runbook.md
    ├── prompt.md
    ├── evidence/
    └── history/
        ├── G0.md
        ├── G1.md
        └── ...
```

使用确定性 bootstrap：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py bootstrap <effort-path>
```

bootstrap 从 `Contract Sources + implementation-plan.md` 生成 baseline，创建 Revision `0` runbook、G0 initialized history 和固定 prompt，并在 transaction 提交前运行 validator。不得手工计算 event hash、Revision 或 Gate 状态转换。

## Contract Baseline

每次执行前运行 validator。baseline 路径集合、每个合同输入文件哈希和 manifest 自身哈希必须一致。

漂移处理遵守 [`references/contract-baseline-schema.md`](references/contract-baseline-schema.md)：

- `implementation-plan.md` 内容变化：重新审查并编译 Gate 合同；
- Contract Sources 路径集合变化：重新审查并编译计划；
- 计划内容和路径集合均未变化：只有明确确认现有 Gate 合同仍有效后，才能使用 `reconcile-baseline` 刷新输入哈希。

漂移未解决前保持 Ledger 与 checkpoint 不变，不实施 Gate。

## 最小上下文加载

Goal 启动优先使用：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py status <effort-path>
python3 <skill-dir>/scripts/goal_loop_ctl.py context <effort-path>
```

`status` 提供 Revision、当前 Gate、人工验收、Satisfied exits、Next action 和 stale checks。`context` 提供 checkpoint、Contract Sources 路径和当前 Gate contract。

默认不读取 `goal/history/`；只在诊断、rollback、correction、人工验收结果、证据核验、baseline reconcile 或状态异常时按 event / Exit 引用读取必要片段。passed Gate history 不默认加载。

## Verification evidence 与 Evidence snapshot

Exit 证据只能由计划声明的 Verification ID 产生：

- Directed check：`verify-directed --check D<n> --outcome pass|fail`；
- Repository check：`verify-repository --check R<n>`；control script 执行 plan 中固定 Command，保存 exit code 和输出 artifact；
- Manual acceptance：`manual-handoff --acceptance M<n>`，明确结果使用 `manual-result`。

Exit 在 Evidence rule 中所有 required checks 的 latest effective result 为 pass 时进入 checkpoint 的 `Satisfied exits`。

每个 passing check 保存其 Evidence inputs 的 canonical SHA-256。`pass-gate` 重新计算 required passing checks 的 snapshot；文件集合或内容变化导致 snapshot stale 时拒绝 Gate pass，要求重新执行对应 check。

passed Gate 的 snapshot 是 pass 时刻的历史证据。后继 Gate 可以修改相同代码；validator 不要求 passed Gate 的历史 snapshot 与当前仓库持续一致。

## append-only evidence

history 使用连续 event id、`Prev event hash` 和 `Event hash`；runbook Ledger 与 Current Checkpoint 保存 history tail hash。Repository check 输出写入 `goal/evidence/`，history 绑定 artifact SHA-256。

历史事实错误时追加 `correction`，不得改写旧 event。`Evidence effect: invalidate` 使目标 event 不再计入 effective evidence。correction 自身被后续 correction invalidated 后，不再影响它原本修正的 event。

hash chain 用于发现控制面内部断链或未同步改写。需要抵抗能够同时重写全部控制文件的修改时，应使用 Git commit、只读存储或其他外部不可变锚点。

## Stop condition、人工验收与 Gate pass

`block` 只能引用计划声明的 `SC<n>`。恢复必须通过 `resume` 追加 `resumed` event。

人工验收使用计划声明的 `M<n>`，运行时 acceptance id 固定为 `G<n>-M<n>`。等待期间 Gate 保持 `active`，当前 Goal 结束，不等待、不轮询、不自唤醒。

`pass-gate` 检查 required checks 完整性、latest result、Evidence snapshot freshness 和 unresolved manual acceptance。通过后记录 `Check@Event` Exit evidence，把当前 Gate 改为 `passed`，只激活直接后继或写 effort complete，然后结束当前 Goal。

## 运行态只通过 control script 写入

所有运行态修改使用 [`scripts/goal_loop_ctl.py`](scripts/goal_loop_ctl.py)，并携带当前 runbook Revision。陈旧 Revision 必须拒绝。

多文件操作使用 transaction journal。`recover` 在应用 journal 前校验 journal path、base64、before/after SHA-256；宿主中断留下 `goal/.goal-loop-transaction.json` 时，先执行 `recover`，不得继续 Gate 实现。

## 验证

生成、恢复、baseline reconcile 或任何人工修改后运行：

```bash
python3 <skill-dir>/scripts/validate_goal_loop.py <effort-path>
```

validator 检查 plan Contract Sources、Verification ID / Evidence rule、Contract Baseline、固定 prompt、State Rules、Revision、线性 Ledger、checkpoint、event hash chain、evidence artifact hash、correction、blocked/resumed、manual acceptance、Gate pass evidence 和 pending transaction。

最终回复说明完成的是编译、reconcile、恢复或验证，并给出 plan、baseline、runbook、history、evidence 和 prompt 路径。只优化控制面时不得实施 Gate。

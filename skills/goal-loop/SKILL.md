---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为 Gate 合同、轻量运行账本、按 Gate 归档的执行历史和跨轮复用的固定执行提示词。
disable-model-invocation: true
---

# Goal Loop

把已收敛的决策文档编译成执行控制面。核心原则是让 Gate 同时成为执行边界和上下文压缩边界：当前状态保持小而稳定，历史证据按 Gate 冷存储，需要追溯时再按引用读取。

生成四类工件：

- `implementation-plan.md`：稳定的 Gate 合同，回答做什么、边界是什么、如何验证和何时停止。
- `goal/runbook.md`：唯一的当前执行状态，只保存 Source Baseline、Goal Ledger 和当前 Gate checkpoint；不得累积完整执行历史。
- `goal/history/G<n>.md`：对应 Gate 的 append-only 执行事件与 Exit evidence。历史默认不进入启动上下文。
- `goal/prompt.md`：方便人工复制的固定入口，只指向计划和轻量 runbook；不绑定具体 Gate，不复制合同或历史。

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

计划独占所有稳定 Gate 合同：Objective、Inputs、Scope boundary、Constraints、Slice policy、Verification、Evidence rule、Stop conditions、Rollback 和 Exit conditions。Exit conditions 使用 Gate 内连续的 `E1`、`E2`… 标识；Evidence rule 必须逐项说明这些 Exit 所需证据。

项目命令与技术约束只写入计划，不进入固定 prompt。

生成的计划、运行状态、固定 prompt 和最终回复应直接描述目标结构、行为或可观察结果。不得因重构而使用“新布局”“新结构”“新版”等相对措辞作为名称或描述；使用具体的职责、结构或行为名称。确需说明迁移差异或记录历史事实时，明确涉及的对象和变化。

## 编译轻量运行状态

完整读取 [`references/runbook-schema.md`](references/runbook-schema.md) 和 [`references/history-schema.md`](references/history-schema.md)。

目录结构固定为：

```text
<effort>/
├── implementation-plan.md
└── goal/
    ├── runbook.md
    ├── prompt.md
    └── history/
        ├── G0.md
        ├── G1.md
        └── ...
```

`goal/runbook.md` 是热状态，不是日志。它只能包含：

1. schema version；
2. 源码基线；
3. 稳定状态规则；
4. 唯一 Goal Ledger；
5. 当前 `active` / `blocked` Gate 的 checkpoint，或 effort 完成标记。

禁止在 runbook 中追加每个 slice 的完整过程、失败调试记录、已通过 Gate 的详细历史或重复 Gate 合同。

`goal/history/G<n>.md` 是冷历史。Gate 第一次变为 `active` 时创建；之后只追加结构化事件。`passed` Gate 的详细过程只保留在对应 history 文件中，后续 Goal 默认不得读取。

每次 slice 或重要状态事件完成后：

1. 向当前 Gate history 追加一个事件；
2. 用该事件结果重写 runbook 的 Current Checkpoint；
3. checkpoint 只保存继续执行所需的压缩事实、最近事件引用、已满足 Exit、风险、人工验收状态和下一动作；
4. 不把历史正文复制回 runbook。

## 上下文加载规则

Goal 启动采用最小加载：

1. 先读 `goal/runbook.md`，锁定唯一 `active` Gate；若为 `blocked`，只处理恢复条件。
2. 读 `implementation-plan.md` 中当前 Gate 的合同和必要的 Source Decisions。
3. 读当前 Gate checkpoint 指向的必要代码入口。
4. 默认不读取 `goal/history/`。
5. 只有在 checkpoint 信息不足、验证失败需要诊断、执行 rollback、核验证据、处理人工验收结果或状态一致性异常时，才按 event / Exit 引用读取当前 Gate history 的必要片段。
6. `passed` Gate history 永不默认加载；只有当前 Gate 合同明确依赖其证据且 runbook 引用不足时才读取。

因此历史规模可以随项目增长，但正常启动上下文应主要由 `runbook + 当前 Gate contract + 当前代码` 决定，而不是由累计 slice 数决定。

## Gate 通过即压缩

当前 Gate 满足全部 Exit conditions 后，在同一次状态转换中：

1. history 追加最终验证事件，并在相关事件的 `Satisfies` 字段标明所证明的 Exit；
2. history 追加 `gate-passed` 事件，其中 `Exit evidence` 显式映射每个 Exit 到既有 evidence event；
3. Ledger 将当前 Gate 改为 `passed`，并仅保留 `gate-passed` event locator；
4. 若有后继，创建其 history 初始化事件并将后继改为 `active`；
5. Current Checkpoint 重建为后继 Gate 的最小启动状态；若无后继则写 effort 完成；
6. 显式结束当前 Goal，不得执行后继 Gate。

Gate 通过后，其已完成 slice 不得继续驻留 runbook。这是强制的 context compaction boundary。

## 人工验收

人工验收仍是 Gate 合同的一部分，但等待状态不进入 Gate 状态枚举。

自动化工作完成后：

1. history 追加一次 `manual-handoff` 事件，生成稳定 acceptance id，例如 `G2-A1`；
2. Current Checkpoint 记录 `Manual acceptance: pending G2-A1`、最后事件和下一动作；
3. Gate 继续保持 `active`；
4. 当前 Goal 使用宿主成功终态结束，不等待、不轮询、不自唤醒。

后续 Goal 若发现 checkpoint 仍是 pending 且当前用户输入没有明确验收结果，只输出一次交接提醒并结束；不要加载代码或重跑验证。用户给出明确结果后，history 追加 `manual-result` 事件，再继续满足 Exit 或进入修复。

## 固定 prompt 与验证

完整读取 [`references/goal-prompt-template.md`](references/goal-prompt-template.md)，只替换 `{{EFFORT_PATH}}`，写入 `goal/prompt.md`。

固定 prompt 必须保持跨 Gate 相同，不出现具体 Gate 名称，也不展开项目合同。它只描述最小加载、slice 循环、history event、checkpoint 更新、人工验收和单 Gate 终止行为。

生成或人工修改控制面后运行：

```bash
python3 <skill-dir>/scripts/validate_goal_loop.py <effort-path>
```

validator 负责检查 schema version、Gate/状态形状、线性依赖、Source Baseline、checkpoint 与当前 Gate 对齐、history/event 引用、passed Gate 的完整 Exit→event 映射。校验失败时保持状态不转换，先修复控制面。

最终回复说明是编译还是验证，给出计划、runbook、history 目录和固定 prompt 路径，并输出 prompt 内容。只优化工件时不得实施 Gate。

# Goal Prompt Template

只在 `goal-runbook.md` 验证为正常且恰有一个 `active` Gate 时渲染。逐字替换所有 `{{...}}` 占位符，不保留模板说明、空字段或未声明的命令。

```markdown
完成 `{{RUNBOOK_PATH}}` 中当前唯一 `active` 的 Gate：`{{GATE_ID_AND_NAME}}`。只完成这个 Gate；当前 Gate 通过后立即停止，不分析或执行后继 Gate。

## 当前 Gate 合同

**Objective：** {{OBJECTIVE}}

**Scope boundary：** {{SCOPE_BOUNDARY}}

**Inputs：**

{{INPUT_LIST}}

**Constraints：**

{{CONSTRAINT_LIST}}

**Slice policy：** {{SLICE_POLICY}}

**Exit conditions：**

{{EXIT_LIST}}

**Rollback：** {{ROLLBACK}}

**Verification：**

### Directed

{{DIRECTED_VERIFICATION}}

### Repository

{{REPOSITORY_VERIFICATION}}

### Manual acceptance

{{MANUAL_ACCEPTANCE}}

**Evidence rule：** {{EVIDENCE_RULE}}

## 开工检查

先完整阅读：

- `{{REPO_INSTRUCTIONS}}`
- `{{RUNBOOK_PATH}}`
- 当前 Gate 的全部 Inputs、依赖文档和相关实现代码

开始修改前记录以下检查结果：

- Ledger、Gate 详情和 Current Execution State 指向同一个 `active` Gate，且就是 `{{GATE_ID_AND_NAME}}`。
- 当前 Gate 的前置 Gate 全部为 `passed`，后继 Gate 全部为 `planned`。
- 源码基线与账本逐路径、逐 SHA-256 一致。
- 当前工作范围符合 Objective、Scope boundary、Constraints 和 Exit conditions。
- 已识别 `git status --short` 中的无关修改，并会保留它们。

任一检查失败时停止，不修改实现或账本，并记录不满足的不变量。

## 执行循环

自主重复以下循环，直到当前 Gate 的全部 Exit conditions 都有明确证据：

1. 根据 `Slice policy` 选择下一个最小、可独立验证、可回退的 slice。一个 slice 只处理一个行为或调用簇。
2. 只实现该 slice。保持合同未授权的 API、数据、产品行为、UI、交互、性能和兼容性语义不变。
3. 按 `Verification -> Directed` 声明的执行时机，运行适用于该 slice 或当前 Gate 的全部入口，并保留可定位的结果。
4. 按 `Verification -> Repository` 声明的执行时机和顺序运行仓库级验证。没有声明的命令不要自行添加；入口不可用时严格执行该入口声明的处理策略。没有有效替代策略就停止并记录缺失原因。
5. 当 `Verification -> Manual acceptance` 不是“无”时，先完成所有自动化工作，启动可验收环境，提供 URL 和最小验收清单，然后暂停等待用户确认。确认前不得将 Gate 标记为 `passed`。
6. 任一验证失败时诊断根因、修复并重新运行失败入口及其受影响的下游入口；保持测试强度，不删除、跳过、弱化或用无效替代掩盖失败。
7. 当前 slice 的验证全部通过后，才选择下一个 slice。

## 停止规则

遇到以下任一 `Stop conditions` 时暂停实施：

{{STOP_CONDITIONS}}

停止时记录已完成 slice、修改文件、验证结果、阻塞原因和恢复所需输入。只有合同明确的外部依赖、用户决策或无法安全判断可以把 Gate 标为 `blocked`；普通实现或测试失败保持 `active`。

## 每轮收尾

向当前 Gate 的 `Progress Log` 追加日期、slice、修改文件、Directed/Repository/Manual 验证结果、失败及修复证据、风险和下一动作。保持 Objective、Scope boundary、Inputs、Verification、Stop conditions、Rollback 和 Exit conditions 原文不变。

当前 Gate 尚有未满足的 Exit condition 时保持 `active`，结束本轮。全部 Exit conditions 有证据且人工验收（如适用）已确认后，执行一次原子转换：

1. 追加逐项最终证据和最终验证结果。
2. 将当前 Gate 在 Ledger、详情和 Current Execution State 中标记为 `passed`。
3. 若存在直接后继，将其在三处标记为 `active`，追加“已激活，尚未开始实施”，然后立即停止。
4. 若不存在后继，确认所有 Gate 均为 `passed`，记录 Goal 完成并停止。

不得开始后继 Gate，也不得重写已批准的 Gate 合同。
```

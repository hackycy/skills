# 当前 Gate 执行提示词模板

仅在 runbook 处于正常状态时渲染。逐字替换所有 `{{...}}` 占位符，不保留模板说明。

```markdown
完成 `{{RUNBOOK_PATH}}` 中当前唯一 `active` 的 Gate：`{{GATE_ID_AND_NAME}}`。只完成这个 Gate，不得进入后续 Gate。

## 当前 Gate 合同

**Objective：** {{OBJECTIVE}}

**Scope boundary：** {{SCOPE_BOUNDARY}}

**Inputs：**

{{INPUT_LIST}}

**Acceptance gates：**

{{ACCEPTANCE_LIST}}

## 开工检查

先完整阅读：

- `{{CLAUDE_PATH}}`
- `{{CONTEXT_PATH}}`
- `{{RUNBOOK_PATH}}`
- `{{SPEC_PATH}}`
- 当前 Gate 的全部 Inputs、依赖文档、ADR、issue 与相关实现代码

开始修改前确认并在本轮记录：

- Goal Ledger 与 Gate 详情中恰有同一个 `active` Gate，且就是 `{{GATE_ID_AND_NAME}}`。
- 当前 Gate 的所有前置 Gate 均为 `passed`，所有后继 Gate 均为 `planned`。
- 源码基线没有漂移。
- 当前工作没有超出 Objective、Scope boundary 与 Acceptance gates。
- `git status --short` 中已有的无关工作区修改已识别并会保留。

任一确认失败时停止，不修改实现或账本，并说明不满足的不变量。

## 执行循环

自主重复以下循环，直到当前 Gate 的全部 Acceptance gates 都有明确证据：

1. 在当前 Gate 范围内选择下一个最小、可独立验证、可回退的 slice。一个 slice 只包含一个行为或调用簇；读取、写入和 Presentation 的重构分别处理。
2. 实现该 slice，保持 API、认证、session、SSE、FRP、Bun `HTMLBundle` 静态交付和 UI/交互语义不变，除非当前 Gate 明确授权改变其中一项。
3. 运行与该 slice 直接相关的 directed tests。
4. 按顺序运行 `bun run build`、`bun run lint`、`bun run typecheck`、`bun test`。
5. slice 涉及 browser、直接路由、CSP、静态资源头、cookie session、权限或 SSE 时，运行对应 smoke 或浏览器验证。
6. 任一验证失败时诊断根因、修复并重新运行失败验证及其下游验证；保持测试强度，不用删除、跳过、弱化或 mock 掩盖失败。
7. 当前 slice 全部验证通过后，再选择下一个 slice。

仓库不存在某条命令或脚本时，不得伪造为通过；在 Progress Log 中记录缺失原因，并运行最接近且有效的验证。保留已有无关修改，不删除当前 Gate 之外的旧实现，不 push 远程分支。

遇到外部依赖、相互冲突的已批准要求、必须由用户决定的产品行为或无法安全判断的语义时，停止实施；记录已完成证据、阻塞条件和恢复所需输入。只有外部依赖或所需决策确实阻止继续时才将 Gate 标为 `blocked`，普通测试失败保持 `active`。

## 每轮收尾

每个执行回合结束前，向当前 Gate 的 `Progress Log` 追加日期、slice、修改文件、命令与结果、失败及修复证据、风险和下一动作。保持当前 Gate 的 Objective、Scope boundary、Inputs 与 Acceptance gates 原文不变。

当前 Gate 尚有未满足的 Acceptance gate 时保持 `active`，并结束本轮。全部 Acceptance gates 都有明确证据后，执行一次原子转换：

1. 向当前 Gate 的 Progress Log 追加逐项验收证据与最终验证结果。
2. 在 Goal Ledger 和 Gate 详情中将当前 Gate 标记为 `passed`。
3. 若存在直接后继，在 Goal Ledger 和该 Gate 详情中将其从 `planned` 标记为 `active`，向其 Progress Log 追加“已激活，尚未开始实施”，然后立即停止。
4. 若不存在直接后继，确认所有 Gate 均为 `passed`，记录 Goal 完成并停止。

不得开始分析或执行后继 Gate。
```

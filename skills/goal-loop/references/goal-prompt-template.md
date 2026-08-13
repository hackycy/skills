# Fixed Goal Prompt

只替换 `{{EFFORT_PATH}}`。同一 effort 的每个 Gate 使用完全相同的内容。

```markdown
完成 `{{EFFORT_PATH}}/goal-runbook.md` 中当前唯一 `active` 的 Gate。只完成该 Gate，不得进入下一个 Gate。

先阅读 `CLAUDE.md`、适用的 `AGENTS.md` / `CONTEXT.md`、`{{EFFORT_PATH}}/implementation-plan.md`、`{{EFFORT_PATH}}/goal-runbook.md`，以及当前 Gate 引用的 decision 文档和相关代码。以这些文件为唯一执行依据。

自主执行以下循环，直到当前 Gate 的全部 Exit conditions 满足：

1. 按当前 Gate 的 Slice policy 找出下一个最小、可独立验证、可回退的 slice。
2. 只实现该 slice，不扩大 Scope boundary。
3. 按计划声明的时机运行适用的 Directed verification。
4. 按计划声明的顺序运行 Repository verification。
5. 失败则诊断、修复并重新验证；当前 slice 通过后再继续下一个 slice。

始终遵守：

- 一个 slice 只包含一个行为或调用簇。
- 读取、写入和 Presentation 等不同职责分别切片；除非当前 Gate 明确要求，不在一个 slice 中混合。
- 保留与当前 Gate 无关的旧实现和工作区修改。
- 保持当前 Gate 未授权改变的 API、数据、UI、交互和兼容性语义。
- 不通过删除、跳过、弱化测试或无效替代获得通过。
- 每轮向当前 Gate 的 Progress Log 追加 slice、修改文件、验证结果、风险和下一动作。
- 触发 Stop condition 时暂停，记录已完成证据、阻塞原因和恢复所需输入。
- 不 push 远程分支。

如果当前 Gate 包含人工验收，先完成全部自动化工作，启动可验收环境，提供 URL 和最小验收清单，然后暂停等待用户确认。人工验收未确认前保持当前 Gate 为 `active`。

全部 Exit conditions 满足后执行一次原子转换：向 Progress Log 追加逐项验收和最终验证证据，将当前 Gate 标记为 `passed`；若存在直接后继，将其从 `planned` 标记为 `active` 并记录“已激活，尚未开始实施”；若不存在后继，记录 Goal 完成。转换后立即结束，不分析或执行下一个 Gate。
```

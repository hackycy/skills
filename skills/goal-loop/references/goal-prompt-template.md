# Fixed Goal Prompt

只替换 `{{EFFORT_PATH}}`。同一 effort 的每个 Gate 使用完全相同的内容。

```markdown
推进 `{{EFFORT_PATH}}/goal-runbook.md` 中启动本次 Goal 时唯一 `active` 的 Gate，直到该 Gate 通过或完成一次人工验收交接。开始时锁定该 Gate 的编号；该编号是本次 Goal 不可扩大的执行边界。只处理该 Gate，不得进入下一个 Gate。

启动时先读取 `{{EFFORT_PATH}}/goal-runbook.md` 的 Goal Ledger 和当前 Gate 的最后一条 Progress Log。若日志标记人工验收待确认且当前用户输入没有明确验收结果，只执行人工验收交接的终止规则，不读取代码、不运行验证、不重新实施。否则再阅读 `CLAUDE.md`、适用的 `AGENTS.md` / `CONTEXT.md`、`{{EFFORT_PATH}}/implementation-plan.md`、`{{EFFORT_PATH}}/goal-runbook.md`，以及当前 Gate 引用的 decision 文档和相关代码；以这些文件为唯一执行依据。

自主执行以下循环，直到当前 Gate 的自动化 Exit conditions 满足；若 Manual acceptance 为“无”，则继续执行至全部 Exit conditions 满足：

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

如果当前 Gate 的 Manual acceptance 不是“无”，先完成全部自动化工作，启动可验收环境，并向 Progress Log 追加一次人工验收交接记录：验收入口、自动化验证证据、最小验收清单、期望的明确回复格式和下一动作。人工验收交接是本次 Goal 的成功终点，不是等待循环，也不是 Gate 状态转换。

交接记录写入后，执行本次 Goal 的最后一个状态操作：若运行时提供 Goal/task 生命周期控制，使用其成功终态操作将本次 Goal 标记为已完成（语义等价于 `complete` 或 `succeeded`）。不得使用 `blocked`、`paused` 或“继续运行”来表示等待人工验收；Gate 必须继续保持 `active`，不得执行原子转换。没有 Goal/task 状态机制时，直接以最终回复终止当前任务，不创建等待、轮询或自唤醒流程。

状态操作完成后，只输出一次人工验收交接结果，至少包含：当前 Gate、自动化验证结果、验收入口、最小验收清单、用户应回复的明确格式，以及“本次 Goal 已结束、Gate 仍为 active”。这条交接结果是当前任务的最终回复；输出后不得再调用工具、等待、轮询或追加“仍在等待”的消息。

后续只有用户在新的 Goal/task 中提供明确验收结果（例如通过/未通过及必要证据）时，才可继续当前 Gate。新 Goal 启动时若日志仍是人工验收待确认且当前输入没有明确结果，不重新执行实现循环；只将该新 Goal 标记为成功终态，并输出一次交接提醒。

当前 Gate 的全部 Exit conditions（包括适用的人工验收）满足后：向 Progress Log 追加逐项验收和最终验证证据，将当前 Gate 标记为 `passed`；若存在直接后继，将其从 `planned` 标记为 `active` 并记录“已激活，尚未开始实施”；若不存在后继，记录 effort 已完成。汇总本 Gate 的验证证据，使用运行时提供的 Goal/task 成功终态机制结束本次 Goal，然后结束当前普通会话。

这是整个 Goal 的强制结束点，不是只结束当前回复。即使直接后继已变为 `active`，它也不属于本次 Goal；不得重新进入执行循环，不得分析、实施或验证下一个 Gate，也不得为下一个 Gate 调用工具。
```

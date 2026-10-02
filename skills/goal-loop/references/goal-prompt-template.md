# Fixed Goal Prompt

只替换 `{{EFFORT_PATH}}`。同一 effort 的每个 Gate 使用完全相同的内容。

```markdown
推进 `{{EFFORT_PATH}}/goal/runbook.md` 中启动本次 Goal 时唯一 `active` 的 Gate，直到该 Gate 通过、命中 Stop condition 或完成一次人工验收交接。开始时锁定该 Gate 编号；它是本次 Goal 不可扩大的执行边界，不得进入后继 Gate。

采用最小上下文加载：

1. 先读取 `{{EFFORT_PATH}}/goal/runbook.md` 的 Goal Ledger 和 Current Checkpoint。
2. 若 checkpoint 是人工验收 pending 且当前用户输入没有该 acceptance id 的明确结果，只输出一次交接提醒并成功结束本次 Goal；不要读取代码、计划细节或 history，不要重跑验证。
3. 否则读取 `{{EFFORT_PATH}}/implementation-plan.md` 中当前 Gate 的合同、必要 Source Decisions、适用的 `CLAUDE.md` / `AGENTS.md` / `CONTEXT.md` 和当前 Gate 相关代码。
4. 默认不要读取 `{{EFFORT_PATH}}/goal/history/`。只有 checkpoint 信息不足、验证失败诊断、rollback、人工验收结果、证据核验或状态异常时，才按 event / Exit 引用读取必要片段；passed Gate history 不得默认加载。

自主执行当前 Gate：

1. 按 Slice policy 选择下一个最小、可独立验证、可回退的 slice。
2. 只实现该 slice，不扩大 Scope boundary。
3. 按计划声明的时机运行 Directed verification，再按顺序运行 Repository verification。
4. 失败则诊断、修复并重新验证；普通失败保持 Gate `active`。
5. 每形成一个稳定事实，先向当前 Gate 的 `goal/history/G<n>.md` 末尾追加结构化 event；用 `Satisfies` 标记该 event 实际证明的 Exit。再重写 `goal/runbook.md` 的 Current Checkpoint。runbook 只保留最近 event、slice 游标、已满足 Exit、风险、人工验收状态和下一动作，不复制历史正文。

始终遵守：

- 一个 slice 只包含一个行为或调用簇；不同职责分别切片。
- 保留与当前 Gate 无关的既有实现和工作区修改。
- 保持当前 Gate 未授权改变的 API、数据、UI、交互和兼容性语义。
- 文档、UI 文案和回复直接描述结构、行为或结果，不因重构使用“新布局”“新结构”“新版”等相对措辞。使用具体名称；确需说明迁移差异或记录历史事实时，明确涉及的对象和变化。
- 不通过删除、跳过、弱化测试或无效替代获得通过。
- `goal/history/G<n>.md` append-only；纠错追加 `correction` event。
- 触发 Stop condition 时追加 `blocked` event，更新 checkpoint 与 Ledger 为 `blocked`，记录恢复条件并结束。
- 不 push 远程分支。

若 Manual acceptance 不是“无”，先完成全部自动化工作，追加一次 `manual-handoff` event，生成 acceptance id（如 `G2-A1`），并在 checkpoint 写 `Manual acceptance: pending <id>`。然后使用宿主 Goal/task 的成功终态结束本次 Goal；Gate 保持 `active`。最终回复只给出当前 Gate、自动化结果、验收入口、最小清单、明确回复格式和“本次 Goal 已结束、Gate 仍为 active”。不得等待、轮询、自唤醒或重复追加等待日志。

若后续 Goal 收到 pending acceptance id 的明确结果，追加 `manual-result` event。通过则用该证据满足对应 Exit；未通过则保持 `active`，按反馈执行下一个最小修复 slice。

全部 Exit conditions 满足后：追加最终 verification event，再追加 `gate-passed` event；其中 `Exit evidence` 必须完整映射计划中的每个 Exit 到一个既有且 `Satisfies` 对应 Exit 的 evidence event。然后执行一次状态转换：当前 Gate `active -> passed`，Ledger 只保留 `<history-path>@<gate-passed-event-id>`；若有直接后继，创建其 history 初始化 event、将其 `planned -> active` 并把 Current Checkpoint 重建为后继的最小启动状态；若无后继，写 effort complete。

状态转换后运行 goal-loop validator。验证通过后汇总当前 Gate 证据并显式结束整个 Goal。这是 context compaction boundary：刚通过 Gate 的详细 slice 只留在 history，不得重新放回 runbook，也不得在本次 Goal 中分析或执行后继 Gate。
```

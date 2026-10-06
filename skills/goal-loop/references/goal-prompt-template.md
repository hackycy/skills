Prompt schema: `goal-loop/prompt`
Effort path: `{{EFFORT_PATH}}`

推进 `{{EFFORT_PATH}}/goal/runbook.md` 中启动本次 Goal 时唯一 `active` 的 Gate。执行边界是启动时锁定的 Gate；不得进入后继 Gate。

开始时：

1. 运行 `goal_loop_ctl.py status {{EFFORT_PATH}}`，确认 Revision、当前 Gate、人工验收状态、Satisfied exits 和 evidence freshness。
2. 运行 goal-loop validator。存在 pending transaction 时只执行 `recover`；存在 Contract Baseline drift 时停止实现，不读取或修改代码，报告漂移文件。只有 `implementation-plan.md` 和 Contract Sources 路径集合都未变化，并且现有 Gate 合同已经被明确确认仍有效时，才使用 `reconcile-baseline`。
3. 若 checkpoint 是人工验收 pending，且当前用户输入没有对应 acceptance id 的明确结果，只输出一次验收提醒并成功结束本次 Goal；不要加载代码、Gate 细节或完整 history，不要重跑实现验证。
4. 否则运行 `goal_loop_ctl.py context {{EFFORT_PATH}}`，只读取当前 Gate 合同、Contract Sources 路径、checkpoint 和当前 Gate 相关代码。默认不读取 passed Gate history。

执行当前 Gate：

1. 按 Slice policy 选择下一个最小、可独立验证、可回退的 slice。
2. 只实现该 slice，不扩大 Scope boundary。
3. Exit 证据只能通过当前 Gate 声明的 Verification ID 形成：
   - Directed check 使用 `verify-directed --check D<n> --outcome pass|fail`；
   - Repository check 使用 `verify-repository --check R<n>`，由 control script 执行计划中的命令并保存输出 artifact；
   - Manual acceptance 使用 `manual-handoff --acceptance M<n>`，收到明确结果后使用 `manual-result`。
4. 普通实现或验证失败保持 Gate `active`；形成稳定事实后通过 control script 追加 event，并携带 runbook 当前 Revision。禁止手工改写 `goal/runbook.md`、`goal/history/G<n>.md` 或 `goal/contract-baseline.json`。
5. 每次成功 state mutation 后重新读取 Revision。任何陈旧 Revision 写入都必须停止并重新加载 runbook。
6. 一个稳定、已验证的 slice 完成后，如果下一 slice 不适合在当前 Goal 的剩余上下文或工具预算中完整完成，使用 `record --type checkpoint` 持久化恢复点，运行 validator，并以 Gate 仍为 `active` 的状态成功结束当前 Goal。

证据规则：

- `D<n>`、`R<n>`、`M<n>` 必须来自当前 Gate 的 Verification 表。
- 每个 passing check 保存 `Evidence snapshot`，绑定该 check 声明的 Evidence inputs。
- `R<n>` 的 stdout/stderr 保存到 `goal/evidence/<event>-R<n>.log`，history 保存 artifact SHA-256。
- `pass-gate` 重新计算当前 Evidence inputs；任何 required check 缺失、最新结果为 fail 或 snapshot stale 时都必须拒绝 Gate pass。
- 后继 Gate 激活后，passed Gate 的证据保持历史事实；后继实现可以修改相同代码，不要求 passed Gate 的旧 snapshot 与当前仓库持续一致。

始终遵守：

- 一个 slice 只包含一个行为或调用簇；不同职责分别切片。
- 保留与当前 Gate 无关的既有实现和工作区修改。
- 保持当前 Gate 未授权改变的 API、数据、UI、交互和兼容性语义。
- 文档、UI 文案和回复直接描述具体结构、行为或可观察结果；需要说明差异时明确对象和变化，不使用依赖重构阶段或发布时间点的相对名称。
- 不通过删除、跳过、弱化测试或无效替代获得通过。
- 历史事实错误时使用 `correct` event；需要使旧 evidence 失效时使用 `Evidence effect: invalidate`，不得修改旧 event。
- 触发 Stop condition 时使用 `block --condition SC<n>`；恢复条件满足后使用 `resume`，不得直接修改 Ledger。
- 不 push 远程分支。

Gate 通过：

- 每个 Exit 必须拥有 Evidence rule 中全部 required checks 的 effective passing evidence，并且这些 evidence 在 pass 时没有 stale snapshot。
- 不存在 unresolved manual acceptance 时才能调用 `pass-gate`。
- `pass-gate` 记录完整 `Check@Event` Exit evidence，把当前 Gate `active -> passed`，只激活直接后继或写 effort complete，并更新 History head / Revision。
- `pass-gate` 完成并通过 validator 后结束当前 Goal；不在同一 Goal 中实现后继 Gate。

Prompt schema: `goal-loop/prompt-v2`
Effort path: `{{EFFORT_PATH}}`

推进 `{{EFFORT_PATH}}/goal/runbook.md` 中启动本次 Goal 时唯一 `active` 的 Gate。执行边界是启动时锁定的 Gate；不得进入后继 Gate。

开始时：

1. 读取 `{{EFFORT_PATH}}/goal/runbook.md` 的 Revision、Goal Ledger 和 Current Checkpoint。
2. 运行 goal-loop validator。存在 pending transaction 时只执行 transaction recovery；存在 Contract Baseline drift 时停止实现，不读取或修改代码，报告漂移文件。只有在 `implementation-plan.md` 未变化、Contract Sources 路径集合未变化，并且现有 Gate 合同已经被明确确认仍有效时，才使用 `reconcile-baseline`。
3. 若 checkpoint 是人工验收 pending，且当前用户输入没有该 acceptance id 的明确结果，只输出一次验收提醒并成功结束本次 Goal；不要加载代码、Gate 细节或完整 history，不要重跑实现验证。
4. 否则读取 `implementation-plan.md` 中当前 Gate 合同、必要 Source Decisions、适用治理文件和当前 Gate 相关代码。
5. 默认不读取 `goal/history/`。只有 checkpoint 信息不足、验证失败诊断、rollback、人工验收结果、correction、证据核验、baseline reconcile 或状态异常时，才按 event / Exit 引用读取必要片段；passed Gate history 不得默认加载。

执行当前 Gate：

1. 按 Slice policy 选择下一个最小、可独立验证、可回退的 slice。
2. 只实现该 slice，不扩大 Scope boundary。
3. 按 Gate 合同声明的时机运行 Directed verification，再按顺序运行 Repository verification。
4. 普通实现或验证失败保持 Gate `active`；形成稳定事实后使用 goal-loop control script 追加对应 event，并携带 runbook 当前 Revision。禁止手工改写 `goal/runbook.md`、`goal/history/G<n>.md` 或 `goal/contract-baseline.json`。
5. 每次成功 state mutation 后重新读取 Revision。任何陈旧 Revision 写入都必须停止并重新加载 runbook。
6. 一个稳定、已验证的 slice 完成后评估下一 slice 是否能在当前 Goal 的剩余上下文和工具预算中完整完成。不能可靠完成时，使用 `record --type checkpoint` 持久化恢复点，运行 validator，并以 Gate 仍为 `active` 的状态成功结束当前 Goal。不要为了“尽量一次做完”继续累积上下文。

始终遵守：

- 一个 slice 只包含一个行为或调用簇；不同职责分别切片。
- 保留与当前 Gate 无关的既有实现和工作区修改。
- 保持当前 Gate 未授权改变的 API、数据、UI、交互和兼容性语义。
- 文档、UI 文案和回复直接描述具体结构、行为或可观察结果；需要说明差异时明确对象和变化，不使用“新布局”“新结构”“新版”等相对名称。
- 不通过删除、跳过、弱化测试或无效替代获得通过。
- 历史事实错误时使用 `correct` event；需要使旧 evidence 失效时使用 `Evidence effect: invalidate`，不得修改旧 event。
- 触发计划声明的 Stop condition 时使用 `block`；恢复条件满足后使用 `resume`，不得直接修改 Ledger。
- 不 push 远程分支。

人工验收：

- 自动化边界完成后使用 `manual-handoff` 生成稳定 acceptance id，Gate 保持 `active`，然后结束当前 Goal，不等待、不轮询、不自唤醒。
- 后续 Goal 收到对应 acceptance id 的明确结果后使用 `manual-result`；通过结果只满足它实际证明的 Exit，未通过则按反馈进入最小修复 slice。

Gate 通过：

- 只有全部 Exit 都有 effective evidence、没有 unresolved manual acceptance 时才能调用 `pass-gate`。
- `pass-gate` 负责最终 verification、完整 Exit evidence、当前 Gate `active -> passed`、直接后继 `planned -> active` 或 effort complete、history head、Revision 和 transaction。
- `pass-gate` 完成并通过 validator 后，汇总刚通过 Gate 的证据并显式结束当前 Goal。刚通过 Gate 的 slice 细节只留在 history，不放回 runbook，也不在本次 Goal 中分析或执行后继 Gate。

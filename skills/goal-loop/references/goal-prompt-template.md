推进以下 effort 在本次 Goal 启动时的当前 Gate，直到该 Gate 通过、完成一次人工验收交接、遇到真实阻塞，或因剩余预算不足而保存稳定 checkpoint。由你读取最新进度、执行控制命令并更新记录；我在后续 Goal 中复用这同一份提示词。

Effort: `{{EFFORT_PATH}}`
Python: `{{PYTHON}}`
Control script: `{{CONTROL_SCRIPT}}`

## 启动与恢复

遵守适用的 AGENTS.md、CLAUDE.md 和领域上下文。所有控制命令使用以上 Python、脚本和 effort 路径，按独立参数传入；参数不明确时读取脚本的 `--help`。

1. 运行 `status`，读取当前 Revision、Gate/GateRun、合同漂移、pending attempt、checkpoint 和检查新鲜度，锁定本轮的 Gate/GateRun。
2. 完整性错误时停止并诊断。`repository_running` 为 true 时，执行者仍持有工作区锁；不接管、不重复检查、不开始新的实现，报告已有执行尚未结束并结束本轮。执行者退出后，遗留的 R attempt 由 `recover` 记录中断，不自动重跑；D attempt 无可靠观察结果时取消，完成启动检查后再另建 attempt 观察，不能仅凭遗留 ID 推定通过。
3. 派生执行视图损坏时以当前 Revision 运行 `recover`。合同漂移时停止实现，先将已收到的明确验收回复记录到原 attempt，再按合同修订流程处理；漂移下的回复不能满足 Exit。恢复或修订后重新读取状态。若 Gate/GateRun 已更换，报告变更并结束本轮，由后续 Goal 接续。
4. M attempt pending 且当前输入没有对应 attempt 的明确结果时，只给出该受验对象的验收入口、最小清单和回复格式，然后结束 Goal；不加载实现代码、不重复实施、不轮询。必要的交接事实按 attempt 引用读取。
5. 全部 Gate 已完成且状态有效时，报告整个 effort 完成并结束。当前 Gate 为 blocked 时，先核实记录中的恢复条件；条件仍未满足则说明缺少的输入并结束，满足后记录 `resume` 再继续。
6. 运行 `context`，读取全局约束、当前 Gate 合同和 checkpoint，再读取相关决策与代码。历史只按 commit/attempt 引用按需读取，不默认加载已通过 Gate 的历史。若有 pending M 的明确回复，先按下文记录验收结果，再选择下一动作。

## 持续推进当前 Gate

先根据当前有效检查判断剩余工作：全部 Exit 已满足时直接收尾，只剩人工验收时进入交接。其余工作在锁定的 Gate 内自主重复以下循环，一个 Goal 可以完成多个 slice：

1. 按 `slice_policy` 和 checkpoint 选择下一个最小、可独立验证、可回退的 slice，一个 slice 只处理一个行为或调用簇。
2. 实现该 slice，保持 scope 和 constraints；保留无关实现与工作区修改，以及当前 Gate 未授权改变的 API、数据、UI、交互和兼容性语义。
3. 按合同中检查描述和约束规定的时机与顺序验证。D 检查先 `check start` 固定受验对象与快照，再观察并 `check finish`；R 检查通过 `check run` 执行冻结合同的 argv。M 检查按下文人工交接处理。
4. 普通实现或验证失败时记录 failure、诊断、修复并重验，Gate 保持 active；不通过跳过、删除或弱化测试获得通过。输入变化导致证据 stale 时重新检查，失败、撤销、取消或中断均不能复用先前通过结果。
5. 每个稳定 slice 完成后使用 `record --kind slice` 保存完成内容、修改文件、验证结果或 attempt 引用、风险、slice 游标和具体下一动作。只有检查 attempt 能证明 Exit，进展记录不能替代检查证据。
6. 当前 Gate 尚有可推进工作时继续下一个 slice。下一 slice 无法在剩余上下文或工具预算中完整完成时，在已验证的稳定点使用 `record --kind checkpoint` 保存恢复事实，验证记录后结束本轮；后续 Goal 从这里继续。

每次写入携带从最新 status 取得的 `--expected-revision`，之后重新读取 status；check finish/run 的退出码 2 也可能已提交结果。陈旧 Revision 时重新加载事实，不盲目重试。同一 effort 同时只能有一个未结束 attempt；记录 slice、checkpoint、failure 或 block 前，先完成该检查，或在无法继续检查时取消并记录原因。取消后的 R 执行者退出前不开始新的实现或检查。

触发合同 Stop condition 时记录 `block`、已完成证据和恢复所需输入后结束；普通测试失败继续修复。实现与验证始终限定于启动时锁定的 Gate/GateRun。

## 人工验收交接

先准备可验收对象，并确认合同要求的适用自动检查对该对象仍有效，将自动化结果、验收入口、最小清单和交接说明记录到进展中。然后以 `check start` 开始所需的 M attempt，subject 明确实际文件、构建或部署，并包含可定位的验收入口。快照固定后再交给用户观察；已有有效通过结果的 M 检查无需重复交接。

最终回复给出当前 Gate、自动化结果、attempt ID、受验对象与入口、最小验收清单，以及带该 attempt ID 的明确通过/未通过回复格式；说明本次 Goal 已结束、Gate 仍 active，后续使用同一提示词并附验收结果。交接后结束，不等待、轮询或自唤醒。

收到对应 attempt 的明确结果后，用 `check finish` 记录事实。通过且证据有效时继续判断 Exit；未通过则修复并重新检查。收到对过期对象的结果可以保留观察事实，但不能满足当前 Exit，应对当前对象重新交接。

## 收尾

所有 Exit 的当前有效尝试通过后运行 `pass-gate`。脚本复核输入与未结束 attempt，记录 evidence 并只激活直接后继。运行 `validate` 后汇总本 Gate 结果，结束本次 Goal；直接后继只能由后续 Goal 执行，不在本轮分析、实施或验证它。

每轮最终回复说明已完成内容、验证结果、结束原因和用户下一动作：可以继续时说明复用原提示词；需要验收或恢复输入时给出具体要求；最后一个 Gate 通过后明确报告整个 effort 完成。无需生成新提示词。按宿主实际提供的生命周期机制结束本次任务，仅在其完成条件满足时使用成功终态，不把人工交接、checkpoint 或单个 Gate 通过标成整个 effort 完成。

运行文件由控制脚本管理。使用 `correct` 补充事实或撤销具体 attempt；证据被撤销时可能重开依赖 Gate，重新打开不自动回滚代码。合同变化使用 `revise-contract` 的预览和提交流程。直接描述具体对象、字段和可观察行为；远程发布遵守用户明确授权与仓库规则。

# Gate 执行入口

Effort: `{{EFFORT_PATH}}`
Python: `{{PYTHON}}`
Control script: `{{CONTROL_SCRIPT}}`

所有命令使用以上可定位入口，以独立参数传入路径。先运行 status，锁定本次 Goal 启动时的 Gate 和 GateRun。Gate pass 后结束本次 Goal，不在同一 Goal 实施后继。

## 启动

1. 运行 `status`，读取 Revision、合同漂移、pending attempt、checkpoint 和 stale checks。
2. 完整性错误时停止并诊断。派生视图损坏时用当前 Revision 运行 recover。合同漂移时停止实现，进入合同修订工作流。
3. M attempt pending 且用户没有对应 attempt 的明确结果时，只提醒其 ID 与受验对象，结束 Goal，不加载代码、不轮询。
4. R attempt 遗留时使用 recover 确认执行者是否已退出；仍在运行时不得接管或重复执行。D attempt 不能仅凭遗留 ID 推定已完成观察。
5. 运行 `context`，读取全局约束、当前 Gate 合同和 checkpoint，再读取相关代码。历史只按 commit/attempt 引用按需读取。

## 实施与验证

按 slice_policy 选择一个可独立验证、可回退的 slice。保留无关工作区修改，以及当前 Gate 未授权改变的 API、数据、UI 和兼容性语义。不要通过跳过、删除或弱化测试获得通过。

D/M 检查先 `check start --check ID --subject 对象`，固定快照后再检查或交接。观察完成或收到对应人工回复后 `check finish --attempt ID --outcome pass|fail --result 事实`。R 检查通过 `check run --check ID` 执行冻结合同的 argv，不自行替换命令。

每次写入携带 `--expected-revision`，之后重新读取 status；退出码 2 也可能已提交结果。陈旧 Revision 时重新加载事实，不盲目重试。失败、stale、取消或中断后修复原因并创建另一 attempt；不能复用通过事实。

status 的 `repository_running` 为 true 时，验证进程仍持有工作区执行锁。取消后的进程退出前，不开始另一项实现或检查；脚本会拒绝新的检查启动。

人工验收交接要明确 attempt ID、待验对象和操作场景，然后结束 Goal。收到对过期对象的结果可以记录，但该结果不能满足当前 Exit。

稳定且已验证的 slice 完成后，若下一 slice 无法在剩余预算中完整完成，使用 record checkpoint 保存已完成内容、下一动作和风险；Gate 保持 active，结束 Goal。临时错误记录 failure；触发合同 Stop condition 时 block，恢复后 resume。

## 完成

所有 Exit 的当前有效尝试通过后运行 pass-gate。脚本复核输入与 unresolved attempt，记录 evidence 并只激活直接后继。运行 validate 后报告结果，结束 Goal。

使用 correct 补充事实或撤销具体 attempt；通过证据被撤销时会重开依赖 Gate。运行文件由脚本管理，不手改提交记录、对象或视图。合同变化使用 revise-contract 的预览和提交，重新打开不自动回滚代码。

直接描述具体对象、字段与可观察行为，不使用依赖重构阶段或发布时间的相对名称。远程发布遵守用户明确授权与仓库规则。

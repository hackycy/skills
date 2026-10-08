# 控制命令

入口为 `scripts/goal_loop_ctl.py`。以下示例中的 `CTL` 和 `EFFORT` 表示应分别传入的脚本绝对路径和 effort 路径；CLI 的 `--help` 提供参数。

本页供执行 agent 使用。用户首次获得固定提示词后，只需重复发送同一正文；读取状态、选择当前 Gate、执行命令和恢复均由 agent 完成，不要求用户运行命令获取下一轮提示词。

```text
python CTL bootstrap EFFORT
python CTL status EFFORT
python CTL context EFFORT
python CTL validate EFFORT
```

命令输出 JSON。退出码 0 表示操作成功；1 表示合同、状态、完整性或参数问题；check finish/run 的退出码 2 表示结果不是有效 pass，结果本身已经记录。无论退出码是否为 0，下一次写入前读取 status 的 Revision。

bootstrap 冻结一次固定 prompt，后续状态写入保持相同正文。status/context 提供当前进度；validate 的 `damaged_views` 不包含 `goal/prompt.md` 便利文件，原正文由视图刷新或 recover 恢复。冻结对象的完整性检查仍然有效。

## 检查尝试

```text
python CTL check start EFFORT --expected-revision 0 --check D1 --subject "src/reader.py 读取调用"
python CTL check finish EFFORT --expected-revision 1 --attempt A000001 --outcome pass --result "调用均满足 spec 的空值规则"
python CTL check run EFFORT --expected-revision 2 --check R1
```

D/M 的 start 必须发生在观察或人工交接前。M 开始前先完成适用自动检查、准备受验对象，并用 record 保存自动化结果和交接说明；subject 描述用户实际看到的文件、构建或部署及验收入口。将返回的 attempt ID、受验对象、最小清单和明确回复格式交给用户后结束本轮；只有收到该 attempt 的明确结果才能 finish。ID 由脚本返回，示例数字不用于推测。

```text
python CTL check start EFFORT --expected-revision 4 --check M1 --subject "build abc123，读取页面"
python CTL check finish EFFORT --expected-revision 5 --attempt A000003 --outcome fail --result "错误详情未显示"
python CTL check start EFFORT --expected-revision 6 --check M1 --subject "build def456，读取页面"
```

同一 effort 只允许一个未结束尝试。失败后可修复并开始另一 attempt；同一检查开始另一尝试就会替代它之前的通过结果。输入变化后收到的回复仍记录原结果，但 attempt 状态为 stale，不满足 Exit。

```text
python CTL check cancel EFFORT --expected-revision 7 --attempt A000004 --reason "受验构建已撤回"
```

取消不会恢复之前的通过结果。R 取消先提交取消事实，再由执行者终止进程树并归档输出；执行者退出前，runner 锁会阻止再次执行 R、合同修订和恢复接管。

## Checkpoint 与 Gate

```text
python CTL record EFFORT --expected-revision 8 --kind checkpoint --result "读取空值 slice 已验证" --last-completed-slice S1 --current-slice S2 --next-action "验证分页行为"
python CTL block EFFORT --expected-revision 9 --condition SC1 --reason "数据接口离线" --next-action "恢复接口"
python CTL resume EFFORT --expected-revision 10 --reason "接口可用" --next-action "继续当前 slice"
python CTL pass-gate EFFORT --expected-revision 11
```

record 的 kind 为 slice、checkpoint、failure 或 rollback。每个稳定 slice 用 result 记录完成内容、修改文件及验证事实/attempt 引用，游标、risk 与 next-action 保存恢复所需信息；这些记录不替代 Exit 的检查证据。rollback 是实际回退后的事实记录，不自动修改代码。同一 Goal 内可记录多个 slice 后继续实现，只有剩余预算不足时才在稳定点记录 checkpoint 并结束。

存在未结束 attempt 时不能 record 或 block，应先 finish，或在无法继续检查时 cancel 并说明原因。人工验收交接说明因此写在 M start 之前；开始后只向用户交接并结束本轮，不通过取消待验 attempt 来写日志。

blocked Gate 在确认恢复条件满足后才能 resume。pass-gate 复核全部 Exit 与证据快照，只激活直接后继；agent 验证记录并报告后结束当前 Goal。再次收到原提示词才执行后继，全部 Gate 完成时只报告完成。

## Correction

```text
python CTL correct EFFORT --expected-revision 12 --commit 2 --reason "补充检查观察方法"
python CTL correct EFFORT --expected-revision 13 --commit 2 --revoke-attempt A000001 --reason "该观察未覆盖空值分支"
```

撤销只针对具体 attempt，不能通过撤销 correction 重新获得通过。若被撤销结果已用于当前序列中的 passed Gate，将重开该 Gate 及其后继，保留历史。重新验证才能建立有效证据。

合同变化使用 [合同修订](contract-revisions.md)；中断与派生视图问题使用 [存储与恢复](storage-and-recovery.md)。

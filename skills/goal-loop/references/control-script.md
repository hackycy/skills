# 控制命令

入口为 `scripts/goal_loop_ctl.py`。以下示例中的 `CTL` 和 `EFFORT` 表示应分别传入的脚本绝对路径和 effort 路径；CLI 的 `--help` 提供参数。

```text
python CTL bootstrap EFFORT
python CTL status EFFORT
python CTL context EFFORT
python CTL validate EFFORT
```

命令输出 JSON。退出码 0 表示操作成功；1 表示合同、状态、完整性或参数问题；check finish/run 的退出码 2 表示结果不是有效 pass，结果本身已经记录。无论退出码是否为 0，下一次写入前读取 status 的 Revision。

## 检查尝试

```text
python CTL check start EFFORT --expected-revision 0 --check D1 --subject "src/reader.py 读取调用"
python CTL check finish EFFORT --expected-revision 1 --attempt A000001 --outcome pass --result "调用均满足 spec 的空值规则"
python CTL check run EFFORT --expected-revision 2 --check R1
```

D/M 的 start 必须发生在观察或人工交接前。M 的 subject 应描述用户实际看到的文件、构建或部署。将返回的 attempt ID 与受验对象一起交给用户；只有收到该 attempt 的明确结果才能 finish。ID 由脚本返回，示例数字不用于推测。

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

record 的 kind 为 slice、checkpoint、failure 或 rollback。rollback 是实际回退后的事实记录，不自动修改代码。pass-gate 复核全部 Exit 与证据快照，只激活直接后继。

## Correction

```text
python CTL correct EFFORT --expected-revision 12 --commit 2 --reason "补充检查观察方法"
python CTL correct EFFORT --expected-revision 13 --commit 2 --revoke-attempt A000001 --reason "该观察未覆盖空值分支"
```

撤销只针对具体 attempt，不能通过撤销 correction 重新获得通过。若被撤销结果已用于当前序列中的 passed Gate，将重开该 Gate 及其后继，保留历史。重新验证才能建立有效证据。

合同变化使用 [合同修订](contract-revisions.md)；中断与派生视图问题使用 [存储与恢复](storage-and-recovery.md)。

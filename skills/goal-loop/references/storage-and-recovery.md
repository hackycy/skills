# 存储与恢复

## 权威记录与阅读视图

```text
<effort>/
  implementation-plan.md
  .goal-loop-control.lock
  .goal-loop-runner.lock
  goal/
    commits/00000000.json
    objects/<sha256>
    spool/<attempt-id>/stdout.log
    spool/<attempt-id>/stderr.log
    state.json
    contract-baseline.json
    runbook.md
    prompt.md
    history/G0.md
    history/effort.md
```

commits 保存连续 Revision、前序哈希、UTC 时间、领域事件和对象引用。objects 保存冻结合同、来源 bytes、证据清单、协议、prompt 和检查输出。一次提交可包含多个必须同时生效的事件。

state、baseline、runbook、prompt、history 是派生视图，不参与状态推导。history/effort.md 提供合同修订和 correction 的索引。spool 是执行中的临时输出，不是通过证据。锁文件只用于进程协调，不需要放入 Git；本地临时输出可忽略。保留 commits 和 objects 才能恢复全部事实。

bootstrap 固定 `goal-loop/protocol` 的 `format_version`、模板和渲染后 prompt。验证使用 effort 的协议对象，不读取安装包模板进行逐字比较。不支持的格式报错；没有兼容读取或迁移。

## 提交与恢复

依赖对象完成写入与摘要验证后，原子发布一份提交记录；该记录是状态生效点。随后更新阅读视图。

首次初始化在 effort 内的临时目录构造完整初始提交，再原子发布 goal 目录。发布前中断可以重新 bootstrap；发布后使用 recover。宿主强制退出可能留下未引用的临时目录，不作为执行事实读取，也不影响重试。

- 发布前中断：运行状态不变，未引用对象不作为证据。
- 发布后中断：提交已经生效，恢复重建视图，不重复命令或状态转换。
- 记录缺失、断链、对象缺失或损坏：停止并定位完整性错误，不改摘要、不猜测原事实。
- Markdown 被编辑或删除：报告 damaged_views，恢复后从提交记录重建。

```text
python CTL status EFFORT
python CTL recover EFFORT --expected-revision REVISION
python CTL validate EFFORT
```

recover 使用当前 Revision；仅重建视图时不增加 Revision。确认 R 执行者已退出且 attempt 仍在 running 时，追加 interrupted 结果，保存已有输出。执行者仍持有生命周期锁时拒绝接管。恢复不会重跑命令。D/M 等待不会因宿主重启自动取消。

## 保证范围

跨平台进程锁保护 Revision 校验与提交，锁失败不降级。POSIX 子进程继承生命周期描述符；Windows 使用 kill-on-close Job Object 终止所属进程树。约定 R 命令为有界验证，不启动脱离进程组的后台服务。

文件摘要证明声明输入在采样时的状态。执行前后与 Gate pass 时复核，不能证明两个采样之间从未改变。环境检查、未声明依赖、远程部署和外部系统的变化需要额外语义证据。

hash chain 检测内部断链或损坏。需要抵抗能够改写全部目录的操作者时，使用 Git commit 或外部不可变锚点。本地文件系统上的进程中断恢复不等于跨主机共享盘协调或任意硬件断电保证。

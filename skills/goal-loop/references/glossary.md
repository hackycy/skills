# 执行术语

| 术语 | 含义 |
| --- | --- |
| Effort | 有独立目标、执行顺序和完成条件的一项工作 |
| Goal | 用户发送固定提示词启动的一次任务；锁定当前 Gate，可连续推进多个 slice，也可在交接或 checkpoint 结束后由后续 Goal 续接 |
| Gate | 按顺序执行、具有明确范围和验收条件的工作单元 |
| Slice | 可独立验证与回退的一项行为或调用簇 |
| ContractRevision | 一次被接受的合同修订，固定决策来源和执行约定 |
| GateRun | 某个 Gate 的一次执行；重新打开 Gate 会建立另一执行轮次 |
| CheckDefinition | Gate 中稳定的验证要求；D 表示语义检查，R 表示仓库命令检查，M 表示人工验收 |
| CheckAttempt | 对一项验证要求的一次实际检查，包含受验对象、证据和结果 |
| EvidenceSnapshot | 一次观察绑定的输入范围、文件集合与内容指纹 |
| Exit | Gate 的可观察完成条件，必须由其要求的检查证明 |
| CommitRecord | 一组同时生效、可追溯的运行事实 |
| Revision | 已提交状态的连续序号，用于拒绝依据陈旧状态发起的写入 |
| Correction | 对既有事实的补充说明或证据撤销；撤销不等于重新验证 |

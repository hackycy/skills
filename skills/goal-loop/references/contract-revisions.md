# 合同修订

合同修订是轻量的 preview/commit 流程。候选 `implementation-plan.md` 不覆盖当前计划，直到用户按仓库流程确认。

```text
python CTL revise-contract EFFORT --plan CANDIDATE --mode revalidate --reason "合同变化"
python CTL revise-contract EFFORT --plan CANDIDATE --mode revalidate --reason "合同变化" --preview-digest DIGEST --expected-revision REVISION
```

preview 返回候选计划摘要和 Gate 清单，agent 审阅相对当前合同的语义变化；commit 检查候选摘要与 Revision，原子更新 implementation plan、baseline、runbook 并追加修订记录。修订保留 Gate 的身份与顺序，结构重排需单独审阅。

`revalidate` 从当前 Gate 与已变化 Gate 中最早的一个重新激活；共享规则或 Contract Sources 变化时从 G0 重新验证。当前检查快照清空，其后的 Gate 重新待执行，但全部既有 history 保留，后续重新激活继续追加。`equivalent` 保留当前 Gate 状态和检查结果，更新合同摘要并追加修订说明。旧计划由 Git 历史保留，不在 `goal/` 保存副本。

已完成的 effort 也可显式修订：`equivalent` 保留完成状态；`revalidate` 从最早变化的 Gate 重启，共享合同变化或未指定具体变化时从 G0 开始。

合同修订改变任务本身；执行材料 refresh 保留任务合同和进度，不触发这套重新验证流程。

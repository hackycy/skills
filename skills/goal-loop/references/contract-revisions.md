# 合同修订

合同修订是轻量的 preview/commit 流程。候选 `implementation-plan.md` 不覆盖当前计划，直到用户按仓库流程确认。

```text
python CTL revise-contract EFFORT --plan CANDIDATE --mode revalidate --reason "合同变化"
python CTL revise-contract EFFORT --plan CANDIDATE --mode revalidate --reason "合同变化" --preview-digest DIGEST --expected-revision REVISION
```

preview 比较当前计划、Contract Sources 摘要、Revision 和行为变化；commit 原子更新 implementation plan、baseline、runbook 和受影响 history。`revalidate` 从最早受影响 Gate 重新激活并清空其后的执行状态；`equivalent` 保留当前 Gate 状态但更新合同摘要。旧计划由 Git 历史保留，不在 `goal/` 保存副本。

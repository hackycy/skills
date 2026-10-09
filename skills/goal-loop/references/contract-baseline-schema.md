# Contract Baseline Schema

`goal/contract-baseline.json` 保存 implementation plan 和 Contract Sources 的当前摘要，用于检测合同漂移。

Schema: `goal-loop/contract-baseline-v2`

```json
{
  "files": [
    {"path": "docs/spec.md", "sha256": "<64-hex>"},
    {"path": "efforts/example/implementation-plan.md", "sha256": "<64-hex>"}
  ],
  "schema": "goal-loop/contract-baseline-v2"
}
```

路径集合必须精确等于 `implementation-plan.md` 的 Contract Sources 加计划文件自身，按字典序排列且不得重复。baseline 不保存来源文件副本。漂移时停止 Gate；通过 `revise-contract` 的 preview/commit 重新审查并更新 baseline。Git 历史负责保留旧版计划。

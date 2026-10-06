# Contract Baseline Schema

`goal/contract-baseline.json` 固定 Gate 合同的机器可校验输入集合。

Schema: `goal-loop/contract-baseline`

```json
{
  "files": [
    {"path": "docs/spec.md", "sha256": "<64-hex>"},
    {"path": "efforts/example/implementation-plan.md", "sha256": "<64-hex>"}
  ],
  "schema": "goal-loop/contract-baseline"
}
```

路径集合必须精确等于 `implementation-plan.md` 的 `Contract Sources` 加计划文件自身。路径相对仓库根目录、按字典序排列且不得重复；`goal/` 运行态文件不得进入 manifest。

合同输入漂移时不得实施 Gate：

- `implementation-plan.md` 内容变化：重新审查并编译 Gate 合同；
- Contract Sources 路径集合变化：重新审查并编译 implementation plan；
- 计划内容和路径集合都未变化：只有明确确认 Gate 合同仍有效后，才运行 `reconcile-baseline --confirm-plan-valid`。

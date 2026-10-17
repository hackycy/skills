# Contract Baseline Schema

`goal/contract-baseline.json` 保存 implementation plan 和 Contract Sources 的当前摘要，用于检测合同漂移。

标识：`goal-loop/contract-baseline`。已有 baseline 的格式标识由读取端兼容；刷新执行材料保留其原字节。

```json
{
  "hash_mode": "sha256-utf8-crlf-to-lf",
  "files": [
    {"path": "docs/spec.md", "sha256": "<64-hex>"},
    {"path": "efforts/example/implementation-plan.md", "sha256": "<64-hex>"}
  ],
  "schema": "goal-loop/contract-baseline"
}
```

路径集合必须精确等于 `implementation-plan.md` 的 Contract Sources 加计划文件自身，按字典序排列且不得重复。baseline 不保存来源文件副本。漂移时停止 Gate；通过 `revise-contract` 的 preview/commit 重新审查并更新 baseline。Git 历史负责保留修订前的计划。

## 换行与摘要

`hash_mode: sha256-utf8-crlf-to-lf` 表示：对 UTF-8 且不含 NUL 的合同文件，仅将 CRLF 转换为 LF 后计算 SHA-256。LF、CRLF 或二者混用不构成合同漂移；正文、空格、BOM、末尾换行和独立 CR 的变化仍会改变摘要。非 UTF-8 或含 NUL 的文件按原始字节计算，不做换行转换。bootstrap 和 revise-contract 使用同一规则。

没有 `hash_mode` 的 baseline 按历史原始字节摘要兼容校验：尝试当前原始字节、LF 文本和统一 CRLF 文本的摘要。只有匹配已保存摘要才接受，不重建 baseline、不修改状态、不要求重新验收。若记录摘要时文件混用了 LF/CRLF，而换行分布后来改变，仅凭该摘要无法还原原来的分布；此时仍报告漂移，需要查证原文件，不能直接接受当前内容。

runbook 中的 manifest 摘要同样允许 LF/CRLF 差异，但不忽略 JSON 的其他字节变化。该容忍范围仅限合同 baseline：检查证据 fingerprint、transaction before/after 摘要继续按原始字节计算。`context` 校验不会为了消除漂移而改写合同、manifest、prompt 或执行记录。

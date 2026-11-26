# 锁定错误、CLI 与兼容矩阵

Type: grilling
Status: resolved
Blocked by: 03, 05

## Question

为 `UNSUPPORTED_FORMAT`、`INVALID_NOTE_V2` 和关系、生命周期、历史错误定义稳定诊断、退出码、`--json` 形状和支持列表。列出旧 runtime 和生产入口拒绝实验 v2、本地测试入口读取 v1/v2 混合树、未知 archive/config 格式的预期结果，并明确诊断所属层。

## Comments

2026-11-26 经用户确认，实验 v2 以本地测试通过为完成条件。已发布 `0.6.0` 的负向验收按实测的 `UNSUPPORTED_FORMAT` 和退出码 2 执行。桥接发行和实验格式的最低版本提示移出范围。

## Answer

保留 `--json` 外层结构和 v1 既有诊断及退出码。新格式诊断由 registry 返回 `UNSUPPORTED_FORMAT` 和退出码 2，`details.format` 记录遇到的格式，`details.supported_formats` 列出当前入口可读的同类文档格式。实验 v2 仅由本地测试入口识别，格式内 schema 或正文校验失败由 Adapter 返回 `INVALID_NOTE_V2` 和退出码 1。关系、生命周期、历史和事务错误继续使用核心诊断。

旧包和生产入口分别验收拒绝实验 v2 的行为，旧包断言以实测输出为准。测试入口验收 v1、合法 v2 和混合树，并以未知清单或配置格式验证同类支持列表和写入中止。 [ADR 的 CLI 错误契约](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#cli-错误契约)

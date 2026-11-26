# 多版本文档格式的适配器设计

Label: wayfinder:map

## Destination

为 `packages/agent-notes/` 形成可交接的 ADR 与设计草案，锁定 `agent-note/1`、代表性 `agent-note/2` 以及 archive、config 的版本适配边界。用本地实验 v2 验证混合版本树逐文件分派，并保持 lifecycle、relations、history、archive seal、rejected 不可变和 `expected_hash` 的核心不变量。

## Notes

设计评审已完成。实现与本地验收依据 [多版本文档格式通过 Adapter 共存](../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md) 和下列决定。

本地实现和验收结果见 [ADR 的实现验收](../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#实现验收)。

## Decisions so far

- 三类文档共用读取与分派，写入接口按文档职责定义。 [确定 canonical 模型与端口覆盖范围](issues/01-canonical-port-scope.md#answer)
- v2 阅读条件改名由 Adapter 转换，替代提前生效由核心控制，首轮只在测试中启用。 [选择 v2 表示变化与语义变化的边界](issues/02-v2-change-boundary.md#answer)
- 冻结 registry 支持逐文件分派，默认创建 v1，实验 v2 仅在本地测试入口注册。 [锁定 registry 与格式分派契约](issues/03-registry-and-dispatch.md#answer)
- v2 局部 patch 保留其余原字节，迁移只接受可无损转换的文件，首轮 v1 沿用既有写回行为。 [决定 opaque 字段与往返保证](issues/04-roundtrip-and-opaque-data.md#answer)
- 仅活跃 Note 可显式迁移，写入复用原字节 hash 与事务保护，历史以可重放结果识别机械转换。 [冻结写入、迁移与生命周期策略](issues/05-write-and-migration-policy.md#answer)
- 保留 CLI 外层和 v1 诊断，新格式错误提供结构化支持列表。 [锁定错误、CLI 与兼容矩阵](issues/06-errors-cli-compatibility.md#answer)
- 以固定旧版差分、共享保护测试和单文件单注册的假 v3 走查作为本地验收。 [设计可执行证据与假 v3 走查](issues/07-evidence-and-v3-proof.md#answer)

## Not yet specified

无。

## Out of scope

- v2 产品化、桥接版发行、实验格式的最低工具版本提示。
- 面向任意数据格式的通用版本化框架。
- 迁移或重新封存任何既有冻结历史。
- 全局 `--format` 状态、常驻迁移状态、全局配置和实现代码本身。

# 锁定 registry 与格式分派契约

Type: grilling
Status: resolved
Blocked by: 01

## Question

冻结 `noteFormatRegistry` 的注册项和分派顺序。决定 `format` 安全 sniff/readFormat、adapter 选择、完整 schema 校验、read/write/migrate 支持窗口、introducedIn/deprecatedIn/removedIn、默认版本和支持列表如何表达。明确未知格式、旧工具读新格式和混合版本树的诊断要求，并检验核心文件如何保持版本无感。

## Comments

## Answer

2026-11-26 经用户确认。冻结的 registry 按文档类别和 `format` 查找注册项，每项记录 Adapter、schema、读写及迁移权限和 `introducedIn`、`deprecatedIn`、`removedIn`。`create` 的默认项为 v1。按同日范围调整，生产入口只注册 v1，测试入口额外注册实验 v2 以验证原格式读写及显式迁移。新版本在兼容的载体上只需一个 Adapter 文件和一条静态注册。核心通过注入的格式接口读取和写入。 [ADR 的 Registry 与分派](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#registry-与分派)

分派先在同一快照内检查载体语法并读取顶层 `format`，再选择 Adapter 做完整校验。重复键或 YAML alias 在分派前拒绝，既有缺失或非字符串 `format` 的诊断按 v1 原行为保留。混合树按文件独立分派，配置、Note、清单和可复核的归档来源都使用各自快照中的字节。

不支持的版本列出该文档类别在当前入口可读的格式。未来正式格式的精确最低工具版本取自可信发行映射，实验 v2 的发行版本字段留空。

本地验收覆盖 v1 与实验 v2 混合树、非法载体优先于版本查找、已知版本内校验失败、未知版本的同类支持列表，以及生产入口拒绝实验 v2。

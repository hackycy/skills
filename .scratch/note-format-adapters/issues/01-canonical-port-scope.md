# 确定 canonical 模型与端口覆盖范围

Type: grilling
Status: resolved

## Question

三类文档应在哪一层共享 Adapter 分派接口？请锁定版本无关的 `Note`、`Manifest`、`Config` 模型及来源信息，明确核心如何统一管理身份、lifecycle、relations、history、事务和锁。回答要能支撑混合版本树的逐文件读取。

## Comments

## Answer

2026-11-26 经用户确认。Note、归档清单和项目配置共用安全的格式识别与逐文件分派。Adapter 返回版本无关的 `Note`、`Manifest` 或 `Config`。格式标识、原始字节和 SHA-256 保留在来源信息中。缺失的配置或清单可读取现有默认值，并明确标记为缺失来源。

写入接口按文档职责定义。Note 按原格式更新，归档清单追加新 seal，项目配置只在首装且缺失时初始化。身份、生命周期、关系、历史、seal 校验、事务和锁统一由核心处理。 [ADR 端口与 canonical 模型草案](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#端口与-canonical-模型草案)

验收场景使用活跃的 v2 implemented Note 和已有 seal 的 v1 清单。归档后 Note 仍为 v2，清单按 v1 追加条目。核心用归档文件的原始字节核对新 seal，并核对所有已有 seal 条目及其对应归档文件。

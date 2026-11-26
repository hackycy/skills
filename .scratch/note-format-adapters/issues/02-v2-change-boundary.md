# 选择 v2 表示变化与语义变化的边界

Type: grilling
Status: resolved
Blocked by: 01

## Question

选择一个可验证的 `agent-note/2`，至少包含一项字段或结构表示变化和一项 status、lifecycle 或 supersedes 生效规则变化。给出 v1↔v2 字段映射、canonical 化规则和兼容决策，并判定哪些变化只新增 adapter，哪些变化必须成为核心 policy 的显式能力或修改。需要覆盖 proposed、implemented、rejected、archived 的边界。

## Comments

## Answer

2026-11-26 经用户确认。v1 的 `read_when` 和 v2 的 `readWhen` 都映射到 canonical `metadata.read_when`，写回时各用本格式的字段名。仅改字段名的 v1、v2 输入应产生相同的 canonical 值，并运行同一套核心校验。 [ADR 的 v1、v2 映射与 policy 判定](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#v1v2-映射与-policy-判定)

本地测试中的 v2 Adapter 将可选的 `activation: on-proposal` 保留在 canonical `supersedes` 边上。v1 无法表达该值，降级遇到它时拒绝转换。测试装配现行 policy 时检测到该标记报告 `POLICY_FEATURE_UNSUPPORTED`，也可装配显式启用的实验 policy。启用后，活跃 implemented 的替代边继续生效。活跃 proposed 只有明确标记的边提前生效，rejected 和 archived 的出边仍不生效。

验收场景中，活跃的 v1 implemented 决定 A 通过 `related` 回链到 v2 proposed 后继 B。B 声明完整替代 A，C 的 `requires` 指向 A。普通替代保持 C 的依赖有效。加入标记后，现行 policy 明确拒绝该树，实验 policy 则验证 C 因 A 被完整替代而得到 `INVALID_RELATION`。将替代范围改为 partial 时，实验 policy 应保留 C 依赖 A 的资格。

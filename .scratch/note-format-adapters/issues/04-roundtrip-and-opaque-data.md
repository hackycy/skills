# 决定 opaque 字段与往返保证

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

为无法理解的字段、注释、YAML 排版和正文扩展决定 opaque 原样携带、显式拒绝操作或两者的边界。锁定 `parse → patch`、`parse → render → parse` 的保证、允许字节差异的操作以及信息损失预算，并说明 v1 的 `patchMetadata`、`archiveBytes`、`serialize` 如何被包装为零行为变化的 adapter 实现。

## Comments

## Answer

2026-11-26 经用户确认。v2 将 schema 允许的 opaque 扩展保存在来源中。`parse → patch → parse` 只改动获准的原字节范围。未触及的注释、YAML 排版、`extensions` 和正文字节原样保留，空 patch 返回相同字节。无法定位或应用安全修改时，整笔写入以 `UNSAFE_FORMAT_PATCH` 失败。

显式迁移的 `parse → render → parse` 允许改变格式标识及 frontmatter 排版，保留全部 canonical 字段、关系数组次序和正文字节。源 frontmatter 含注释或 opaque 扩展，或者目标格式无法表达一个 canonical 字段时，返回 `LOSSY_FORMAT_CONVERSION`，源文件原样保留。

首轮 v1 沿用 `patchMetadata`、`serialize` 和 `archiveBytes` 的写回行为。元数据 patch 可能重排 YAML，保留原正文字节。全草稿替换沿用原序列化方式，归档只插入必要字段并保留已有 frontmatter 和正文。全版本局部字节保真作为独立的 v1 写回变更验收。 [ADR 的信息损失预算](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#信息损失预算)

验收覆盖三类场景。含注释和扩展的 v2 文件只改 `readWhen` 后，改动范围外的字节相同。含注释、扩展或目标无法表达字段的迁移分别失败，且失败前后 hash 相同。v1 的相同输入由旧实现和 Adapter 写回，逐字节比较结果，并单独核对归档保留的原始字节。

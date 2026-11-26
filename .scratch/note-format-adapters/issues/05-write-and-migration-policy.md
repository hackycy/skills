# 冻结写入、迁移与生命周期策略

Type: grilling
Status: resolved
Blocked by: 02, 03, 04

## Question

锁定 update、transition、create、显式 migrate 的格式选择和事务边界。决定原格式保持、默认格式创建、`expected_hash`、同一事务中的逐文件迁移、仅活跃 Note 可迁移、archived/rejected 永不迁移，以及迁移后 `checkHistory` 如何区分机械格式升级与内容变更。证明 archive seal、rejected 正文和关系不变量仍由版本无关 policy 负责。

## Comments

## Answer

2026-11-26 经用户确认。`create` 选择 registry 默认格式。`update`、`transition`、`archive` 和反链修复按每个被写文件的来源选择 Adapter。归档清单按自身格式追加 seal，核心继续统一校验身份、关系、冻结归档、旧 seal 及 rejected 的正文与拒绝理由。

本地测试入口用显式 `migrate <id> --to <format> --input <file>` 验证格式转换。每次在原路径转换一篇 proposed 或未归档的 implemented Note，输入须包含原始字节的最新 `expected_hash` 和 `reason`。转换保持 ID、状态、全部 canonical 字段和正文字节。核心预检重读转换结果，通过现有锁、journal、hash 复查和恢复流程提交。同格式请求、rejected、archived 或有信息损失的转换失败。 [ADR 的写入与迁移策略](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#写入迁移和兼容矩阵)

`checkHistory` 先检查冻结、身份和生命周期。活跃 Note 在两端同 ID、同路径、同状态且 canonical 内容和正文字节一致时，只有从可信基线重放同一转换能得到完全相同的目标字节，才报告 `NOTE_FORMAT_MIGRATION`。同时变更内容或无法重放时仍使用 `NOTE_CHANGE_REVIEW`。Git 两端快照只能验证观察到的结果。每笔写入还与操作前快照比较，保护尚未提交的 rejected 或 archived 记录。

验收覆盖纯格式转换、迁移同时修改正文、基线重放不一致、陈旧 `expected_hash`、恢复冲突、归档重封存与 rejected 格式改写。正常迁移只改一个文件，失败后核对原字节或按现有恢复协议保留冲突现场。

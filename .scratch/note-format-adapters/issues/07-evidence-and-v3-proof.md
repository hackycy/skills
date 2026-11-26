# 设计可执行证据与假 v3 走查

Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 05, 06

## Question

制定本地验收方案，覆盖冻结语料与 canonical 快照、固定旧 runtime 的差分、旧 runtime 和生产入口拒绝实验 v2、property-based 往返、mutation 和依赖架构测试。决定每条语义不变量的独立验证来源，以及如何证明假 v3 只需一个 Adapter 文件和一行测试 registry 注册，核心零改动且 v1/v2 继续通过。

## Comments

## Answer

2026-11-26 经用户确认以下本地验收条件。

1. 先冻结 v1 的原始语料、canonical 输出和诊断。用固定旧 runtime 比较读取、诊断和写回字节。实验 v2 使用手写样例作为独立预期。
2. 用同一套测试验证混合树中的跨版本关系、归档 seal、rejected 正文和 `expected_hash`。用带可复现 seed 的属性测试验证两类往返，分别移除 v1 和 v2 注册并断言对应测试失败。
3. 在临时 checkout 添加一个假 v3 Adapter 文件和一行测试 registry 注册。验证 v1/v2/v3 混合树可读、v1/v2 回归测试通过，并核对核心文件的 Git diff 为空。

每项不变量的独立来源及生产入口的依赖图检查按 ADR 执行。CLI 断言采用已确认的错误码、退出码和 JSON 字段。 [ADR 的测试与证据计划](../../../packages/agent-notes/docs/maintainers/adr/0001-document-format-adapters.md#测试与证据计划) · [锁定错误、CLI 与兼容矩阵](06-errors-cli-compatibility.md#answer)

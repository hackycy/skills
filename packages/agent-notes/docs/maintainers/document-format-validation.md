# 持久文档格式适配验收记录

本记录保存 2026-11-26 对格式适配实现及当时产物的本地观察。实现随后提交为 `b607b44ba4b382a8a4975a82498bdf0bc70e328c`。持续适用的机制与复验方法见[持久文档格式适配](design.md#持久文档格式适配)和[格式适配验收](validation.md#格式适配验收)。

## 差分与格式回归

| 检查 | 当次结果 |
| --- | --- |
| v1 差分 | 固定旧提交用冻结 lockfile 构建。在仓库外的 Git 项目比较 15 组原始 Note 和 64 次 CLI 调用，覆盖 canonical 投影、诊断、退出码及各写命令 dry-run 报告的完整前后字节。 [差分脚本](../../tests/formats/compatibility.ts) |
| 旧包与候选的格式拒绝 | Node 24.16.0 下，已发布 0.6.0 的独立探针读取单份 v1 样例退出 0。它与候选生产包读取纯 v2 树及 v1/v2 混合树均报 `UNSUPPORTED_FORMAT`、退出 2。旧包报告文档路径并在消息中列出 v1，候选包另报告 `details.supported_formats`。 |
| 混合树和恢复 | 检查 worktree、index、commit、归档来源重放、rejected 保护、激活规则与局部字节保真。显式迁移在 prepared 和 committed 阶段分别被 SIGKILL 后恢复。 [格式回归](../../tests/formats/format-adapters.test.ts) |
| 属性测试 | 固定种子 `0x2C49E10C`，生成 64 组包含块式或流式 YAML、双语正文、引用和嵌套扩展的用例。 [往返属性测试](../../tests/formats/roundtrip.test.ts) |
| 变异和假 v3 | 7 个隔离变异均触发预期断言。移除三种 v1 Adapter 后，TypeScript 和生产构建均因缺少导入失败。新增一个 Adapter 文件和一行测试注册后，实际测试 CLI 读通 v1/v2/v3 混合树，74 个 v1/v2、policy 和架构回归用例通过。 [扩展验收脚本](../../tests/formats/extension-proof.sh) |

旧包 `@hackycy/agent-notes@0.6.0` 的 tarball integrity 为 `sha512-ZWsabExQPTTgSQFkVMLVsPrJ3RBKAcm413Duc7OWHjaBf7IEzzd3HMz4s4Pg7z0uRVfKPLpaj4sq/Tlp9AQ+Qw==`。

## 候选包与安装恢复

macOS arm64 上，`pnpm lint`、`pnpm exec tsc --noEmit`、`git diff --check`、文档链接检查和 317 个仓库测试通过。Node 22.12.0 与 24.16.0 均通过真实 tarball 的 bundle 和离线 npm 安装验收。每个 Node 版本覆盖 7 个接入集合、49 次宿主组合切换、14 次 A/B 版本切换和 7 次修复。容量审计通过，候选 tarball 仅含 v1 schema 和格式资源。A/B 中的 0.6.1 是含实际资源增量的本地夹具。 [实际包验收方法](validation.md#实际包验收)

| 本地产物 | SHA-256 |
| --- | --- |
| 候选 0.6.0 tarball | `38fb17776a66606f3da617e83fe66e0e07c33f223c0974578234e23a62a3de5c` |
| A/B 测试 0.6.1 tarball | `93aebd9da12c8211eb7509e8782de76d62ac602b968dbcadfaf114ee9be79fc8` |

候选恢复模块独立验证并恢复了固定旧提交生成的 prepared 和 committed `transaction/2` journal。当次用完整 CLI 复验首装中断场景时，旧包和当时的候选包均在写入 config 后中断的情况下由 `install --recover` 预检返回 `INVALID_INSTALLATION`。提交 `010b281283acfbb1b22d1633f7e6c122a97349a2` 随后修复了首装恢复，并加入配置和收据写入后的中断、committed 清理及并发冲突回归。 [首装恢复测试](../../tests/cli-input.test.ts)

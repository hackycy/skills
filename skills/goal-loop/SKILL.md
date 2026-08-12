---
name: goal-loop
description: 将已收敛的 Wayfinder 决策编译为严格串行的 Goal Runbook，并为当前唯一 active Gate 生成可复制执行提示词。
disable-model-invocation: true
---

# Goal Loop

把本 skill 当作编译器：Wayfinder 的决策工件是源码，Goal Runbook 是执行账本，`goal-prompt.md` 是当前 Gate 的派生产物。本 skill 只建立或验证执行控制面；不重跑 Wayfinder，不实施 Gate，也不替已批准的决策补充新设计。

## 1. 定位并锁定源码

要求用户传入一个已存在的工件路径。解析 Git 仓库根目录，并向上定位包含该工件的 `.scratch/<effort>/` 目录。无法唯一定位时停止，报告已检查的路径。

完整读取：

- 仓库根目录的 `CLAUDE.md` 与 `CONTEXT.md`；
- effort 目录中的 `map.md` 与 `spec.md`；
- `map.md`、`spec.md` 直接链接的本地 ADR 与 issue；
- 上述 issue 为理解已批准验收条件而直接链接的本地文档。

忽略外部 URL、页内锚点以及待生成的 `goal-runbook.md`、`goal-prompt.md`。其余本地链接必须存在。ADR 必须已接受，决策 issue 必须已解决。`map.md` 的 `Not yet specified` 必须为空，或明确声明没有未决事项；若该段仍有条目、待办或问题，则 Wayfinder 尚未收敛，停止并列出缺口。

将实际读取的决策文件列为源码集合，使用仓库相对 POSIX 路径，并计算每个文件原始字节的 SHA-256。只有源码集合完整、Wayfinder 已收敛时，本步骤完成。

## 2. 选择唯一分支

检查 effort 根目录中的 `goal-runbook.md`：

- 文件不存在时，执行“初始化账本”。
- 文件存在时，执行“验证账本”。

一次调用只走一个分支。

### 初始化账本

先完整读取 [`references/runbook-schema.md`](references/runbook-schema.md)。从 `spec.md` 的实施顺序以及已批准 issue 的验收条件编译 Gate；保持决策顺序，将依赖写成严格线性链。

每个 Gate 必须能从源码中明确得到 Objective、Scope boundary、Inputs 与 Acceptance gates。使用中文忠实表达，保留代码标识符和领域术语。不得凭经验补写产品行为、架构决定或验收政策。若任一 Gate 无法明确划分，停止并指出缺少哪项决策。

写入 `goal-runbook.md` 时记录源码集合及其 SHA-256；仅 G0 为 `active`，其余 Gate 为 `planned`。除这份账本外不得修改源码工件。账本通过 schema 中每一项初始化检查后，本分支完成。

### 验证账本

先完整读取 [`references/runbook-schema.md`](references/runbook-schema.md)。把账本中的源码基线与当前源码集合逐路径、逐哈希比较；任何新增、缺失或哈希变化都视为源码漂移，停止并报告差异，保持账本不变。

验证 schema、Gate 顺序、严格线性依赖、状态机、ledger/detail 状态一致性，以及 `passed`/`blocked` 的 Progress Log 证据。验证分支只读 `goal-runbook.md`，不得重写 Objective、Scope boundary、Inputs、Acceptance gates、状态或历史日志。

验证结果只能是：

- 正常：恰有一个 `active`，其前驱全为 `passed`，其后继全为 `planned`；继续生成提示词。
- 阻塞：恰有一个 `blocked`，无 `active`，其前驱全为 `passed`，其后继全为 `planned`；报告外部阻塞并停止。
- 完成：所有 Gate 均为 `passed`；报告 Goal 已完成并停止。
- 无效：不满足任一状态形状；列出具体不变量失败并停止。

只有账本及源码基线全部有效时，本分支完成。

## 3. 派生当前 Gate 提示词

只有正常状态可以进入本步骤。完整读取 [`references/goal-prompt-template.md`](references/goal-prompt-template.md)，用账本中的当前 Gate 原文渲染所有占位符；Inputs 需展开为可阅读的路径列表，Acceptance gates 需逐项完整保留。

将结果写入或替换 effort 根目录的 `goal-prompt.md`。该文件是派生产物，可以重建；Goal Runbook 仍是状态与证据的唯一真相。

最终回复说明是初始化还是验证分支、给出 runbook 与 prompt 路径，并完整输出生成的提示词。提示词中没有未替换占位符，且只授权当前 Gate 时，本步骤完成。

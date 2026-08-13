---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为唯一 active Gate 的 Goal Runbook 和可复制执行 prompt。
disable-model-invocation: true
---

# Goal Loop

把决策文档当作源码，把 `implementation-plan.md` 当作稳定的执行计划，把 `goal-runbook.md` 当作状态和证据账本，把 `goal-prompt.md` 当作当前 Gate 的派生产物。这个 skill 只生成和验证执行控制面；它不实现 Gate，也不替用户重新做已经批准的架构决策。

## 入口

用户必须提供一个本地路径：effort 目录、`map.md`、ADR/spec、或已有 `implementation-plan.md`。先解析 Git 仓库根目录，再定位 effort 目录。无法唯一定位时停止，并列出实际检查过的路径。

默认输出：

- `<effort>/implementation-plan.md`：从决策文档编译出的稳定 Gate 合同；已有文件不会被覆盖。
- `<effort>/goal-runbook.md`：唯一的状态、Gate 顺序和证据账本。
- `<effort>/goal-prompt.md`：从账本当前状态派生的单轮执行提示词。

`implementation-plan.md` 是可选的计划源码。存在时读取它，不覆盖它；它可以提供 Gate、依赖、范围和验收条件。若没有它，先按照 [`references/implementation-plan-schema.md`](references/implementation-plan-schema.md) 从收敛的 map/spec/ADR/已解决 issue 生成，再从计划编译账本。

如果 `implementation-plan.md` 有 `Current Execution State`，只在初始化时导入它的状态：Gate 名称、顺序和状态必须与 Gate 详情一一对应；`passed` 必须有逐项证据，`blocked` 必须有阻塞和恢复条件。任何不一致都停止，不把模糊状态改写成 `active`。初始化完成后，`goal-runbook.md` 成为唯一状态真相；计划文档的任何变化都属于源码漂移。

## 收敛入口

支持两种上游形态，二者都必须先完成决策收敛：

- **Decision-only**：用户已有 `CONTEXT.md`、已接受 ADR、spec 或已解决 decision issue，但没有 Wayfinder map。`CONTEXT.md` 只提供术语和领域事实；Gate、范围、验证和 Exit 必须来自 ADR、spec 或 issue，不得从 glossary 推断产品决策。
- **Wayfinder**：用户提供 map。`Not yet specified` 必须为空或明确写“无”，所有参与执行顺序和验收的 child decision 必须已解决。

两种入口最终都编译为同一份 `implementation-plan.md`、`goal-runbook.md` 和 `goal-prompt.md` 结构；执行阶段不再区分上游来源。

## 先选模式

一次调用只进入一个模式：

### 编译模式

当 `goal-runbook.md` 不存在时进入。完整读取所有决策源码；如果计划不存在，先完整读取 [`references/implementation-plan-schema.md`](references/implementation-plan-schema.md) 并生成计划；再读取 [`references/runbook-schema.md`](references/runbook-schema.md)，从计划编译严格线性的 Gate，写入账本，最后派生当前 prompt。

编译模式可以读取 `implementation-plan.md`，但不得把它的叙述原样当作隐含规则。必须将每个 Gate 归一化为计划 schema 和 runbook schema 要求的 Objective、Scope boundary、Inputs、Slice policy、Verification、Manual acceptance、Stop conditions、Rollback 和 Exit conditions。

### 验证模式

当 `goal-runbook.md` 已存在时进入。完整读取 schema，验证源码基线、Gate 顺序、状态机、字段完整性和历史证据；只在验证通过时重建 `goal-prompt.md`。验证失败时保持账本原样并报告具体不变量。

账本验证结果只有四种：

- `active`：恰有一个 active Gate，生成 prompt。
- `blocked`：恰有一个 blocked Gate，报告阻塞和恢复条件，不生成执行授权。
- `complete`：所有 Gate 都 passed，报告 Goal 完成，不生成执行授权。
- `invalid`：结构、基线或证据不一致，停止并要求重新确认决策。

## 源码集合和收敛检查

按以下顺序发现并读取文件：

1. 仓库根目录和目标路径上的适用 `CLAUDE.md`、`AGENTS.md`、`CONTEXT.md` 或 `CONTEXT-MAP.md`；按这些文件指向的上下文继续读取。`CONTEXT.md` 用于术语和领域事实，不单独产生 Gate Exit。
2. effort 中的 `map.md`、`spec.md`、`implementation-plan.md`，以及它们直接链接的本地 ADR、decision、issue 和验收依赖文档。
3. 当前 Gate Inputs 中明确列出的本地设计文档。

忽略外部 URL、页内锚点、`goal-runbook.md` 和 `goal-prompt.md`。其余本地链接必须存在。ADR 必须已接受，decision issue 必须已解决。

如果 map 有 `Not yet specified`、未决问题或待补决策，或决策文档明确标记 `TBD`、`TODO`、`open question`、`decision pending`，停止编译并逐项列出缺口。不要用经验、代码现状或默认测试命令替用户补齐决策。若某个 Gate 缺少可观察的 Exit 或唯一回退边界，同样停止。

把实际读取的决策文件记录为源码集合，使用仓库相对 POSIX 路径并计算原始字节 SHA-256。执行账本和派生 prompt 不属于源码基线；`implementation-plan.md` 若被读取则属于源码基线，执行期间不得由 Goal prompt 改写。

## 验证配置的编译规则

验证不是 skill 的固定命令，而是 Gate 合同的一部分。每个 Gate 必须从源码中得到以下配置：

- `directed verification`：验证当前 slice 或当前 Gate 的最小测试、检查、场景或观测入口。
- `repository verification`：仓库级命令或脚本的准确名称和顺序。优先读取 `package.json`、Makefile、CI、项目文档和现有 Gate 记录；命令不存在时不要猜测。
- `manual acceptance`：需要用户观察的 URL、场景、人工检查项和确认语句；没有人工验收时明确写“无”。
- `evidence rule`：什么输出、链接、计数、截图、日志或用户确认可以证明 Exit 条件满足。

如果源码没有给出验证入口，先从仓库配置查找；仍然找不到就停止编译，不写入执行授权。不得把“运行测试”“全部通过”这类空泛文字当作验证配置，也不得把失败命令删掉、跳过或降级为建议。

将项目特有的技术约束放入 Gate 的 `Constraints` 或 `Verification` 字段。主 prompt 只提供跨项目稳定的行为协议，不出现 Bun、Vue、SSE、Playwright、`pnpm` 等项目专属词，除非它们确实由当前 Gate 合同注入。

## 编译账本

先完整读取 [`references/runbook-schema.md`](references/runbook-schema.md)。从决策源码提取 Gate，保持依赖顺序；默认使用 `G0` 开始的连续编号，每个 Gate 只依赖紧邻前驱。一个 Gate 必须有单一可验证 Objective，正向 Scope boundary，明确 Inputs，单一 slice policy，验证配置，Stop conditions，Rollback 和逐项 Exit conditions。

初始化时只允许：

- 新建 `implementation-plan.md`（仅当它不存在）；
- 新建 `goal-runbook.md`；
- 新建或替换 `goal-prompt.md`；
- 不修改已有的 implementation plan，以及 map、ADR、spec、issue、上下文或实现代码。

新账本只有 G0 为 `active`，其余为 `planned`。账本通过 schema 的初始化检查后再生成 prompt。

## 派生执行 prompt

只有账本处于正常 `active` 状态才读取 [`references/goal-prompt-template.md`](references/goal-prompt-template.md)。将当前 Gate 的原文、Inputs、验证配置、Stop conditions、Rollback 和 Exit conditions 完整渲染；逐字替换所有占位符，不保留模板说明或空字段。

生成的 prompt 必须：

- 只授权当前唯一 active Gate；
- 要求执行者先检查账本状态、源码基线和现有工作区修改；
- 要求执行者按 Gate 合同选择最小可验证 slice，并在每个 slice 后执行该 Gate 声明的 directed/repository/manual 验证；
- 要求失败时诊断、修复并重新验证，不改变测试强度；
- 要求把证据追加到当前 Gate 的 Progress Log；
- 遇到 Stop condition 时暂停，不擅自改决策或进入后继 Gate；
- 人工验收存在时，自动化工作完成后提供 URL 和最小清单并暂停，直到用户确认。

模板中的仓库说明入口如果不存在，渲染为“无；按仓库配置和当前 Gate Inputs 执行”，不得留下空占位符。验证命令的执行时机以 Gate 合同为准：计划明确为每个 slice 时逐 slice 执行，明确为 Gate 收尾时只在 Exit 判断前执行。

最终回复说明走的是编译还是验证模式，给出计划、账本和 prompt 路径，并完整输出生成的 prompt。若计划无法编译，或账本阻塞、完成或无效，只报告原因和证据，不输出执行授权。

# Implementation Plan Schema

`implementation-plan.md` 是决策文档到执行状态之间的稳定合同层。它描述最终结果、Gate 顺序、每个 Gate 的执行边界和可证明完成条件；不记录当前执行状态、slice 历史或临时调试结果。

## 顶层结构

按以下顺序写入：

1. `# <effort 名称> Implementation Plan`
2. `## Contract Sources`
3. `## Source Decisions`
4. `## Outcome`
5. `## Non-Negotiable Rules`
6. `## Gate Overview`
7. 按执行顺序排列的 Gate 详情
8. `## Definition Of Done`
9. `## Explicitly Out Of Scope`

## Contract Sources

`Contract Sources` 是 `goal/contract-baseline.json` 的机器可校验输入集合。只列实际参与 Gate 合同形成的仓库文件，不包含 `goal/` 下的运行态文件。

```markdown
| Path | Role |
| --- | --- |
| `docs/decisions/ADR-001.md` | 决定数据边界与回退策略 |
| `docs/spec.md` | 决定行为、验收与兼容性要求 |
```

路径使用仓库相对 POSIX 路径，按字典序排列且不得重复。所有用于编译计划并可能改变 Scope、Verification、Stop conditions 或 Exit conditions 的文件都必须列出。`implementation-plan.md` 由 baseline 自动加入，不写入该表。

## Gate Overview

Gate 从 G0 连续编号。每个 Gate 只能有一个直接前驱；执行控制面使用线性 Gate 顺序作为恢复边界。

```markdown
| Gate | Name | Unlock condition | Outcome |
| --- | --- | --- | --- |
| G0 | Prepare | 开始 | <一句话结果> |
| G1 | Finish | G0 Exit 全部满足 | <一句话结果> |
```

## Gate 详情

每个 Gate 必须包含：`Purpose`、`Inputs`、`Objective`、`Scope boundary`、`Constraints`、`Slice policy`、`Verification`、`Evidence rule`、`Stop conditions` 和 `Exit conditions`。Gate 合同不包含 rollback 字段；代码版本和代码回退由用户的 Git 流程负责。

### Verification

由此 skill 编译的计划使用稳定 Verification ID。三类检查分别使用 `D<n>`、`R<n>`、`M<n>`，编号在 Gate 内按类别从 1 连续递增。

#### Directed

```markdown
| ID | Check | Evidence inputs |
| --- | --- | --- |
| D1 | 确认迁移后不存在旧字段读取路径 | `src/migration/**`, `tests/migration/**` |
```

Directed check 由模型判断语义事实，control script 固定 check id、outcome 和 Evidence inputs snapshot。

#### Repository

```markdown
| ID | Command | Evidence inputs |
| --- | --- | --- |
| R1 | `python -m unittest tests.test_migration` | `src/migration/**`, `tests/test_migration.py` |
```

Repository check 的 Command 必须是仓库中真实可执行的项目命令。control script 在仓库根目录执行该命令，记录 exit code、状态和最多 4 KiB 的当前命令输出；stdout/stderr 不写入 `goal/`。

#### Manual acceptance

```markdown
| ID | Scenario | Evidence inputs |
| --- | --- | --- |
| M1 | 用户确认升级后的 dashboard 数据和交互符合 spec | `src/dashboard/**` |
```

没有人工验收时写“无”，不要创建空表。

`Evidence inputs` 使用仓库相对文件或 glob，可用逗号分隔。没有代码输入的环境检查可以写 `none`。不得引用 `goal/` 运行态文件。

### Evidence rule

Evidence rule 使用固定表格：

```markdown
| Exit | Required checks |
| --- | --- |
| E1 | D1, R1 |
| E2 | R2 |
| E3 | M1 |
```

规则：

- 每个 Exit 必须至少引用一个当前 Gate 已声明 check。
- 每个 Verification check 必须至少被一个 Exit 引用。
- Exit 只能由 Verification check 结果满足。
- Exit 在其全部 required checks 的最新 effective result 为 pass 时进入 `Satisfied exits`。
- `pass-gate` 还要求 required passing checks 的 Evidence snapshot 与当前 Evidence inputs 一致。

`Evidence rule` 只接受 `Required checks`。自由文本 `Required evidence` 不属于有效格式。

### Stop conditions

Stop conditions 使用稳定 ID：

```markdown
- `SC1`: staging database unavailable
- `SC2`: migration result conflicts with ADR-012
```

没有 Stop condition 时写“无”。`block` 只能引用当前 Gate 声明的 `SC<n>`。

### Exit conditions

```markdown
- `E1`: <可观察、可证明的条件>
- `E2`: <可观察、可证明的条件>
```

Exit id 从 E1 连续编号。Exit condition 描述可观察结果，不写“代码完成”或单纯“测试通过”。

## Definition Of Done

列出整个 effort 的最终条件。每项必须能回溯到一个或多个 Gate Exit。

## Explicitly Out Of Scope

只列决策文档明确排除且本 effort 不会实现的工作。尚未决策的事项应回到决策文档处理。

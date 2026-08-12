# Goal Runbook Schema

初始化和验证 `goal-runbook.md` 时使用本 schema。账本正文统一使用中文；状态值固定为 `planned`、`active`、`blocked`、`passed`。

## 顶层结构

按以下顺序写入：

1. `# <effort 名称> Goal Runbook`
2. `## 用途`
3. `## 源码基线`
4. `## 运行规则`
5. `## 状态说明`
6. `## Goal Ledger`
7. 按 ledger 顺序排列的 Gate 详情

用途段声明：账本记录已批准的 Gate 顺序、状态、验收条件和执行证据；完整执行提示词属于 `goal-prompt.md`，不写入账本。

## 源码基线

使用固定表格：

```markdown
| 路径 | SHA-256 |
| --- | --- |
| `CLAUDE.md` | `<64 位小写十六进制>` |
```

规则：

- 路径相对仓库根目录，使用 POSIX 分隔符，并按路径字典序排列。
- 包含 `CLAUDE.md`、`CONTEXT.md`、effort 的 `map.md`、`spec.md`，以及实际读取的 ADR、issue 和其验收依赖文档。
- 排除 `goal-runbook.md` 与 `goal-prompt.md`。
- 哈希覆盖文件原始字节。验证时源码路径集合和哈希必须完全相等。

## 运行规则

至少固定以下不变量：

1. 一次只执行一个 Gate，并按 ledger 顺序推进。
2. Gate 仅在直接前驱为 `passed` 后成为 `active`。
3. 当前 Gate 的 Objective、Scope boundary、Inputs 与 Acceptance gates 在执行期间不可变。
4. 每轮执行都向当前 Gate 的 Progress Log 追加证据。
5. `passed` 需要每条 Acceptance gate 的明确证据；测试失败保持 `active`；`blocked` 只用于外部依赖或必须由用户决策的停止条件。
6. 当前 Gate 通过时，将直接后继标记为 `active` 但不执行它；最后一个 Gate 通过时结束 Goal。
7. 保留无关工作区修改；只有当前 Gate 明确授权的语义可以改变。

## Goal Ledger

使用固定表格：

```markdown
| Gate | 状态 | 依赖 | Objective |
| --- | --- | --- | --- |
| G0: <名称> | active | 无 | <一句话目标> |
| G1: <名称> | planned | G0 | <一句话目标> |
```

Gate 从 G0 连续编号。G0 依赖为“无”；每个后继只依赖紧邻前驱，形成严格线性链。

## Gate 详情

每个 Gate 使用完全相同的字段：

```markdown
## G0: <名称>

**状态：** active

**依赖：** 无

**Inputs：** <源码文档、相关代码区域和验证入口；使用路径或链接>

**Objective：** <一个可验证的执行目标>

**Scope boundary：** <正向范围，以及阻止进入后续 Gate 的边界>

**Acceptance gates：**

- <可观察、可证明的条件>

### Progress Log

- <YYYY-MM-DD>: `active`。账本已初始化；本 Gate 尚未开始实施。
```

Inputs 只列 Gate 开工时必须读取的材料。Acceptance gates 必须来自 spec、ADR 或已解决 issue，并保留其可观察强度；不得把“必须通过”降为“尽量通过”。

## 状态机检查

Ledger 与每个 Gate 详情中的状态、依赖必须一致，并满足以下唯一形状之一：

- 正常：`passed* active planned*`
- 阻塞：`passed* blocked planned*`
- 完成：`passed+`

其他组合无效，包括零 Gate、多个 `active`、`active` 与 `blocked` 并存、`planned` 后出现 `passed`，或越过未通过前驱。

每个 `passed` Gate 的 Progress Log 必须逐项覆盖其 Acceptance gates，并记录最终验证命令及结果。`blocked` Gate 必须记录具体外部依赖、已完成的安全检查以及恢复条件。`planned` Gate 不得包含实施证据。

## 原子转换

执行任务只能追加 Progress Log，并在证据齐全后执行一次原子状态转换：

- 当前 Gate：ledger 与详情从 `active` 改为 `passed`，追加最终证据。
- 直接后继：若存在，ledger 与详情从 `planned` 改为 `active`，追加“已激活，尚未开始实施”的日志；立即停止。
- 无直接后继：所有 Gate 均为 `passed`，追加 Goal 完成证据并停止。

任何源码漂移、状态无效或证据缺失都保持账本原样，由用户重新确认决策后再处理。

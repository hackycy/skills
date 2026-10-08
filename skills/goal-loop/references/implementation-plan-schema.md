# 合同编译

`implementation-plan.md` 保留人类可读说明，包含且只包含一个 `goal-loop-contract` JSON fenced block。块外内容是说明；所有影响行为的约束必须进入块内。编译器冻结计划原始 bytes，并规范化文本换行和首尾空白；argv 的字符原样保留。

## 从完成标准拆分 Gate

先从已接受决策确定 `outcome` 与 `definition_of_done`，再反推证明这些结果所需的 Gate。每个 Gate 关闭一项明确风险或建立一项可验证能力，目标是实际可观察行为；“代码写完”或“命令通过”不能单独作为 Exit。

按前置能力编排线性顺序，明确每个 Gate 允许修改的范围和留给后继的内容。所有 Gate 的 Exit 应共同证明整个 effort 完成，包括适用的集成、回归、兼容性和人工验收；不要仅列出局部开发步骤，也不要为不适用的环节机械增加 Gate。

将执行方法写入现有合同字段：

- `objective`、`scope` 和 `inputs`：单一目标、允许改变的边界、必要决策与代码入口。
- `slice_policy`：按行为、调用簇或领域边界选择最小可独立验证和回退的 slice，说明适用的先后顺序。slice 是 agent 内部推进单位；同一 Goal 可连续完成多个 slice，运行进度写入 checkpoint。
- `checks[].description` 与 `constraints`：每项检查何时执行（适用 slice 后或 Gate 收尾）、执行顺序、观察对象与预期结果。D 检查覆盖语义，R 检查给出真实 argv，M 检查说明验收入口、最小场景和明确结果形式。检查列表顺序本身不会驱动脚本调度。
- `exits`、`coverage` 和 `evidence_inputs`：把接受的需求逐项对应到可观察结果、所需检查和完整输入范围。机器检查引用关系，模型审查是否遗漏决策或误用证据。
- `stop_conditions` 与 `rollback`：明确确实阻止继续的外部依赖或决策缺口，以及受影响 slice 的可逆边界。普通测试失败进入修复与重验，不作为默认 Stop condition。

人工验收前必须完成的自动检查及交接准备也写入合同。无需人工验收时不创建 M 检查；需要时必须由明确结果满足对应 Exit。计划只定义工作与验收，不保存当前 Gate、Revision 或运行进度，不引用固定 prompt 文件。

## 合同示例

以下为完整示例。先确认对应来源、代码和检查脚本真实存在，再按项目决策编写；不要照搬示例的产品选择。

````markdown
# Example Implementation Plan

```goal-loop-contract
{
  "schema": "goal-loop/contract",
  "format_version": 1,
  "sources": [{"path": "docs/spec.md", "role": "defines accepted behavior"}],
  "outcome": "用户可读取经过验证的数据",
  "rules": ["保留未授权改变的 API 语义"],
  "definition_of_done": [{"description": "读取行为满足 spec", "exits": ["G0:E1"]}],
  "out_of_scope": ["更改写入接口"],
  "coverage": [{"source": "docs/spec.md", "decision": "accepted read behavior", "exits": ["G0:E1"]}],
  "gates": [{
    "id": "G0",
    "name": "Read behavior",
    "objective": "实现 spec 定义的读取行为",
    "inputs": ["docs/spec.md", "src/reader.py"],
    "scope": "读取路径及其测试",
    "constraints": ["保留错误响应结构"],
    "slice_policy": "每个 slice 对应一种可观察读取行为",
    "checks": [
      {"id": "D1", "description": "每个读取 slice 后检查受影响调用遵循 spec；Gate 收尾覆盖全部读取调用", "evidence_inputs": ["src/**", "tests/**"]},
      {"id": "R1", "description": "每个 slice 的 D1 通过后执行读取回归；Gate 收尾在 M1 交接前确认最终代码通过", "evidence_inputs": ["src/**", "tests/**"], "argv": ["python", "-m", "unittest", "discover", "-s", "tests"], "timeout_seconds": 900},
      {"id": "M1", "description": "最终 D1/R1 通过后提供当前构建的读取页面入口；用户检查正常读取、空值与错误详情，按 attempt ID 明确回复通过或未通过及观察事实", "evidence_inputs": ["src/**", "tests/**"]}
    ],
    "exits": [{"id": "E1", "description": "正常读取与错误展示符合 spec", "checks": ["D1", "R1", "M1"]}],
    "stop_conditions": [{"id": "SC1", "description": "所需外部数据不可用"}],
    "rollback": "还原该 slice 的读取行为变更并重新验证"
  }]
}
```
````

## 合同字段

- `sources`：实际决定范围、验收、约束或回退的仓库相对 POSIX 文件路径及其角色。禁止包含工作计划自身和 effort 的运行文件。每个来源必须被 coverage 使用。
- `coverage`：来源中的具体决策定位到一个或多个 `G<n>:E<n>`；必须覆盖每个 Exit。模型检查含义，脚本检查引用。
- `outcome`、`rules`、`definition_of_done`、`out_of_scope` 是全局合同。完成标准每项必须引用存在的 Exit。
- Gate 从 G0 连续编号，顺序就是依赖关系。Gate 字段全部必填；允许 `inputs`、`constraints`、`stop_conditions` 为空列表。
- 每类检查在 Gate 内从 D1/R1/M1 连续编号；每项检查至少被一个 Exit 使用。Exit 从 E1 连续编号，至少要求一个检查。
- `stop_conditions` 从 SC1 连续编号；没有时用空列表。
- `argv` 仅用于 R 检查，是非空字符串数组，按独立参数传给进程。运行目录固定为仓库根。需要 shell 时显式写入解释器及参数；Windows `.cmd` 项目入口显式使用 `cmd.exe /d /c`。
- `timeout_seconds` 仅用于 R 检查，默认 900，范围大于 0 且不超过 86400。
- `evidence_inputs` 为文件或 glob 数组，递归目录包含隐藏文件；排除 `.git` 和当前 effort 运行文件。路径必须留在仓库内。不要把缓存或运行输出纳入检查输入。
- 无文件输入的环境检查使用 `"evidence_inputs": [], "environment": true`；其新鲜度仅限当前 GateRun，不能证明外部环境未变。其他检查必须至少有一个输入模式。

Evidence inputs 应覆盖影响结果的代码、测试、配置、命令脚本与依赖清单。单个模式无匹配文件时不能开始检查；删除或新增匹配文件会影响后续新鲜度。

## 编译步骤

1. 阅读相关已接受决策和仓库入口，确认目标、范围、验收与回退已收敛，定义整个 effort 的可观察完成标准。
2. 按上述方法拆分 Gate，明确依赖、切片、验证时机与顺序，建立“来源决策 → Exit → 检查 → Evidence inputs”的覆盖关系。
3. 确认 D/M 观察或交接入口可落实、R 命令真实可用且不会修改其证据输入，明确运行时间上限。
4. 审查全部接受的需求、适用的集成与回归是否覆盖，以及 Gate 边界是否足以让新的 Goal 独立接续，再执行 bootstrap。存在运行记录时使用合同修订流程。

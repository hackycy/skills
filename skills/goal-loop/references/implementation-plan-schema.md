# 合同编译

`implementation-plan.md` 保留人类可读说明，包含且只包含一个 `goal-loop-contract` JSON fenced block。块外内容是说明；所有影响行为的约束必须进入块内。编译器冻结计划原始 bytes，并规范化文本换行和首尾空白；argv 的字符原样保留。

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
      {"id": "D1", "description": "检查所有读取调用遵循 spec", "evidence_inputs": ["src/**", "tests/**"]},
      {"id": "R1", "description": "执行读取回归测试", "evidence_inputs": ["src/**", "tests/**"], "argv": ["python", "-m", "unittest", "discover", "-s", "tests"], "timeout_seconds": 900},
      {"id": "M1", "description": "用户确认读取结果与错误展示", "evidence_inputs": ["src/**"]}
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

1. 阅读相关已接受决策，确认本 effort 的目标、范围、验收和回退已经收敛。
2. 建立覆盖关系并选择可独立执行的 Gate，检查每个 Exit 描述实际结果。
3. 确认 R 命令可用且不会修改其证据输入，明确运行时间上限。
4. 审查合同含义，再执行 bootstrap。存在运行记录时使用合同修订流程。

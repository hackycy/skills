# 合同修订

ContractRevision 保存冻结的计划 bytes、规范化合同、来源文件内容与摘要、修订理由。工作计划和当前来源文件的变化不自动改变已接受合同。

## 预览与提交

在仓库内编写候选计划，使用独立文件保留工作计划直到提交。已直接修改工作计划时，也必须经过此流程。

```text
python CTL revise-contract EFFORT --plan CANDIDATE --mode revalidate --reason "ADR 接受分页语义调整"
```

不传 `--preview-digest` 是只读预览。审查返回的起点和规范化行为差异；提交时提供同一参数、返回的摘要及 Revision：

```text
python CTL revise-contract EFFORT --plan CANDIDATE --mode revalidate --reason "ADR 接受分页语义调整" --preview-digest DIGEST --expected-revision REVISION
```

摘要绑定当前提交 head、候选内容、来源快照、模式、影响起点和理由。期间任一内容变化必须重新预览。已有用户授权足以覆盖的修订可直接完成此工作流，不额外制造批准步骤。

## 两种修订

- `equivalent`：规范化行为合同必须完全一致。来源内容、路径或覆盖定位可以变化，理由必须说明为什么行为仍等价。保留执行轮次和有效证据，不替换其起始快照。
- `revalidate`：从最早受影响的 Gate 创建执行轮次并清空其及后继的有效证据。全局合同变化从 G0 开始。`--from-gate G<n>` 可要求更早重验，不能跳过受影响 Gate；行为相同但要主动重验时必须指定起点。

Gate 删除、增加、重排或合同字段变化都会参与比较。所有历史合同和 GateRun 保留。已经完成的 effort 也可重新打开；代码保持原状，由执行者判断需要修改还是重新验证。

受影响的 D/M 等待会终止，其后到达的结果不能记入其他 attempt。R 执行者仍存活时，先取消并让其结束，再修订。等价修订可以保留 M 等待，但待验对象仍是原 attempt 的快照。

## 来源漂移

status/validate 显示具体漂移文件；实现和通过证据暂停。仍可取消、诊断、恢复或提交合同修订。对已经发出的验收回复可以保留观察事实，但存在合同漂移时结果为 stale。

候选计划提交后脚本安装冻结内容。若提交后宿主中断，recover 仅在工作计划仍等于提交时的原文件时完成安装；发现其他修改则保留文件并报告漂移。

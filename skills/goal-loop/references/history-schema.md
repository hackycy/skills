# Goal History Schema

`goal/history/G<n>.md` 是单个 Gate 的 append-only 冷历史。它记录可追溯事实，不决定 Gate 当前状态；Gate 状态只由 `goal/runbook.md` 的 Goal Ledger 决定。

## 生命周期

- Gate 第一次从 `planned` 变为 `active` 时创建文件并追加 `initialized` 事件。
- `active` / `blocked` 期间只在文件末尾追加事件，不改写已有字节。
- Gate `passed` 后文件进入 cold history；后续 Goal 默认不加载。
- 历史事实需要修正时追加 `correction` 事件，引用被修正 event id；不得悄悄修改旧事件。

## 文件结构

```markdown
# G2: <名称> History

Schema: `goal-loop/history-v1`
Plan contract: `implementation-plan.md` -> `G2: <名称>`

## Events

### G2-E0001 · initialized

- At: `2026-10-02`
- Type: `initialized`
- Slice: `none`
- Changed: none
- Verification: none
- Result: Gate activated; implementation has not started.
- Satisfies: `none`
- Risk: none
- Next: <第一个 slice 或准备动作>

### G2-E0002 · slice

- At: `2026-10-02`
- Type: `slice`
- Slice: `S1`
- Changed: `src/a.ts`, `src/b.ts`
- Verification: `directed-parser=PASS`
- Result: <可观察结果>
- Satisfies: `E1`
- Risk: none
- Next: <下一动作>
```

事件永远追加在 `## Events` 之后；文件不维护需要重写的“当前状态表”。

## Event 规则

event id 固定为 `G<n>-E<4位连续序号>`，从 `E0001` 开始。允许类型：

- `initialized`：Gate 激活；
- `slice`：一个最小 slice 完成或形成稳定检查点；
- `verification`：独立验证结果；
- `failure`：验证或实现失败以及已知诊断；
- `correction`：修正旧 event 的事实，不删除旧 event；
- `blocked`：命中计划 Stop condition；
- `resumed`：阻塞解除；
- `manual-handoff`：自动化结束并交给人工验收；
- `manual-result`：新的 Goal 收到明确人工验收结果；
- `rollback`：执行计划声明的回退；
- `gate-passed`：全部 Exit evidence 完成后的最终事件。

每个事件至少记录：

- `At`
- `Type`
- `Slice`
- `Changed`
- `Verification`
- `Result`
- `Satisfies`
- `Risk`
- `Next`

`Satisfies` 只能写当前 Gate 计划中真实存在的 Exit id；没有时写 `none`。字段内容应简短，不得把整个对话、思考过程或无关代码摘录写入 history。目标是记录事实和证据，不是 Agent 日记。

## Slice 与 checkpoint

Slice id 在 Gate 内使用 `S1`、`S2`…。一个 slice 只包含一个行为或调用簇。

完成事件后，runbook checkpoint 只保留：

- 最近 event id；
- 最近完成 slice / 当前 slice；
- 已由 event `Satisfies` 证明的 Exit id；
- 当前风险 / blocker；
- manual acceptance；
- 下一动作。

不要把 event 正文复制到 checkpoint。

## Manual acceptance

`manual-handoff` 事件增加稳定 acceptance id：

```markdown
### G2-E0013 · manual-handoff

- At: `2026-10-02`
- Type: `manual-handoff`
- Slice: `none`
- Acceptance: `G2-A1`
- Changed: none
- Verification: `repository=PASS`
- Result: 自动化边界完成；验收入口为 <URL/入口>。
- Satisfies: `none`
- Risk: none
- Next: 用户在新的 Goal 中回复 `G2-A1: pass` 或 `G2-A1: fail - <原因>`。
```

runbook 同时写：

```markdown
- Manual acceptance: `pending G2-A1`
```

收到结果时追加 `manual-result`；通过时该 event 的 `Satisfies` 写它实际证明的 Exit。不得修改 handoff 事件。

## Gate 通过事件

Gate 通过时不重写历史摘要，而是追加最终 `gate-passed` 事件：

```markdown
### G2-E0016 · gate-passed

- At: `2026-10-02`
- Type: `gate-passed`
- Slice: `none`
- Changed: none
- Verification: `final-repository=PASS`
- Result: all Gate exit conditions satisfied.
- Satisfies: `none`
- Exit evidence: `E1=G2-E0008; E2=G2-E0011; E3=G2-E0015`
- Risk: none
- Next: activate G3 in a new Goal.
```

规则：

- `Exit evidence` 的 Exit id 必须与 plan 当前 Gate 的 Exit conditions 完全一致。
- 每个 evidence event 必须已存在于本文件，且该 event 的 `Satisfies` 包含对应 Exit。
- `gate-passed` 不能引用自己作为 Exit evidence。
- Goal Ledger 的 `Unlock evidence` 写为 `goal/history/G2.md@G2-E0016`。
- `gate-passed` 是状态转换摘要，不替代被引用的验证/人工证据。

## 读取策略

正常 Goal 不读取完整 history。只在以下情况按需读取相关 event：

- checkpoint 引用不足以继续；
- 验证失败需要定位最近修改；
- rollback；
- 人工验收结果处理；
- validator 报告 event / evidence 引用异常；
- 用户要求审计历史。

passed Gate history 默认不读。历史很大时，应优先按 event id、Exit id 或最近相关 slice 定位，而不是从头读取。

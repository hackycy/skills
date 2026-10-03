# Goal History Schema

`goal/history/G<n>.md` 是单个 Gate 的 append-only 证据历史。它记录执行事实和 Exit evidence，不决定 Gate 当前状态；Gate 状态由 `goal/runbook.md` 的 Goal Ledger 决定。

Schema: `goal-loop/history-v2`

## 生命周期

- Gate 从 `planned` 进入 `active` 时创建文件并追加 `initialized` event。
- `active` / `blocked` 期间只在文件末尾追加 event；历史事实需要修正时追加 `correction`，不得改写旧 event。
- 每个 event 包含 `Prev event hash` 与 `Event hash`。validator 重算 hash chain，并要求 runbook 的 `History head` 等于 history tail hash。
- Gate `passed` 后 history 进入冷存储；后续 Goal 默认不加载。
- hash chain 用于发现控制面内部的历史改写或断链；需要抵抗能够同时重写全部控制文件的修改时，应依赖 Git commit、只读存储或其他外部不可变锚点。

## 文件结构

```markdown
# G2: <名称> History

Schema: `goal-loop/history-v2`
Plan contract: `implementation-plan.md` -> `G2: <名称>`

## Events

### G2-E0001 · initialized

- At: 2026-10-03
- Type: initialized
- Slice: none
- Changed: none
- Verification: none
- Result: Gate activated; implementation has not started.
- Satisfies: none
- Risk: none
- Next: select the first slice from the Gate contract
- Prev event hash: none
- Event hash: <64 位小写十六进制>
```

## Event id 与字段

event id 固定为 `G<n>-E<4位连续序号>`，从 `E0001` 开始。允许类型：

- `initialized`：Gate 激活；
- `slice`：一个最小 slice 完成并形成稳定事实；
- `verification`：独立验证结果；
- `failure`：实现或验证失败及已知诊断；
- `checkpoint`：在稳定且已验证的恢复点结束当前 Goal，Gate 保持 `active`；
- `correction`：修正既有 event；
- `blocked`：命中计划 Stop condition；
- `resumed`：阻塞解除；
- `manual-handoff`：自动化边界完成并交给人工验收；
- `manual-result`：收到明确的人工验收结果；
- `rollback`：执行计划声明的回退动作；
- `contract-reconciled`：合同输入文件变化后，显式确认计划合同仍有效并刷新 baseline；
- `gate-passed`：全部 Exit evidence 完成后的状态转换摘要。

每个 event 至少记录：

- `At`
- `Type`
- `Slice`
- `Changed`
- `Verification`
- `Result`
- `Satisfies`
- `Risk`
- `Next`
- `Prev event hash`
- `Event hash`

`Satisfies` 只能写当前 Gate 真实存在的 Exit id；没有时写 `none`。字段只记录事实和证据，不记录思考过程或完整对话。

`Event hash` 使用以下 canonical payload 的 SHA-256：event id、event type，以及除 `Event hash` 外按字段名排序的字段键值。`Prev event hash` 参与当前 event hash 计算；首个 event 使用 `none`。

## checkpoint event

当一个稳定、已验证的 slice 已完成，而下一 slice 不适合在当前 Goal 的剩余上下文或工具预算中完整完成时，可以追加：

```markdown
### G2-E0010 · checkpoint

- At: 2026-10-03
- Type: checkpoint
- Slice: none
- Changed: none
- Verification: repository=PASS
- Result: S6 已完成并验证；执行状态可从 S7 恢复。
- Satisfies: none
- Risk: none
- Next: execute S7 from the current Gate contract
- Prev event hash: <G2-E0009 hash>
- Event hash: <当前 event hash>
```

随后重写 runbook checkpoint，运行 validator，并以 Gate 仍为 `active` 的状态成功结束当前 Goal。`checkpoint` 不是失败，也不是 `blocked`。

## correction 与证据失效

`correction` 必须引用一个更早的 event：

```markdown
- Corrects: G2-E0008
- Evidence effect: invalidate
```

`Evidence effect` 只允许：

- `retain`：修正描述性事实，但被引用 event 仍可作为 Exit evidence；
- `invalidate`：被引用 event 不再计入有效 Exit evidence。

如果 correction 本身重新证明某个 Exit，可以在 correction 的 `Satisfies` 中写对应 Exit id。validator 计算的是 effective evidence，而不是所有历史 `Satisfies` 的简单并集。

## Manual acceptance

`manual-handoff` 必须带稳定 acceptance id：

```markdown
- Acceptance: G2-A1
```

runbook 同时写：

```markdown
- Manual acceptance: `pending G2-A1`
```

`manual-result` 必须引用同一个 `Acceptance`。每个 acceptance id 只能 handoff 一次、result 一次。待验收期间 Gate 保持 `active`，当前 Goal 结束且不轮询。

## blocked / resumed

`blocked` 只用于计划声明的 Stop condition。history 状态转换必须满足：

```text
active -> blocked -> resumed -> active
```

不能在没有 `blocked` 的情况下追加 `resumed`；Ledger 从 `blocked` 返回 `active` 时必须已有对应的 `resumed` event。

## Gate 通过事件

`gate-passed` 必须是 passed Gate 的唯一且最后一个 event，并包含完整映射：

```markdown
- Exit evidence: E1=G2-E0008; E2=G2-E0011; E3=G2-E0015
```

规则：

- Exit id 必须与计划当前 Gate 的 Exit conditions 完全一致。
- 每个 evidence event 必须存在、未被 invalidating correction 失效，并且其 `Satisfies` 包含对应 Exit。
- `gate-passed` 不能引用自己作为 evidence。
- Goal Ledger 的 `Unlock evidence` 使用 `goal/history/G2.md@G2-E0016#<event-hash>`，同时绑定 event id 与 event hash。

## 读取策略

正常 Goal 不读取完整 history。只在 checkpoint 信息不足、验证失败诊断、rollback、人工验收结果处理、证据核验、baseline reconcile、validator 报错或用户要求审计时，按 event id / Exit id 读取必要片段。passed Gate history 默认不加载。

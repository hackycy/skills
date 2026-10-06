# Goal History Schema

`goal/history/G<n>.md` 是单个 Gate 的 append-only 证据历史。Gate 当前状态由 `goal/runbook.md` 决定。

Schema: `goal-loop/history`

每个 event 使用连续 id `G<n>-E<4位序号>`，并包含 `Prev event hash` 与 `Event hash`。hash chain 用于发现控制面内部的历史改写或断链；需要抵抗能够同时改写全部控制文件的修改时，应使用 Git commit、只读存储或其他外部不可变锚点。

允许类型：`initialized`、`slice`、`verification`、`failure`、`checkpoint`、`correction`、`blocked`、`resumed`、`manual-handoff`、`manual-result`、`rollback`、`contract-reconciled`、`gate-passed`。

每个 event 至少记录：`At`、`Type`、`Slice`、`Changed`、`Verification`、`Result`、`Risk`、`Next`、`Prev event hash` 和 `Event hash`。Exit 完成状态由 Verification ID 证据推导，不在 event 中维护独立的 Exit 完成字段。

## Verification event

check event 使用：

- `Check`: `D<n>` / `R<n>` / `M<n>`；
- `Outcome`: `pass` 或 `fail`；
- `Evidence snapshot`: passing check 对其 Evidence inputs 的 canonical SHA-256；
- Repository check 还包含 `Output artifact` 与 `Output SHA-256`。

Repository output artifact 固定写入：

```text
goal/evidence/<event-id>-R<n>.log
```

validator 校验 artifact 路径和 SHA-256。`pass-gate` 在状态转换前重新计算 required passing checks 的 Evidence snapshot；snapshot stale 时拒绝通过。

## correction

历史事实错误时追加 `correction`，不得改写旧 event：

```markdown
- Corrects: G2-E0008
- Evidence effect: invalidate
```

`invalidate` 使目标 event 不再作为 effective evidence。correction 自身被后续 correction invalidated 后，不再影响它原本修正的 event。

## Manual acceptance

计划声明的 `M<n>` 形成稳定 acceptance id。例如 G2 的 `M1` 对应 `G2-M1`。`manual-handoff` 和 `manual-result` 必须引用同一 acceptance id；`manual-result` 的 pass/fail 成为该 Manual check 的 latest result。

## Gate pass evidence

`gate-passed` 记录完整 `Check@Event` 映射：

```markdown
- Exit evidence: E1=D1@G2-E0008,R1@G2-E0010; E2=M1@G2-E0013
```

validator 要求映射的 check 集合与 `Evidence rule` 完全一致，并确认每个引用 event 是 matching passing check。

# Contract Baseline Schema

`goal/contract-baseline.json` 固定 Gate 合同的机器可校验输入集合。

Schema: `goal-loop/contract-baseline-v1`

```json
{
  "files": [
    {
      "path": "docs/spec.md",
      "sha256": "<64-hex>"
    },
    {
      "path": "efforts/example/implementation-plan.md",
      "sha256": "<64-hex>"
    }
  ],
  "schema": "goal-loop/contract-baseline-v1"
}
```

## 路径集合

manifest 的路径集合必须精确等于：

1. `implementation-plan.md` 的 `Contract Sources` 表；
2. 当前 effort 的 `implementation-plan.md` 自身。

路径相对仓库根目录、使用 POSIX 分隔符、按字典序排列且不得重复。`goal/` 下的运行态文件不得进入 manifest。

runbook 的 `Contract Baseline` section 只保存：

```markdown
- Manifest: `goal/contract-baseline.json`
- Manifest SHA-256: `<manifest 文件 SHA-256>`
```

validator 同时检查 manifest 自身哈希、路径集合和每个合同输入文件的 SHA-256。

## 漂移处理

合同输入漂移时不实施 Gate，也不修改 Ledger / checkpoint。

### implementation-plan.md 内容变化

重新审查并编译 Gate 合同。`reconcile-baseline` 必须拒绝只刷新计划文件哈希。

### Contract Sources 路径集合变化

重新审查并编译 implementation plan。`reconcile-baseline` 必须拒绝只刷新 manifest。

### 计划内容和路径集合都未变化

如果某个合同输入文件内容变化，只有在明确确认现有 Gate 合同仍有效后才能运行：

```bash
python3 <skill-dir>/scripts/goal_loop_ctl.py reconcile-baseline \
  <effort-path> \
  --expected-revision <n> \
  --confirm-plan-valid \
  --reason "<为什么 Gate 合同仍然有效>" \
  --next-action "<恢复后的明确动作>"
```

该操作：

- 重算合同输入哈希；
- 重写 `goal/contract-baseline.json`；
- 更新 runbook manifest SHA-256；
- 向当前 Gate history 追加 `contract-reconciled` event；
- 更新 History head 和 Current Checkpoint；
- Revision 增加 1；
- 完成 transaction 后运行 validator。

`reason` 应描述具体文件变化为什么不改变 Scope、Verification、Stop conditions、Rollback 或 Exit conditions。

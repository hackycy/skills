---
name: agent-note-maintenance
description: 仅在用户明确要求维护 Agent Notes 时使用，包括审计重叠决策、合并或 supersede 旧 rationale、归档已失去当前 authority 的 implemented Note、清理不再有长期价值的 rejected Note，以及执行集中式 Note 维护。普通编码或仅仅创建一个新 Note 时不要调用。
---
# Agent Note Maintenance

目标是减少互相矛盾或陈旧的决策记录，同时不擦除仍能指导未来工作的 rationale。

## Supersession 审计

按 Scope、决策主题、关键机制、symbol/path、rejected alternative 和 ownership boundary 搜索活跃 Note，并分类为：

- **keep active**：仍独立约束未来选择；
- **duplicate authority**：合并到已有 owner；
- **partial supersession**：两者都保留，并用正文/`Related` 说明边界；
- **full supersession**：新 authority 吸收旧 Note 仍有用的命题，并用 `Supersedes` 记录关系；
- **obsolete proposal**：转 rejected 或删除；
- **obsolete rejection**：guardrail 不再现实或有用时删除。

## Implemented Note 去留

只要 alternatives、兼容语义、trust/ownership、negative guarantee、reintroduction condition 或长期验证仍能指导未来工作，就继续保持 active。年龄和字数不能决定 archive。

只有当“决策有历史价值，但已经不是当前 authority、也基本不会继续指导未来设计”时 archive。

## 归档

先修复所有活跃入站引用：当前规则应指向新的 authority；只有明确的历史引用才应该继续指向 archive。然后运行：

```bash
python3 .agents/scripts/archive_agent_note.py \
  .agents/notes/implemented/<class>/YYYY-MM-DD-topic.md \
  --root .
```

归档脚本负责 lifecycle move、`Archived:` 日期和 `archived/manifest.json` SHA-256 seal。不要手工修改 archive manifest，不要给后来改写过的历史重新 seal。

最后运行：

```bash
python3 .agents/scripts/governance_check.py --root .
```

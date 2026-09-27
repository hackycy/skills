---
name: agent-note-maintenance
description: 仅在用户明确要求维护 Agent Notes 时使用，包括审计重叠决策、合并或 supersede 旧 rationale、归档已失去当前 authority 的 implemented Note、清理不再有长期价值的 rejected Note，以及执行集中式 Note 维护。普通编码或仅仅创建一个新 Note 时不要调用。
---
# Agent Note Maintenance

目标是减少互相矛盾或陈旧的决策记录，同时不擦除仍能指导未来工作的 rationale。

## Supersession 审计

对每个新建或修改的 Note，按决策主题、关键机制、symbol/path、rejected alternative 和 ownership boundary 搜索活跃 Note。

对关联 Note 分为：

- **keep active**：仍然独立约束未来选择；
- **partial supersession**：两者都保留，并交叉链接具体边界；
- **full supersession**：新 authority 已吸收旧 Note 所有仍有用的命题；
- **obsolete proposal**：转 rejected 或删除，不留下未解决冲突；
- **obsolete rejection**：旧警告已经不再现实或有用时删除。

## Implemented Note 去留

只有当记录最终证明只是机械/琐碎修改、没有长期 rationale 时才删除。只要 alternatives、兼容语义、trust/ownership、negative guarantee 或 reintroduction condition 仍能指导工作，就继续保持 active。

只有在“决策有历史价值，但已经不是当前 authority，也基本不会继续指导未来设计”时 archive。年龄和字数只能帮助发现候选，不能直接决定 archive。

## 归档流程

1. 确认 Note 已 implemented 且不再是当前 authority。
2. 把单个 `.md` 文件从 `implemented/<class>/` 移到 `archived/<class>/`。
3. 在 `Status: implemented` 下增加 `Archived: YYYY-MM-DD`。
4. 修复活跃入站链接：优先指向当前 authority；只有明确历史引用才指向 archive。
5. 完成归档后将该文件视为冻结内容。
6. 运行 verifier。

不要 archive 活跃 proposal。不会继续推进的 proposal 应转 rejected，或在从未形成长期价值时直接删除。

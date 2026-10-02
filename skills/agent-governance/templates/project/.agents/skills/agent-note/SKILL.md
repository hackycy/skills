---
name: agent-note
description: 创建、更新或转换项目中的单语 Agent Note。适用于需要记录长期架构、行为、兼容性、流程、测试或 simplification 决策理由，以及需要在 proposed、implemented、rejected 生命周期之间转换的场景。
---
# Agent Note

Agent Note 只保存未来仍可能需要重新理解的长期工程 rationale，不保存实现流水账、聊天过程或 chain-of-thought。

## 创建前

先搜索 `.agents/notes/` 中的活跃记录，按主题、Scope、关键机制、路径/symbol、ownership boundary 和 rejected alternative 判断：独立补充、重复 authority、部分 supersession 或完全 supersession。重复 authority 优先更新已有 Note。

## 创建

```bash
python3 .agents/scripts/new_agent_note.py \
  proposed architecture "稳定事件所有权" \
  --slug stable-event-ownership \
  --root .
```

新模板故意带 `REQUIRED` 占位符，因此“只创建没填写”一定不会通过治理检查。填写稳定英文 `Scope`；`Supersedes/Related` 使用 repo-relative `.agents/notes/...` 路径或 `none`。

## 生命周期转换

### proposed → implemented

- 移动到 `implemented/<class>/`；
- `Status: proposed` 改为 `Status: implemented`；
- `提案` 改写为已发生的 `决策`；
- 删除未来计划式 checklist；
- 把验收/风险转成真实后果与验证证据；
- 修复因路径移动影响的 Markdown 相对链接。

### proposed → rejected

- 移动到 `rejected/<class>/`；
- `Status: rejected`；
- 公平描述被拒方案，并记录证据、约束或权衡；
- 修复路径变化导致的链接。

### implemented → archived

不要手工移动。交给 `agent-note-maintenance`，并使用：

```bash
python3 .agents/scripts/archive_agent_note.py <implemented-note> --root .
```

脚本会检查活跃入站引用并写入不可变 SHA-256 seal。

## 验证

任何 Note 结构、关系、链接或 lifecycle 变化后运行：

```bash
python3 .agents/scripts/governance_check.py --root .
```

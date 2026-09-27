---
name: agent-note
description: 创建、更新或转换项目中的单语 Agent Note。适用于需要记录长期架构、行为、兼容性、流程、测试或 simplification 决策理由，以及需要在 proposed、implemented、rejected 生命周期之间转换的场景。
---
# Agent Note

Agent Note 只保存未来仍可能需要重新理解的长期工程 rationale，不保存实现流水账或聊天过程。

## 语言规则

每个 Note 只有一个 `.md` 文件，默认正文使用简体中文。不要创建英文 counterpart、`.zh.md` 或 `.i18n.yaml`。

`Status:` 是供 verifier 使用的机器字段，值固定为 `proposed`、`implemented` 或 `rejected`；正文标题与内容使用中文。

## 创建前必须先搜索

按决策主题、关键机制、相关路径/symbol、ownership boundary 和被拒替代方案搜索 `.agents/notes/` 中的活跃记录，然后判断：

- 没有重叠：创建新 Note；
- 相同 authority：优先更新已有 Note；
- 部分 supersession：保留双方并明确交叉链接边界；
- 完全 supersession：新 Note 成为当前 authority，并处理旧 Note 的 active/archive/rejected 状态。

不要只因为“改了代码”就创建 Note。

## 创建

使用项目脚本：

```bash
python3 .agents/scripts/new_agent_note.py \
  proposed architecture "稳定事件所有权" \
  --slug stable-event-ownership \
  --root .
```

## 生命周期转换

### proposed → implemented

- 移动到 `implemented/<class>/`；
- `Status: proposed` 改为 `Status: implemented`；
- `提案` 改写为已经发生的 `决策`；
- 删除未来计划式 checklist；
- 写清实际后果与验证证据。

### proposed → rejected

- 移动到 `rejected/<class>/`；
- `Status: rejected`；
- 公平描述被拒方案；
- 记录基于证据、约束或权衡的拒绝原因。

### implemented → archived

归档由 `agent-note-maintenance` 负责。不要把 archive 当成普通完成状态；只有不再是当前 authority、但仍有历史价值时才 archive。

## 验证

任何 Note 结构或生命周期变化后运行：

```bash
python3 .agents/scripts/verify_agent_notes.py --root .
```

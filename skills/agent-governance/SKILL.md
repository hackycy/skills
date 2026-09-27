---
name: agent-governance
description: 仅当用户明确要求建立、接管、同步、检查或修复项目 Agent 工程治理体系时使用。负责维护 AGENTS.md 的治理入口、下发项目级 Skills、管理 Agent Notes 治理结构、检查治理状态并保护项目本地修改；普通编码、功能实现、代码审查或仅仅出现工程决策时不要调用本 Skill。
---
# Agent 项目治理

本 Skill 只处理治理体系本身。只有用户明确表达以下意图时才使用：建立治理体系、接管已有治理、同步治理模板、检查治理状态、修复治理结构。

普通编码、功能实现、Bug 修复、代码审查以及日常 Agent Note 创建不调用本 Skill；项目已经安装治理体系后，日常决策记录优先使用项目内 `.agents/skills/`。

## 开始治理前

1. 确认仓库根目录。
2. 读取根 `AGENTS.md`，以及当前目标路径范围内更具体的 `AGENTS.md`。
3. 检查 `.agents/framework.json` 是否存在。
4. 如果框架已安装，先检查当前治理状态；如果未安装，再判断项目是否已有 `.agents/`、ADR、项目级 Skills 或其他治理约定。
5. 已有治理内容时采用保守接管，不要用初始化流程覆盖现有约定。

## 可执行的治理动作

### 建立治理体系

用于尚未安装本框架、且不存在冲突治理文件的项目。

执行：

```bash
python3 scripts/governance.py init --project-root /path/to/repo
```

初始化后必须运行治理体检。

### 接管已有项目

项目已经存在 `.agents/`、ADR、`AGENTS.md` 或其他治理文件时，使用保守接管：

```bash
python3 scripts/governance.py adopt --project-root /path/to/repo
```

接管时：

- 已存在且与框架模板一致的文件可登记为框架托管；
- 已存在且不同的文件保持原样，标记为本地所有；
- 框架候选内容写入 `.agents/.governance/incoming/current/`；
- 不静默获得已有项目内容的 ownership。

### 检查治理状态

需要判断模板漂移、本地修改、缺失文件或待处理冲突时：

```bash
python3 scripts/governance.py status --project-root /path/to/repo
```

状态检查不得修改项目。

### 同步当前治理模板

当本 Skill 的模板、项目级 Skills 或 verifier 已更新，需要同步到已安装项目时：

```bash
python3 scripts/governance.py upgrade --project-root /path/to/repo
```

这里的 `upgrade` 表示同步当前 Skill 所携带的治理模板，不代表必须发生版本号变化。

同步规则：

- 框架托管且项目未修改的文件可以直接同步；
- 项目已经修改的托管文件不得覆盖；
- 冲突候选写入 `.agents/.governance/incoming/current/`；
- 根 `AGENTS.md` 只维护 `agent-governance:begin/end` 区块，不整体接管；
- 从 manifest 消失的旧托管路径只报告，不自动删除；
- 真实 Agent Notes 不属于普通模板同步范围。

### 治理体检

初始化、接管、模板同步、治理规则修改或冲突处理后运行：

```bash
python3 scripts/governance.py doctor --project-root /path/to/repo
```

只有在治理结构、托管状态、pending conflict 和 Agent Note 机械校验都满足要求后，才能认为治理状态正常。

## Agent Note 治理

Agent Note 只记录未来维护者或 Agent 可能需要重新理解的长期工程决策理由，不记录聊天过程、任务流水账或普通实现过程。

### 创建条件

适合记录：

- 架构边界、模块 ownership 或协议选择；
- 持久数据、兼容性、安全或信任规则；
- 有明显替代方案和长期权衡的重要行为决策；
- CI、发布、工具链、仓库流程和测试策略；
- 有意删除或缩小长期维护能力的 simplification。

通常不需要记录：

- 机械重构；
- 常规依赖升级；
- 局部 UI 调整；
- 没有长期取舍的简单 bug 修复；
- 已能从源码、测试或普通文档直接看清的实现事实。

### 创建前必须做 supersession 检查

搜索活跃 Note 中与当前决策主题、关键机制、相关路径或 symbol、ownership boundary、被拒替代方案相关的记录，并判断：

- 独立补充：双方继续保持活跃；
- 重复 authority：优先更新已有 Note；
- 部分替代：双方保留，并明确交叉链接适用边界；
- 完全替代：新 Note 成为当前 authority，并处理旧 Note 的 active/archive/rejected 状态。

### 文件规则

Agent Note 正文使用中文，文件名使用英文小写 kebab-case：

```text
.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic-in-english.md
```

创建时使用项目脚本并显式提供英文 slug：

```bash
python3 .agents/scripts/new_agent_note.py \
  proposed architecture "稳定事件所有权" \
  --slug stable-event-ownership \
  --root .
```

### 生命周期

- `proposed`：尚未解决的长期提案；
- `implemented`：已经交付且仍是当前 authority 的决策；
- `rejected`：未来仍可能被重新提出、值得保留拒绝依据的方案；
- `archived`：已经不是当前 authority、仅保留历史价值的冻结记录。

生命周期转换时必须同时调整路径、`Status:` 和正文语义，不能只移动文件。

### 分类

分类是封闭集合：

- `feature`
- `bug-fix`
- `simplification`
- `architecture`
- `process`
- `testing`

不要自行增加分类；如确实需要修改 taxonomy，应先修改本 Skill 的治理模板和 verifier，再同步到项目。

## 知识归属

每类知识尽量只有一个 owner：

- `AGENTS.md`：长期约束、作用域指令和知识路由；
- `.agents/notes/`：长期工程决策理由与历史；
- `.agents/skills/`：可复用执行流程与操作标准；
- 源码、测试和普通文档：当前系统事实、行为、API 与用户说明；
- verifier / CI：可以机械验证的结构性约束。

不要为了提高可发现性，把同一份详细事实复制到多个 owner 中。

## 保护规则

- 普通模板同步不得改写、移动、删除或重新格式化真实 Agent Notes。
- archived Note 视为冻结历史，正常开发不得修改。
- 根 `AGENTS.md` 只允许修改框架 managed block。
- `adopt` 时不得覆盖已有项目文件。
- 本地改过的托管文件必须保留，并生成 incoming 候选供语义合并。
- 不要手工修改 `.agents/framework.json` 中的 baseline hash 或 ownership；除非正在修复框架状态且已经确认影响。
- 不要因为“发生了代码修改”就自动创建 Agent Note。
- 不要把 chain-of-thought、聊天记录或逐步尝试过程写入 Agent Note。

## 项目内治理能力

初始化后，日常治理优先使用项目内能力：

- `.agents/skills/agent-note/`：创建和转换 Agent Note；
- `.agents/skills/agent-note-maintenance/`：supersession、合并、归档和清理；
- `.agents/skills/project-governance/`：维护知识归属和项目治理边界；
- `.agents/scripts/new_agent_note.py`：创建标准 Note；
- `.agents/scripts/verify_agent_notes.py`：机械校验 Note 结构。

本 Skill 主要负责项目治理体系的安装、接管、同步和体检；真实项目决策由项目自己的治理资产负责。

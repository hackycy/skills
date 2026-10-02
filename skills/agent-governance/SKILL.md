---
name: agent-governance
description: 仅当用户明确要求建立、接管、同步、检查、修复或升级项目 Agent 工程治理体系时使用。负责维护 AGENTS.md 治理入口、下发项目级 Skills、管理 Agent Notes 生命周期与归档 seal、检查治理状态、解决模板冲突并保护项目本地修改；普通编码、功能实现、代码审查或仅仅出现工程决策时不要调用本 Skill。
---
# Agent 项目治理

本 Skill 只处理治理体系本身。普通编码、功能实现、Bug 修复、代码审查以及日常 Agent Note 创建不调用本 Skill；项目安装治理体系后，日常决策记录优先使用项目内 `.agents/skills/`。

## 开始治理前

1. 确认仓库根目录。
2. 读取根 `AGENTS.md` 以及当前路径范围内更具体的 `AGENTS.md`。
3. 检查 `.agents/framework.json` 是否存在。
4. 已安装时先运行 `status` 或 `doctor`；未安装时检查项目是否已有 `.agents/`、ADR、项目级 Skills 或其他治理约定。
5. 已有治理内容采用保守 `adopt`，不要用 `init` 覆盖。

## 建立治理体系

```bash
python3 scripts/governance.py init --project-root /path/to/repo
```

初始化会安装框架托管规则、项目级 Skills、严格 Agent Note verifier、归档脚本、统一 `governance_check.py`，并以 project-owned 方式 seed 空的 archive seal manifest。初始化后运行 `doctor`。

## 接管已有项目

```bash
python3 scripts/governance.py adopt --project-root /path/to/repo
```

- 已存在且与模板一致的文件登记为 framework-managed；
- 不同文件保持原样并登记为 `adopted-local`；
- 当前框架候选写入 `.agents/.governance/incoming/current/`；
- project-owned 数据（例如 archive manifest）不会被模板接管或覆盖；
- 真实 Agent Notes 永远 project-owned。

## 查看状态 / 体检

```bash
python3 scripts/governance.py status --project-root /path/to/repo
python3 scripts/governance.py doctor --project-root /path/to/repo
```

健康状态：

- `healthy`：治理规则和当前 bundle 一致；
- `sync-needed`：有新模板、project override 候选或 orphaned managed path，但没有结构损坏；
- `conflicted`：framework-managed 本地修改或 adopted-local 尚未决议；
- `broken`：缺失治理资产、Note/verifier/archive seal 等硬约束失败。

`doctor` exit code：`0 healthy / 3 sync-needed / 4 conflicted / 1 broken`。

## 同步当前模板

```bash
python3 scripts/governance.py upgrade --project-root /path/to/repo
```

- framework-managed 且项目未修改：安全更新；
- 本地修改：保留本地并写 `.incoming`，进入 conflict；
- `project-override`：本地内容继续有效；新模板只作为 available update 提示，不把项目判为 conflict；
- `detached`：框架停止管理该路径；
- project-owned 数据不覆盖；
- 从 manifest 消失的旧路径只报告，不自动删除；
- 真实 Agent Notes 与 archive seal 永远不在普通模板同步范围。

## 冲突决议

```bash
python3 scripts/governance.py resolve .agents/notes/README.md \
  --mode take-framework --project-root /path/to/repo

python3 scripts/governance.py resolve .agents/notes/README.md \
  --mode keep-local --project-root /path/to/repo

python3 scripts/governance.py resolve .agents/notes/README.md \
  --mode detach --project-root /path/to/repo
```

含义：

- `take-framework`：接受当前框架版本，重新成为 framework-managed；
- `keep-local`：把当前项目内容明确登记为 project override，未来模板变化只提示候选；
- `detach`：该路径完全退出框架管理。

根 managed block 使用 `AGENTS.md#managed-block` 作为 target。

## 可选 CI

GitHub Actions 项目可显式安装治理 gate：

```bash
python3 scripts/governance.py install-ci \
  --provider github-actions \
  --project-root /path/to/repo
```

workflow 运行项目内：

```bash
python3 .agents/scripts/governance_check.py --root .
```

## Agent Note 治理

Agent Note 只记录未来维护者或 Agent 可能重新理解的长期工程决策理由，不记录聊天过程、任务流水账或普通实现过程。

适合：架构边界、ownership、协议/持久化、兼容性、安全与信任规则、重要行为权衡、CI/发布/工具链政策、测试策略、长期 simplification。

通常不需要：机械重构、常规依赖升级、局部 UI 调整、没有长期取舍的简单 bug 修复、已能从源码/测试/普通文档直接看清的事实。

### 创建前必须做 supersession 检查

按主题、Scope、机制、路径/symbol、ownership boundary 和 rejected alternative 搜索活跃 Note，并判断：独立补充、重复 authority、部分 supersession、完全 supersession。

### 文件与生命周期

```text
.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic-in-english.md
```

正文默认简体中文，filename 为英文 kebab-case。生命周期：`proposed / implemented / rejected / archived`；分类封闭集合：`feature / bug-fix / simplification / architecture / process / testing`。

新 Note 模板包含 `REQUIRED` 占位符；未填写真实内容时 verifier 必须失败。新模板支持 `Scope / Supersedes / Related` 结构化关系，但旧 Note 可不含这些字段。

### Archive

不要手工把 implemented Note 移入 archive。使用项目脚本：

```bash
python3 .agents/scripts/archive_agent_note.py \
  .agents/notes/implemented/architecture/YYYY-MM-DD-topic.md \
  --root .
```

归档脚本会检查活跃入站引用、加入 `Archived:` 日期，并在 `archived/manifest.json` 中写 SHA-256 seal。后续任何 archive 正文改写都会使治理检查失败。

## 知识归属

- `AGENTS.md`：standing instructions 与知识路由；
- `.agents/notes/`：长期工程 rationale 与历史；
- `.agents/skills/`：可复用流程；
- source/tests/docs：当前事实、API 与用户说明；
- postmortem：真实事故为何逃过防线以及新增 guardrail；
- upgrade/migration guide：下游需要执行的 breaking-change 迁移；
- verifier/CI：可机械验证的结构约束。

不要为了可发现性复制详细事实；链接到真正 owner。

## 保护与并发

- 框架写操作使用 `.agents/.governance/manager.lock` 防止多个 Agent 并发改状态；state/模板更新使用同目录临时文件 + atomic replace。
- Note 创建使用 exclusive create，避免并发同名覆盖。
- 如果治理进程异常退出留下 manager lock，确认没有其他治理进程后才执行：

```bash
python3 scripts/governance.py unlock --force --project-root /path/to/repo
```

- 不要手工修改 `.agents/framework.json` 的 hash、ownership、pending state。
- 不要给被改写的 archive 重新 seal；seal mismatch 应先调查历史为何变化。

## 项目内治理能力

初始化后优先使用：

- `.agents/skills/agent-note/`：创建和 lifecycle 转换；
- `.agents/skills/agent-note-maintenance/`：supersession、合并、归档、清理；
- `.agents/skills/project-governance/`：知识归属和治理边界；
- `.agents/scripts/new_agent_note.py`：并发安全创建 Note；
- `.agents/scripts/archive_agent_note.py`：安全归档并 seal；
- `.agents/scripts/verify_agent_notes.py`：严格 Note/link/archive 校验；
- `.agents/scripts/governance_check.py`：统一本地/CI 治理 gate。

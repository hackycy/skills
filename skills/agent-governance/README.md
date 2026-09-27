# agent-governance 维护说明

本文件面向 **Skill 维护者**。正常使用该 Skill 进行项目治理时，不需要把这里的背景、参考来源或维护历史加载给项目使用者；执行规则以 `SKILL.md` 和下发到项目中的治理模板为准。

## 当前状态

当前 Skill 处于未发布阶段，版本固定为：

```text
0.0.1
```

在明确决定正式发布之前：

- 不因为内部迭代修改 `VERSION`；
- `templates/manifest.json` 中版本始终保持 `0.0.1`；
- 不维护预发布 changelog；
- 不建立预发布版本之间的 migration 历史；
- 模板变化依靠 baseline hash 和当前模板内容进行同步，不依赖版本号变化；
- 所有未发布调整都直接完善当前 `0.0.1`。

正式发布时，再单独决定版本策略、兼容策略和是否需要 migration 机制。

## Skill 的职责

这个 Skill 是项目治理执行器，不是治理理念介绍器。它负责：

- 为新项目建立治理结构；
- 保守接管已经存在治理约定的项目；
- 维护根 `AGENTS.md` 的受管理区块；
- 下发和维护项目级治理 Skills；
- 建立 Agent Notes 生命周期、分类和机械校验；
- 使用 baseline hash 检测项目本地修改；
- 安全同步当前 Skill 中的最新模板；
- 对冲突生成 `.incoming` 候选，而不是覆盖本地内容；
- 运行治理体检。

Skill 不负责替项目决定真实工程决策，也不拥有真实 Agent Notes。

## 目录结构

```text
agent-governance/
├── SKILL.md
├── README.md
├── VERSION
├── agents/
│   └── openai.yaml
├── scripts/
│   └── governance.py
├── templates/
│   ├── manifest.json
│   ├── root/
│   │   └── AGENTS.block.md
│   └── project/
│       └── .agents/
│           ├── AGENTS.md
│           ├── notes/
│           ├── skills/
│           └── scripts/
└── tests/
    └── test_governance.py
```

`SKILL.md` 面向 Skill 使用者，只包含执行治理所需的信息。`README.md` 才是维护者文档。


## Coding Agent 解析与调用策略

本 Skill 以标准 `SKILL.md` 作为唯一执行指令源，frontmatter 只保留跨 Agent 通用的 `name` 与 `description`。不要为了某个运行时，把产品专属字段直接加入根 `SKILL.md`。

当前适配约定：

- **OpenAI Codex**：使用 `agents/openai.yaml` 提供界面元数据和调用策略。母 Skill 设置 `policy.allow_implicit_invocation: false`，因此按 Codex 语义属于显式调用型 Skill；项目内 `agent-note` 与 `project-governance` 允许隐式匹配，`agent-note-maintenance` 默认显式调用。
- **DeepSeek Harness**：可以直接解析项目 `.agents/skills/` 中的标准 `SKILL.md`。母 Skill 的 `description` 仍保持窄触发条件，避免普通开发任务误匹配。
- **Claude Code**：项目模板额外生成 `.claude/skills/<name>/SKILL.md` 薄适配入口；适配入口只负责发现与 Claude 专属调用策略，执行正文仍回到 `.agents/skills/<name>/SKILL.md`，避免维护两套治理规则。`agent-note-maintenance` 的 Claude 入口使用 `disable-model-invocation: true` 和 `user-invocable: true`。
- **其他支持 Agent Skills 的 Coding Agent**：优先依赖标准 `.agents/skills/<name>/SKILL.md`。只有确认该产品存在稳定、公开的产品专属 metadata 或发现规范时才增加适配，不凭空创造 `claude.yaml`、`deepseek.yaml` 一类未定义格式。

OpenAI 当前推荐 Skill bundle 提供 `agents/openai.yaml`；Codex 的 `policy.allow_implicit_invocation` 属于产品专属 metadata。与此同时，Codex 的标准 Skill 校验会拒绝 `disable-model-invocation` 这类非标准 frontmatter 键，因此这里有意不把 Claude/DeepSeek 的调用控制字段写入 canonical `SKILL.md`。维护时要保持这一边界。

项目模板中的三个项目级 Skill 也携带各自的 `agents/openai.yaml`，并由 manifest 托管同步；Claude Code 的 `.claude/skills/` 入口同样由 manifest 托管。无论适配层有多少，真正的执行正文始终只维护在 `.agents/skills/`。

## Ownership 模型

框架拥有：

- 根 `AGENTS.md` 中 `agent-governance:begin/end` 区块；
- `.agents/AGENTS.md`；
- Agent Note 规则和 skeleton；
- 项目级治理 Skills；
- Note 创建和 verifier 脚本；
- `.agents/framework.json` 中的框架状态。

项目拥有：

- 所有真实 Agent Notes；
- managed block 之外的项目 `AGENTS.md` 内容；
- 源码、测试和普通文档；
- `adopt` 时已经存在且与框架模板不同的本地治理文件。

## 模板同步机制

安装时，对框架托管文件记录 baseline SHA-256。

同步当前模板时：

```text
current == new template
    -> 已经是当前模板，刷新 baseline

current == baseline
    -> 项目未改，安全替换为当前模板

current != baseline 且 current != new template
    -> 保留项目文件
    -> 写入 .agents/.governance/incoming/current/
    -> 标记 pending conflict
```

根 `AGENTS.md` 使用相同思路，但 baseline 只覆盖 managed block，不覆盖整份文件。

从 manifest 中移除一个托管路径时，管理器默认只把它报告为 orphaned managed path，不自动删除。未发布阶段如需要调整路径，直接更新实现和测试；不要建立虚构的版本迁移历史。

## Agent Note 约定

当前约定：

- 单文件 `.md`；
- 正文中文；
- 文件名英文 ASCII kebab-case；
- 路径为 `.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic.md`；
- 生命周期：`proposed / implemented / rejected / archived`；
- 分类：`feature / bug-fix / simplification / architecture / process / testing`；
- 新建 Note 前必须做 scoped supersession 检查；
- archived Note 冻结；
- 普通模板同步永远不修改真实 Note。

文件名规则属于治理约定本身；不需要在使用者 Skill 中解释其环境兼容背景。

## 参考：DeepSeek Harness

本 Skill 的早期设计研究过 `deepseek-ai/deepseek-harness` 的公开工程实践。维护者可以继续参考它来检查治理思路，但不要把这部分背景写进面向使用者的 `SKILL.md`。

目前吸收的主要思想包括：

- `AGENTS.md` 主要承载 standing instructions 和知识路由，不承担完整知识库职责；
- Agent Notes 用来保存 durable decision rationale，而不是开发日志；
- Notes 使用 lifecycle + class 组织；
- 新建长期决策时先检查 supersession；
- `implemented` 描述已经交付的当前决策，而不是保留 proposal/plan 语气；
- `archived` 作为冻结历史，不作为当前 authority；
- `.agents/skills/` 保存可复用工作流；
- 能机械检查的结构约束交给 verifier。

本 Skill 针对跨项目复用做了自己的实现选择：

- Skill 与项目治理说明使用中文；
- Agent Note 使用单文件、单语言模式；
- 增加跨项目 `init / adopt / status / upgrade / doctor` 管理器；
- 增加 baseline hash、ownership 和 `.incoming` 冲突保护；
- 根 `AGENTS.md` 通过 managed block 集成；
- 真实 Agent Notes 始终 project-owned。

参考来源只用于维护本 Skill，不构成项目使用者需要理解的治理步骤。

## 修改 Skill 时

修改模板、脚本或治理规则后：

1. 保持 `VERSION` 为 `0.0.1`。
2. 保持 `templates/manifest.json -> framework.version` 为 `0.0.1`。
3. 如新增框架托管文件，加入 manifest。
4. 如删除托管路径，确认管理器只报告 orphan，不静默删除项目文件。
5. 修改项目级规则时同步修改对应 verifier 或测试，避免“文档有规则、工具不检查”。
6. 修改任何 `SKILL.md` 时检查对应 `agents/openai.yaml` 是否仍与名称、用途和调用边界一致。
7. 运行完整测试和 Python 编译检查。
8. 从干净目录重新打包，确保 ZIP 中只有当前有效文件。

推荐检查：

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q scripts templates/project/.agents/scripts tests
```

至少覆盖：

- 干净项目初始化；
- 已有项目保守接管；
- Note 创建和英文 slug 校验；
- Agent Note verifier；
- 未修改模板的同版本同步；
- 本地修改模板时的 `.incoming` 保护；
- 根 `AGENTS.md` managed block 不覆盖项目内容；
- orphaned managed path 不被静默删除。

## 发布边界

在维护者明确宣布“开始正式发布”之前，不设计版本升级故事。

正式发布后再决定：

- 是否采用语义化版本；
- 哪些变化需要 schema version；
- 是否需要显式 migration；
- 如何支持已经发布版本之间的升级。

这些内容不应提前污染当前未发布 `0.0.1` 的使用流程。

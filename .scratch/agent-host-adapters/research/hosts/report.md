# 宿主能力、加载语义与可验证性矩阵

本报告记录 **2026-11-10 实际观察到的宿主能力**。它不重建 Impeccable 4.8.2 发布时的宿主状态，也不把新的宿主能力追溯为 agent-notes 0.3.0 已实现的能力。固定产品基线仍为 agent-notes `f74deccc5991e0452b3cb83feba51fe1c6bb1c1c` / npm 0.3.0 与 Impeccable `035c8f319edd019936525a062fe99e83ca8d12c6`；安装器行为、失败路径和文件所有权由其他研究票据持有。

结论是：**相同的技能文件格式不构成相同的宿主协议；入口文件导入语义、发现范围和插件执行协议必须独立声明。** `.agents` 和 `.claude` 是目录/安装配置，可以被多个宿主消费，不能当作两个额外宿主。特别是 Cursor 官方文档明确说明规则里的 `@file` 不内联，而 Claude Code、Gemini CLI、Copilot CLI 的特定入口文件有真正的导入扩展；OpenCode 明确不自动解析 AGENTS.md 文件引用。不能把 `@path` 当成跨宿主通用安装动作。[CU-R][CC-M][GM-M][GH-CI][OC-R]

## 证据标记、置信度与适用边界

- **D**：已实际抓取的官方文档声明。链接可变；抓取时刻、有效 URL、HTTP 状态、原始字节 SHA256 见 [snapshot-catalog.md](snapshot-catalog.md) 与 [fetch-manifest.json](fetch-manifest.json)。抓取失败仍保留错误，不能视为已读页面。
- **C**：固定提交的实现代码，或当前可执行文件的静态 CLI 输出。帮助只证明命令/选项存在，不证明发现路径或 hook 已运行。代码与文档属于不同机制证据；同站的两篇转述文档不算两个独立来源。
- **I**：本次隔离文件 fixture 的实际发现结果；另一个研究票据覆盖真实安装器输出。这里的 I-discovery 不等于完整安装器的 I-install，也不等于 A。
- **A**：真实代理选择技能、读入入口、执行 context/check、遵守指令等行为。本次 **全部未验证**：未启动模型 turn，未使用付费模型或用户凭据。
- **高**：文档与独立实现/fixture 相互支持；只对明确验证的层成立。**中**：单一官方文档或固定实现，缺第二机制证据。**低/未知**：缺口、版本适用性不明或仅静态线索。高 I 也不能提升 A。

闭源宿主 Claude Code、Cursor 和 Copilot CLI 的目录语义主要只有 D；不存在可引用的开放 loader 证据，也未进行已登录代理实验，因此其路径结论明确为“文档层中置信度”，不是“双独立证据已满足”。源码行内单元测试与实现同源，不能冒充本机实验。本报告保留这些证据缺口，而不把资料不足写成不支持。

## 宿主与安装配置的关系

| 概念 | 本研究中的含义 | 证据与置信度 |
|---|---|---|
| 宿主 host | 实际发现、选择、加载和执行技能/指令的执行环境；客户端/运行位置会改变语义 | VS Code 官方明确由 harness 而非语言模型决定 instruction support；Copilot 文档要求按 surface 查位置。D/高于概念层；并非模型品牌能力。[VS-I][GH-S] |
| CLI target | 安装命令的选择项；其产生的文件必须逐一映射到一个或多个真实宿主协议 | 本表只研究消费方；target 所有权/事务不在此推导。无需把 target 与 host 一对一绑定 |
| `.agents` 配置 | 通用目录布局，例如 `.agents/skills/<name>/SKILL.md`；不是进程，不提供 hooks/commands 的统一执行器 | Cursor、Gemini、VS Code、OpenCode 文档与 Codex/OpenCode fixture 均证明多个消费方。D+C+I/高；Claude 文档目前明确不从 `.agents/` 读取其 AGENTS 入口配置。[CU-S][GM-S][VS-S][OC-S][CX-R][CC-M] |
| `.claude` 配置 | Claude 的原生目录，同时是 Cursor、VS Code、Copilot CLI、OpenCode 等的兼容输入之一 | D+C+I/高于“多消费方”事实；具体文件协议逐格确认，不保证所有消费方解释所有字段。[CC-S][CU-S][VS-S][GH-CS][OC-S] |

## 技能发现矩阵：每个目录、入口与作用域

`P` 是项目范围，`U` 是运行机器的用户范围；表内路径均为宿主消费路径，不是建议同时向所有目录复制。未列路径表示本次没有确证，不能解释成禁止支持。

| 宿主/客户端 | 项目技能目录 P | 用户技能目录 U | 技能入口、加载与冲突语义 | 证据缺口 |
|---|---|---|---|---|
| Claude Code 本地 CLI（2.1.319） | **支持** `.claude/skills/<name>/SKILL.md`；父目录至仓库根；嵌套目录按读写相关文件时发现。D/中。[CC-S] | **支持** `~/.claude/skills/<name>/SKILL.md`；组织 managed 路径另有范围。D/中。[CC-S] | **支持** YAML+Markdown `SKILL.md`，元数据用于相关性选择，正文按调用加载；`disable-model-invocation` 与 `user-invocable` 分别控制谁可调用；同名 enterprise > personal > project；插件有命名空间。D/中。[CC-S] | 没有 loader C 或技能发现 I；只有 version/help C。文档没确证 `.agents/skills` 为 Claude 原生技能根，不能由其他宿主兼容读取反推 Claude 支持。A 未测 |
| Cursor 本地 Agent；Cloud 另见范围列 | **支持** `.agents/skills`、`.cursor/skills`，兼容 `.claude/skills`、`.codex/skills`；技能根递归找到 `SKILL.md`，仓库嵌套根按子树作用域。D/中。[CU-S] | **支持** `~/.agents/skills`、`~/.cursor/skills`，兼容 `~/.claude/skills`、`~/.codex/skills`。仅 `~/.cursor/skills` 可按文档开启云同步。D/中。[CU-S] | **支持** YAML `SKILL.md`，description 相关性发现，正文/资源渐进读取；`disable-model-invocation:true` 手动 `/skill`。D/中。同名跨目录冲突优先级本次未确证，**未知**。[CU-S] | 本机无 Cursor executable，闭源 loader 无 C、无 I/A；commands 页面重复同一目录列表不能算独立来源。Cloud、SSH、self-hosted 不自动拿到本机 home。[CU-S][CU-C] |
| Codex 本地 CLI（0.156.1） | **已发现** `.agents/skills`、`.codex/skills`；固定源码从项目根到 cwd 搜索 `.agents/skills`，project config folder 的 `skills` 也加入。C+I/高于本次版本发现事实；D 缺口。[CX-R][CX-L][I-D] | **已发现** `~/.agents/skills`、`$CODEX_HOME/skills`；后者在固定源码中标 deprecated 兼容路径；system/admin roots 另行提供。C+I/高于已测路径；D 缺口。[CX-R][I-D] | **支持** `SKILL.md` 解析、按 scope 发现、目录 symlink policy；本次 RPC 返回 repo/user/system scope 和 enabled。C+I/高；技能正文是否被模型调用/执行未测。[CX-L][CX-D][I-D] | developers.openai.com 搜索与 skills/AGENTS/commands/config 及 platform.openai.com 备用页均 SSL timeout；没有 D 成功快照。没有把 .github/.claude fixture 的未发现外推成所有 Codex 客户端不支持 |
| Gemini CLI（未安装；源码固定） | **支持** `.gemini/skills` 和 `.agents/skills` alias。D+C/高。[GM-S][GM-SC] | **支持** `~/.gemini/skills`、`~/.agents/skills` alias。D+C/高。[GM-S][GM-SC] | discovery 注入名称/描述；模型 `activate_skill` 后需用户 consent，批准才注入 body+folder 并授权目录。built-in < extension < user < workspace，同 tier `.agents` 胜 `.gemini`。D+C/高于发现/优先级；consent 仅 D/中。[GM-S][GM-SC] | 没有 I/A；固定 source commit 不等于本机版本。文档提到 consent 不能写成“安装即激活” |
| GitHub Copilot — VS Code 的 **Copilot harness** 与旧 Local harness | Copilot 官方推荐 P `.github/skills`；Local 另读 `.claude/skills`、`.agents/skills`。固定 VS Code defaults 含三者。D+C/高于 Local defaults；当前 Copilot harness 的全部兼容细节须按运行时指南确认。[VS-S][VS-L] | 推荐 `~/.copilot/skills`；Local 另读 `~/.claude/skills`、`~/.agents/skills`，固定 defaults 同样列出。D+C/高于 Local defaults。[VS-S][VS-L] | `SKILL.md`，名称/描述发现、正文 on-demand、support files 按需；用户 `/skill` 与模型自动选择可分别关闭。D/中于调用与元数据声明，C 仅佐证按 harness 列出 available/disabled catalogue；正文选择无 A。[VS-S][VS-Q] | 没有 VS Code 本机版本/I/A。**不能用 VS Code 兼容目录证明 Copilot CLI、GitHub.com 或 Codex 原生 CLI 语义**；VS Code Codex 集成额外发现 .github/skills 是集成行为。[VS-S] |
| GitHub Copilot — **CLI 1.0.19** | **支持** `.github/skills`、`.claude/skills`、`.agents/skills`。D/中。[GH-CS] | **支持** `~/.copilot/skills`、`~/.agents/skills`。D/中；本页未明确 `~/.claude/skills`，**未知**。[GH-CS] | `SKILL.md`+YAML；选择后注入正文并发现目录资源；`/skills` 可管理，`/name` 手动调用。D/中。[GH-CS] | 有 version/help/plugin-help C，但没有技能路径 I/独立 loader C，故不能提升目录置信度。A 未测 |
| GitHub Copilot — **GitHub.com cloud/coding agent** | 官方 overview 声明 project skills `.github/skills`、`.claude/skills`、`.agents/skills`，但同页强调依 surface；cloud agent 可用 skills。**支持声明 D/中**，未做 job 发现。[GH-S] | 云 sandbox 可通过 dotfiles `.copilot/skills` 提供个人 skills；**不适用于 Actions-based session**。不能直接复用本机 `~` 安装保证。D/中。[GH-S] | task-specific on-demand 技能。D/中。[GH-S] | client、付费计划、组织 policy、session 类型均影响可用性。无运行云 job、无 I/A；overview 未提供每一种 cloud 路径独立验证，保持缺口 |
| OpenCode（CLI 1.18.29） | **已发现** `.opencode/skills`、`.claude/skills`、`.agents/skills`；文档支持祖先搜索与 grouping dirs。D+C+I/高。[OC-S][OC-SC][I-D] | **已发现** `$XDG_CONFIG_HOME/opencode/skills`（默认 `~/.config/opencode/skills`）、`~/.claude/skills`、`~/.agents/skills`。D+I/高；兼容 root 完整实现不由单一 scanner 文件证明。[OC-S][I-D] | `SKILL.md` 目录入口；当前文档和 fixed scanner 还支持根级 `<name>.md`，遇目录 `SKILL.md` 停止向内搜，最大 scan depth 6；支持文件不自动注入。D+C/高；flat form 与传统互通格式有区别。[OC-S][OC-SC] | current source dev commit 未证明与本机 binary 完全同一构建。I 只验证简单 fixture，未测同名覆盖/链接/极深目录；A 未测 |

## 常驻入口、规则与文件导入矩阵

“引用”与“内联导入”分开：普通 Markdown 链接让 agent 知道去哪里读，不等于 loader 在请求前展开内容。下表只声明被来源直接支持的语义。

| 宿主/客户端 | 项目入口与规则 | 全局入口/规则 | 导入语义、范围与置信度 |
|---|---|---|---|
| Claude Code CLI | **支持** `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md`；`.claude/rules/**/*.md`，paths 限定按需。当前文档：2.1.277+ 默认无项目 CLAUDE 文件时读 `AGENTS.md`/`.claude/AGENTS.md`；存在 CLAUDE 时默认只读 CLAUDE，可通过用户/managed 配置改为两者。D/中。[CC-M] | **支持** `~/.claude/CLAUDE.md`、`~/.claude/rules`，managed 另层；默认 AGENTS 判断不把用户 CLAUDE 当项目覆盖。D/中。[CC-M] | **真正内联** `@path`；相对导入者文件，支持绝对路径，递归最多 4 hops，忽略 code spans/fences。项目外部导入首次审批，AGENTS 直接加载的外部导入有更严格已有批准条件。D/中；无第二机制证据。纯文字“请读文件”不保证读入。AGENTS.override/local 与 `.agents/` 不在此入口支持内。[CC-M] |
| Cursor Agent | **支持** `.cursor/rules/*.mdc`（`.md` 被忽略）、root/nested `AGENTS.md`；MDC alwaysApply/globs/description/manual 控制作用域。D/中。[CU-R] | **支持** Settings 的 User Rules，另有 Team Rules；不是自动给出一个 `~/.cursor/AGENTS.md` 位置。D/中。[CU-R] | **不内联** rule 中 `@file`；文档明确同样适用于 editor/CLI/Cloud，Agent 按需用工具读。nested AGENTS 与父合并，更具体优先；Team → Project → User 解决冲突。D/中，闭源无独立 I。[CU-R] |
| Codex CLI | **支持** `AGENTS.override.md` 优先 `AGENTS.md`，以及配置的 fallback filenames；从项目 root 到 cwd 拼接，默认 `.git` marker 边界，untrusted/budget 可跳过或截断。C/中；D 缺口。[CX-A] | **支持** `$CODEX_HOME/AGENTS.override.md` 或 `AGENTS.md`，override 优先。C/中；未做 instruction injection I。[CX-U] | 固定 loader 直接 `read_file` 转 UTF-8 文本，并没有 `@` 递归展开步骤。**本 loader C 范围内是原文，不构成宿主原生 @ import**；其他扩展/客户集成未知。C/中，A 未测。[CX-A][CX-U] |
| Gemini CLI | **支持** `GEMINI.md`；workspace/parents 与 JIT 文件访问到 trusted root；可 `context.fileName` 配置多个文件名例如 AGENTS.md。D+C/高。[GM-M][GM-MC] | **支持** `~/.gemini/GEMINI.md`。D+C/高。[GM-M][GM-MC] | **真正内联** `@file.md`；fixed processor 默认 maxDepth=5，循环去重、相对 basePath、realpath 后约束 projectRoot，拒绝 file/http URL。D+C/高于实现；不同版本实际运行 I 未做。**不能把 Claude 外部绝对导入语义套过来**。[GM-M][GM-IC] |
| Copilot — VS Code Copilot harness / Local | Copilot：`.github/copilot-instructions.md`、AGENTS.md；targeted `.github/instructions/**/*.instructions.md` / nested AGENTS。Local 还读 CLAUDE.md、`.claude/rules`，nested AGENTS 在 Local 仍标 experimental。D+C/高于 defaults，客户端行为未 I。[VS-I][VS-L] | Copilot：`~/.copilot/copilot-instructions.md`、`~/.copilot/instructions/**/*.instructions.md`；Local：VS Code user profile。D/中。[VS-I] | Markdown links 相对 instruction file；官方明确**链接不能保证每次请求都包含目标内容**。本次未确证 Local loader 有 CLI 的 @ 扩展；**未知，不借 CLI 文档反推**。D/中。[VS-I] |
| Copilot — CLI | **支持** `.github/copilot-instructions.md`、`.github/instructions/**/*.instructions.md`、AGENTS.md、CLAUDE.md（含 `.claude/CLAUDE.md`）、GEMINI.md；instructions applyTo 匹配才载入。D/中。[GH-CI] | `$HOME/.copilot/copilot-instructions.md`、`instructions/**/*.instructions.md`，可用 COPILOT_HOME/COPILOT_CUSTOM_INSTRUCTIONS_DIRS 改位置。D/中。[GH-CI] | **真正内联**仅在 `.github/copilot-instructions.md`、AGENTS.md、CLAUDE.md 中用 `@relative`；立即读取，支持递归引用，限制仓库或 custom instruction 根内；不读 absolute/`~/`；**不展开 GEMINI.md 或 *.instructions.md 的引用**。多文件合并但未定义一般优先级，避免冲突。D/中，无独立 C/I。[GH-CI] |
| Copilot — GitHub.com cloud/coding agent | **支持声明** repository-wide `.github/copilot-instructions.md`、path-specific `.github/instructions/**/*.instructions.md` 与 agent instructions；按官方各 surface support table 取用。D/中。[GH-I] | 本机用户入口不直接存在云 clone；本次无云 job，**未知**。D 适用性边界。[GH-I] | 不用 CLI 新增 @ 支持替代 cloud 保证；本次未找到独立 cloud loader/行为证明，**未知**。D 缺口/A 未测 |
| OpenCode | **支持** AGENTS.md；CLAUDE.md fallback（无 AGENTS 时）；config `instructions` 文件/glob/URL 合并。D+C/高于 AGENTS/config 实现；CLAUDE fallback 仅 D/中。[OC-R][OC-IC] | `~/.config/opencode/AGENTS.md`，无此文件再 fallback `~/.claude/CLAUDE.md`（可禁用 compatibility）。D/中；AGENTS 读取 C 可佐证。[OC-R][OC-IC] | **不自动解析 AGENTS.md 文件引用**；推荐 config `instructions` 显式加载，或指令要求 agent 自己读。fixed plugin 直接读取内容、处理配置文件列表/URL，不对文件 body 递归 @ 展开。D+C/高于此机制；A 未测。[OC-R][OC-IC] |

## Commands、hooks、plugins：独立协议，不能由技能目录推导

| 宿主/客户端 | Commands / 手动工作流 | Hooks 与 project/global 范围 | Plugins / 扩展与范围 | 证据边界 |
|---|---|---|---|---|
| Claude Code | 支持 `/skill`，旧 `.claude/commands/*.md` 继续兼容且与 skills 共用 frontmatter 的大部分字段；同名 skill/command 处理见官方技能页。D/中。[CC-S] | `.claude/settings.json`、`.claude/settings.local.json` 为 P；`~/.claude/settings.json` 为 U；managed/plugin/skill-scoped 另层。shell/HTTP/MCP/prompt/agent 等 hook 类型和生命周期有独立 schema。D/中。[CC-H] | `.claude-plugin/plugin.json`，skills/agents/hooks/MCP 打包；CLI plugin-help 证明管理命令存在；用户与项目 enable/install 是不同层。D+C/中；没有实际安装插件或触发 hook。[CC-P][P-V] | hook 能力不意味着 agent-notes 可以在本轮引入 hook 产品行为；没有 A |
| Cursor | 当前 commands 文档将自定义 slash 工作流表示为 `.cursor/skills/<name>/SKILL.md`，也读其他技能根；不能继续假定旧 `.cursor/commands` 是未来唯一接口。D/中。[CU-C] | `.cursor/hooks.json` 为 P，`~/.cursor/hooks.json` 为 U，enterprise/team/plugin 另层；P 命令相对 project root，U 相对 `~/.cursor`。Cloud 支持的事件是子集且早期只读阶段不跑 hook，U hooks 不进云。D/中。[CU-H] | 当前支持 Agent Plugins 根 `plugin.json` 与 `.cursor-plugin/plugin.json`；团队 marketplace、本地 `~/.cursor/plugins/local`；不是简单复制任意 GitHub skills 即导入。D/中。[CU-P] | 闭源单官方机制，无 C/I/A；文档所说跨工具 hooks 兼容不证明同 payload/schema |
| Codex CLI | 本次已确认 CLI plugin/app-server/features 命令存在；技能手动 mention 与独立 custom slash-command 文件协议不能混为一项。独立 custom-command 文件位置本次 **未知**（官方 commands 页未成功抓取）。C/中。[P-V][I-D] | 固定代码从 config layer 的 config folder 加载 `hooks.json`，另读 TOML hook 配置；区分 User/Project/Plugin 来源与 trust；本机 features 报 `hooks stable true`。C/中；D 缺口，事件实际执行 I/A 未做。[CX-H][CX-HC][I-D] | `codex plugin add/list/marketplace/remove` 静态帮助；fixed app-server tests 构造 `.codex-plugin/plugin.json` + skills；本机 features 报 plugins stable true。C/中；安装 scope/完整 manifest 未完成 D 验证，不能据此保证通用插件可原样装入。[CX-T][I-D] | Codex 官方文档不可达属于 D 缺口，不能错误写成“不支持 hooks/plugins”；本机发现与当前 HEAD 固定源码构建未完全对齐 |
| Gemini CLI | TOML `.gemini/commands/**/*.toml` 为 P、`~/.gemini/commands` 为 U；子目录形成 `/git:commit`；另外 skill loader 可转为手动命令，两个载体不等价。D+C/高于存在两种载体；未运行 CLI。[GM-C][GM-CL] | `.gemini/settings.json` 为 P、`~/.gemini/settings.json` 为 U、system/extension 另层；command hooks 同步 stdin/stdout JSON；合并优先级文档为 P > U > system > extension。D/中。[GM-H] | root `gemini-extension.json`；extensions 打包 commands/context/MCP/hooks/subagents/skills；hooks 在 extension `hooks/hooks.json` 而不是 manifest 内。D/中。[GM-E][GM-ER] | 未装 CLI，无 I/A；不能把 extension 安装等同每个 workspace 激活/批准 |
| Copilot — VS Code | `.github/prompts/*.prompt.md` P 与 VS Code user profile 的 reusable prompts；`/skill` 是另一种入口。D+C/高于默认 prompt 路径；执行未 I。[VS-P][VS-L] | 当前 Copilot harness 用共享 Copilot runtime hook 规范；Local 是独立 extension-host payload，即使接受兼容配置也不能等同 CLI。固定默认支持 `.github/hooks`、`.claude/settings*.json` 和个人 hook 路径。D+C/高于 defaults；Preview 和 provider lifecycle 需分别读。[VS-H][VS-HR][VS-L] | 官方支持 agent plugins、marketplace；发现 Copilot CLI `~/.copilot/installed-plugins` 中插件；禁用后 skills/agents/hooks/MCP/slash 等失效。D/中。[VS-G] | 当前 VS Code “Copilot/Local/Claude/Codex harness” 是不同执行语义；不能把 UI 品牌 VS Code 当唯一 host adapter |
| Copilot — CLI | `help commands`/plugin 管理存在；`/skills` 与 `/skill-name` D 确证；任意 `.prompt.md` 作为 CLI 原生命令文件本次 **未知**。D+C/中。[GH-CS][P-V] | `.github/hooks/*.json` P；`~/.copilot/hooks/*.json` U；repo/user settings inline、`.claude/settings*.json` compatibility、installed plugin hooks 另层；本机未触发 hook。D/中。[GH-H][GH-HR] | `copilot plugin` 静态帮助支持 install/list/marketplace/uninstall/update；当前 Agent Plugins 1.0 root `plugin.json`，`skills/<immediate-child>/SKILL.md`，Copilot 专属 agents/hooks 在 `com.github.copilot`；legacy manifest 位置可不同。D+C/中。[GH-CP][P-V] | 命令存在有独立 C，目录/schema 仅 D；没有插件安装 I/A |
| Copilot — GitHub.com cloud/coding agent | skills 可作为 workflow，CLI 命令菜单不能外推到云。D/中；独立命令文件协议 **未知**。[GH-S] | cloud clone `.github/hooks/*.json`；官方明确 sandbox 默认没有本地用户 hooks/settings/config/installed plugins。D/中。[GH-HR] | 本机 CLI plugin install 不保证云 job 获得插件，当前矩阵 **未知**。D 缺口。[GH-HR] | 没有付费云 job，不做已运行声明 |
| OpenCode | `.opencode/commands/**/*.md` P、`~/.config/opencode/commands` U；项目同名替换全局，另有 config commands。D/中。[OC-C] | hooks 是插件/JS API 能力；本次没有确证一个 Claude/Copilot 式 `hooks.json` 原生通用目录，**未知**，不能由“有 hook API”推导 JSON 互通。D/中。[OC-P] | 当前插件目录 `.opencode/plugins` P、`~/.config/opencode/plugins` U；config plugin entries，路径相对定义 config；插件可扩展 tools/hooks/commands/agents。D/中。[OC-P][OC-F] | 实际 I 仅 skills 发现；没安装插件或执行 hook |

## 可验证性与本次实验结果

本机环境为 macOS arm64；精确系统版本、Python、argv、cwd、筛选后的环境变量、退出码、stdout/stderr hash、前后文件树 hash 见 [probe-summary.json](probe-summary.json) 和 [discovery-summary.json](discovery-summary.json)。`HOME`、XDG_CONFIG_HOME/CACHE_HOME/DATA_HOME、CODEX_HOME 均设为隔离位置；不复制用户 auth、config 或凭据环境变量。fixture 项目通过独立 `git init` 划定边界，避免宿主顺着研究仓库父目录吸入本仓库技能。只运行 version/help/debug/features 和 initialize/skills-list；未调用 exec、prompt、thread/start 或 turn/start。

| 检查 | 实际结果 | 层与能证明的范围 | 不能证明的范围 |
|---|---|---|---|
| executable version | Claude Code 2.1.319；Codex 0.156.1；OpenCode 1.18.29；Copilot CLI 1.0.19；Cursor/Gemini 未在 PATH 找到 | C，当前机器可执行版本，详情 [P-V] | 不能证明宿主 feature 开关、登录权限或项目加载 |
| OpenCode debug skill，独立临时项目 | exit 0；发现 `project-opencode/project-agents/project-claude` 与 `global-opencode/global-agents/global-claude` | I-discovery，高；实际路径在 [I-D] | 未发现的 .codex/.github fixture 只限本次版本与配置；不推导未来/其他客户端完全不支持 |
| Codex app-server JSON-RPC | initialize 成功；仅请求 `skills/list`，返回 .agents/.codex 的 P 与 U fixture，scope 分别 repo/user、enabled=true | I-discovery，高；完整 sent/received 在 cache，摘要 [I-D] | 不包含模型请求；不证明技能正文被读、context/check 被调用、代理会遵守技能或入口 |
| Codex CLI feature/help | 完整 CODEX_HOME 创建后 features/list exit 0；hooks/plugins 显示 stable true，plugin help exit 0 | C 静态元数据/命令存在 | 不是 hook 触发测试，也不是插件实际安装测试 |
| 初次 Codex features probe | CODEX_HOME 目录不存在导致 exit 1；stderr 原样保存；修正隔离 harness 后成功 | 实验控制失败，保持记录，不记为产品失败 | 不得归因 Codex 不支持 features |
| 初次 OpenCode debug skill | cwd 在仓库 .cache 内，输出吸入父级仓库技能并且 JSON 尾部截断；未作为隔离发现证据 | 失效实验，完整 raw 保留 cache | 改用独立临时项目且文件 stdout 捕获后的结果才可作 I |
| OpenAI 官方 docs/search fetch | 六条官方 URL 都 curl exit 28、HTTP 0、SSL connection timeout | D 缺口，错误和 argv 均在 manifest | 不能声称成功读到官方 skills/AGENTS/hooks 文档；也不能声称宿主不支持 |
| Native Windows / Linux | 未运行 native runner | 未验证 | macOS 的路径/换行、权限结果不等价 Windows native；无 Windows 成功保证 |
| Agent efficacy / A | 未做 | 明确无证据 | 安装/发现成功不证明自动触发、遵守或模型质量；用户登录、额度与代理行为仍需单独批准和测试设计 |

OpenCode 的初次截断与 Codex 的首次 CODEX_HOME 缺失都是**研究 harness 缺陷**，已保留失败原文并在隔离重跑中纠正，避免把实验问题写成被测产品问题。没有修改用户全局配置。全部写入仅研究 cache、临时隔离目录与本票据研究文件。

## 对适配架构研究的约束

1. 一个安装配置要分别描述 **skill discovery roots、instruction entry、include strategy、scope、commands、hook/plugin protocol**。共享 `.agents/skills` 的宿主仍可能完全不同地解释入口文件与插件；目录别名不应决定 Provider 的抽象边界。[CU-R][GM-IC][GH-CI][OC-R]
2. `import` 至少应区分 loader-inline、agent-read-reference、explicit-config-files、unsupported/unknown。Cursor 的 `@file` 与 Claude 的 `@file` 语法相似但行为相反，是现成反例；Copilot CLI 的规则还随入口文件类型变化。[CU-R][CC-M][GH-CI]
3. scope 需要“执行机器 + 客户端 + project/user/managed + cloud session 类型”。用户 home 安装不能自动等价云 job；VS Code Codex 集成额外发现 .github skills 也不能推导原生 Codex CLI 同样发现。[CU-S][VS-S][GH-S]
4. 扩展点要有可证伪 capability。报告中的 **unknown** 应保留为不能发出保证的状态；不以 schema 字段存在、CLI help、安装成功冒充 A。[I-D][VS-S]
5. 本轮不实现以上能力，也不改变 Notes runtime pin、Result、清单所有权/事务或引入 hooks。宿主目录/入口兼容性不能消解安装器安全边界，详见其他研究票据。

## 重跑与审查入口

本目录只含研究脚本/摘要/报告。原始大文档、headers、curl 元数据、完整 CLI/RPC 输出和前后树保存在忽略目录 `.cache/host-adapter-study/hosts/`；它们的绝对 cache 路径和 SHA256 均在 manifest/summary。官方 live HTML 的导航/打包代码使同页 hash 可变化；重新抓取生成新 hash 只能说明新快照，不保证重建当日原始字节。固定 raw source URL 带提交，不依赖 branch head。

```sh
python3 .scratch/agent-host-adapters/research/hosts/fetch.py --cache /absolute/cache/hosts/docs
python3 .scratch/agent-host-adapters/research/hosts/probe.py --cache /absolute/cache/hosts/probes
python3 .scratch/agent-host-adapters/research/hosts/discover.py --cache /absolute/cache/hosts/discovery
python3 .scratch/agent-host-adapters/research/hosts/summarize.py --cache /absolute/cache/hosts
```

fetch.py 使用官方 URL/first-party fixed source，不读取 README/blog，不调用搜索摘要作为证据。Codex 源码 fallback 是用户明确授权的补证；官方域 docs-first 已先尝试，失败另记。没有可用 web search 工具，官方 search URL 失败也保留，未声称完成网页搜索。各源码固定提交见 [sources.json](sources.json)；source-excerpts.md 提供可审查摘录，摘录本身不是第二独立证据。

## Primary sources

以下别名对应实际已抓取的官方页/固定源码；原始字节 hash、时间和最终跳转 URL 见 catalog。未成功的 Codex 官方 URL 只在 manifest 中作为失败记录，不作为成功 D 引用。

[CC-S]: https://code.claude.com/docs/en/skills.md
[CC-M]: https://code.claude.com/docs/en/memory.md
[CC-H]: https://code.claude.com/docs/en/hooks.md
[CC-P]: https://code.claude.com/docs/en/plugins.md
[CU-S]: https://cursor.com/docs/context/skills
[CU-R]: https://cursor.com/docs/context/rules
[CU-C]: https://cursor.com/docs/agent/chat/commands
[CU-H]: https://cursor.com/docs/agent/hooks
[CU-P]: https://cursor.com/docs/plugins
[GM-S]: https://geminicli.com/docs/cli/skills/
[GM-M]: https://geminicli.com/docs/cli/gemini-md/
[GM-C]: https://geminicli.com/docs/cli/custom-commands/
[GM-H]: https://geminicli.com/docs/hooks/
[GM-E]: https://geminicli.com/docs/extensions/
[GM-ER]: https://geminicli.com/docs/extensions/reference/
[GH-S]: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
[GH-I]: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
[GH-CI]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions
[GH-CS]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills
[GH-H]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks
[GH-HR]: https://docs.github.com/en/copilot/reference/hooks-reference
[GH-CP]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating
[VS-S]: https://code.visualstudio.com/docs/copilot/customization/agent-skills
[VS-I]: https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference
[VS-P]: https://code.visualstudio.com/docs/copilot/customization/prompt-files
[VS-H]: https://code.visualstudio.com/docs/copilot/customization/hooks
[VS-HR]: https://code.visualstudio.com/docs/agents/reference/hooks-reference
[VS-G]: https://code.visualstudio.com/docs/copilot/customization/agent-plugins
[OC-S]: https://opencode.ai/docs/skills/
[OC-R]: https://opencode.ai/docs/rules/
[OC-C]: https://opencode.ai/docs/commands/
[OC-P]: https://opencode.ai/docs/plugins/
[OC-F]: https://opencode.ai/docs/config/
[GM-SC]: https://github.com/google-gemini/gemini-cli/blob/1930f25394c4b6338b64ffdb43083fca41614798/packages/core/src/skills/skillManager.ts
[GM-MC]: https://github.com/google-gemini/gemini-cli/blob/1930f25394c4b6338b64ffdb43083fca41614798/packages/core/src/utils/memoryDiscovery.ts
[GM-IC]: https://github.com/google-gemini/gemini-cli/blob/1930f25394c4b6338b64ffdb43083fca41614798/packages/core/src/utils/memoryImportProcessor.ts
[GM-CL]: https://github.com/google-gemini/gemini-cli/blob/1930f25394c4b6338b64ffdb43083fca41614798/packages/cli/src/services/SkillCommandLoader.ts
[OC-SC]: https://github.com/anomalyco/opencode/blob/9e2f9311ae1b183af0c971c165aff324e8b4b2b8/packages/core/src/config/plugin/skill-scan.ts
[OC-IC]: https://github.com/anomalyco/opencode/blob/9e2f9311ae1b183af0c971c165aff324e8b4b2b8/packages/core/src/config/plugin/instruction.ts
[VS-L]: https://github.com/microsoft/vscode/blob/b7727d5ec94ee28e38651d5581f367010db3db68/src/vs/workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.ts
[VS-Q]: https://github.com/microsoft/vscode/blob/b7727d5ec94ee28e38651d5581f367010db3db68/src/vs/workbench/contrib/chat/common/promptSyntax/languageProviders/promptSkillResolver.ts
[CX-R]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/host_roots.rs
[CX-L]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/loader/host.rs
[CX-D]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/ext/skills/src/loader/discovery.rs
[CX-A]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/core/src/agents_md.rs
[CX-U]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/codex-home/src/instructions/mod.rs
[CX-H]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/hooks/src/engine/discovery.rs
[CX-HC]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/hooks/src/config_rules.rs
[CX-T]: https://github.com/openai/codex/blob/551fc719d67b69997a5997d6a3f187a72ca2ab74/codex-rs/app-server/tests/suite/v2/skills_list.rs
[P-V]: probe-summary.json
[I-D]: discovery-summary.json

# 安装、升级与修复

准备 Node >=22.12.0 与 Git。使用选定版本的完整 npm 包；参数和错误以 [CLI 契约](../assets/references/cli.md)为准。以下 X.Y.Z 替换为选定版本；这些命令面向新协议候选版本，已发布的旧包不提供新命令。

## 接入项目

```sh
cd /path/to/project
npx --yes @hackycy/agent-notes@X.Y.Z install
```

终端中询问缺项，默认通用 generic、`.agents/notes` 和中文模板。脚本可显式选择并先预览：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --host claude-code --dry-run --json
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --host claude-code --json
```

也可使用 pnpm dlx 或已安装的对应版本 bin。`--json`、`--no-interactive` 和 CI 禁用问答，省略接入时首次默认 generic、已有安装沿用现集合。`--notes-dir docs/decisions` 首次指定整个 Notes 根，`--language en` 选择英文模板；之后配置保持原文。

两份 skill 安装到 `.agents/skills`（generic/codex 共享）或 `.claude/skills`（claude-code），共用一个 runtime。CLI 不管理 AGENTS/CLAUDE 规则文件。提交 runtime、skill、配置、清单和 Git 小块；local 草稿、备份和 journal 保持忽略。

## 验证安装与日常使用

```sh
node .agents/notes/runtime/cli.mjs status --json
node .agents/notes/runtime/cli.mjs context --paths src/example.ts
node .agents/notes/runtime/cli.mjs check --json
```

status 检查工具完整性，context 返回按需阅读的指针，check 给出结构诊断与语义评审项。自定义根时替换命令路径。项目锁定 runtime 可离线使用；Note 的 `update <id>` 仍是正文维护命令。

本期具体宿主范围是本地 Codex CLI 与 Claude Code CLI。静态安装与宿主发现、正文加载、工作流执行分别验证；尚未取得固定版本真实证据时只称候选接入。Windows/Linux 采用 Node 通用实现，原生验证情况见候选版本的交付记录；不将 macOS 或 Git 换行测试当作原生证明。安装不承诺 agent 每次自然触发 skill，也不保证自动执行 context/check。

## 调整完整接入集合

```sh
node .agents/notes/runtime/cli.mjs hosts set --host claude-code --dry-run
node .agents/notes/runtime/cli.mjs hosts set --host claude-code
```

重复 --host 给出完整非空集合，版本和 Notes 根不变。终端缺参可选现集合；无人值守缺参报错。撤出最后一个共享消费者才删除共享文件；未知邻接内容保留，残留同名目录再次接入会冲突。

## 升级项目版本

```sh
npx --yes @hackycy/agent-notes@X.Y.Z tool update --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z tool update
```

版本由本次包决定，允许向低版本切换，不自动查询或下载；接入集合与项目内容保留。普通管理遇到受管损坏先要求 repair。同版异 bundle 拒绝。旧 install/1、旧 journal 与旧命令没有迁移/兼容支持。

## 修复当前安装

```sh
node .agents/notes/runtime/cli.mjs repair --dry-run
node .agents/notes/runtime/cli.mjs repair
```

修复保持版本和 bundle；可读手改先完整备份。源损坏时使用 install.json 对应版本的完整 npm 包：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z repair --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z repair
```

未知邻接文件保留且不加入 bundle。无效/缺失清单不自动重建所有权；不可读、symlink 和坏规则块需先人工处理。必要备份失败不覆盖受管文件，可能留部分 local 证据。

如果 runtime 的 CLI 本身损坏到无法启动，也从外部匹配 npm 包执行 repair；进程启动失败可能没有统一 JSON 结果，不要求损坏的 runtime 自行修复。

## Git 规则与容量冲突

Git 小块按精确资产确定生成。若既有规则隐藏工具文件，或生成块将改变未知邻接文件的可见/忽略状态，安装会报冲突并指出路径。先检查该路径的 `git check-ignore -v --no-index <path>` 和 `git check-attr text eol -- <path>`，按项目意图调整块外或嵌套规则，再重跑预览。CLI 不改写全局 Git 配置，也不临时生成另一份受管块迁就环境。

容量错误会列出对象、实际量和上限。任一 Git 规则整文件或手改资产超过 16 MiB、事务逻辑载荷超过 64 MiB、必要备份超过 64 MiB 时管理停止；完整项目相对路径（含备份衍生路径）最多 1024 UTF-8 字节，原生文件系统可能更早限制。先保存完整原文并人工整理，不能截断 journal、删除未知内容或使用 force 绕过检查。

## 中断与冲突

预览和 status 只读。显式 `repair --recover` 或其他合法写命令的 --recover 先验证双端 journal、恢复旧事务，再规划当前请求；输入与取消先于恢复写入。遇到外部第三种字节或源证据不足时保留现场。处理方法见[事务和恢复](../assets/references/writing.md#事务和恢复)。

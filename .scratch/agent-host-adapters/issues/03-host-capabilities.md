# 宿主能力、加载语义与可验证性矩阵

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: host_capabilities
Parent: ../map.md
Blocked by: none

## Question

对 Claude Code、Cursor、Codex、Gemini CLI、GitHub Copilot、OpenCode 以及 .agents/.claude 安装配置建立矩阵：skills、入口/规则、导入语义、commands/hooks/plugins、project/global scope。逐项官方来源和置信度，保留抓取日期/hash/宿主版本，尽力以固定源码或发现实验交叉验证。明确 D/C/I/A、未知和未支持；.agents 不是宿主，Copilot 必须标清客户端。

## Comments

## Answer

已完成 [宿主能力、加载语义与可验证性矩阵](../research/hosts/report.md)，含 skills 目录/入口、常驻入口与规则、导入语义、commands/hooks/plugins、project/global/cloud scope，逐格标 D/C/I/A、置信度和证据缺口；`.agents`/`.claude` 已明确为安装配置而非宿主，Copilot 分开 VS Code harness、CLI 与 GitHub.com cloud。

- 70 个来源条目：64 个成功快照（其中 29 个固定源码文件）、6 个 OpenAI 官方 URL SSL timeout；[来源清单](../research/hosts/snapshot-catalog.md)、[时间/hash/argv manifest](../research/hosts/fetch-manifest.json)、[摘录](../research/hosts/source-excerpts.md) 可审查。官方 live 页是 2026-11-10 observed，不能追溯为 Impeccable 4.8.2 发布时能力。
- 无模型 fixture 实测：OpenCode 1.18.29 发现项目/全局 .opencode/.agents/.claude skills；Codex 0.156.1 仅 initialize + skills/list 发现项目/全局 .agents/.codex skills。发现不等于 agent 选择或遵守，A 全部未验证。[实验摘要](../research/hosts/discovery-summary.json)
- 所有 runner 支持 --cache 与可移植默认路径；缺少 executable 可 graceful skip；argv/stdout/stderr/exit/tree/hash 完整原始输出保留忽略 cache，分支只保存紧凑摘要。[验证记录](../research/hosts/validation.md)
- 关键反例：Cursor rule 的 @ 引用不内联；Claude/Gemini/Copilot CLI 特定入口支持真实导入，Copilot CLI 又明确排除 GEMINI.md/*.instructions.md 的 @ 展开；OpenCode 不自动解析 AGENTS 引用。不能建立通用 @ import 行为。
- 闭源宿主缺少第二独立机制证据、OpenAI D 抓取失败、native Windows/Linux 未测以及所有 A 未测均保留为缺口。没有调用付费模型、用户凭据或修改用户全局配置。

Research branch: `research/host-adapters-hosts`，已推送 origin。Commit: `5069079dc1295129891d405e9c59516db4b28b93`。未开 PR、未合并；MAIN 中本目录为同 hash 可读副本。`pnpm lint`、Python 语法、链接、全部成功原始 body hash 与 git diff --check 通过。

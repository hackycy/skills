# 写入与生命周期命令

五个写命令共用项目锁定的 runtime。用户在对话中接受 Agent 的记录建议，或显式要求记录后，即可准备材料并调用；CLI 不要求批准令牌、聊天记录或会话凭据。

所有命令支持 `--root`、`--json`、`--input <json-file|->` 和 `--dry-run`。输入文件与草稿路径相对项目根解析；`--input -` 从标准输入读取一个 JSON 对象。字段固定，未知字段和重复键拒绝。下面的命令在仓库根运行；将项目路径和 ID 替换为真实值。

先用 `init --target agents` 或 `init --target claude` 安装，草稿和恢复 journal 放在已忽略的 `.agent-notes/local/`。在项目根执行 `node .agent-notes/runtime/cli.mjs`；从其他目录调用时可显式传 `--root`。写命令不会改 Git index、提交、推送、安装 hook 或配置 CI。

## 新建

先准备普通 Markdown 草稿，frontmatter 只含 `scope`、`read_when` 与可选 `relations`。不要提供 `format/id/status`。正文应满足 [文档章节契约](contracts/document.md#4-正文与生命周期)，正文链接按最终 Note 所在目录解释。草稿是输入，CLI 不会覆盖它。

```yaml
scope:
  paths: [src/orders/**]
  topics: [event-ownership]
read_when: 修改订单事件的发布责任时。
```

创建输入示例：

```json
{
  "class": "architecture",
  "status": "proposed",
  "document": ".agent-notes/local/event-ownership.md",
  "rationale": "代码不能解释为何放弃基础设施统一发布；该边界会影响后续入口。"
}
```

```sh
node .agent-notes/runtime/cli.mjs create --root /path/to/project --input .agent-notes/local/create.json --dry-run --json
node .agent-notes/runtime/cli.mjs create --root /path/to/project --input .agent-notes/local/create.json --json
```

status 允许 `proposed` 或 `implemented`。CLI 从首次创建的 UTC 日期、class 和标题生成稳定路径，生成 UUID v4 身份；同路径冲突失败。`--dry-run` 不写入任何文件，以固定临时 ID 检验关系并展示 before/after，结果 `data.id` 为 null；实际执行才生成身份。

同标题或同 topic 的现有 Note 作为 candidates 返回，不机械认定重复。作者仍应确认同一决定使用 update，不同决定新建并关联。rationale 必须非空，长期理由本身也应写在正文中；CLI 不会把该输入另外存成审计台账。

## 维护和交付

先用 `show <id> --json` 获取最新 `data.hash`。每次修改都需要这个 `expected_hash`，防止覆盖其间编辑。

| 命令 | 输入字段 | 作用 |
| --- | --- | --- |
| `update <id>`，proposed/implemented | expected_hash、reason、document | 修改同一决定；新稿携带原 format、id、status |
| `update <id>`，rejected | expected_hash、reason、metadata | metadata 只允许 scope、read_when、relations；原正文和拒绝理由保留 |
| `transition <id> --to implemented` | expected_hash、reason、document | 仅 proposed 可交付；草稿携带原 ID、format 与原/目标 status，正文改为 implemented 章节 |
| `transition <id> --to rejected` | expected_hash、reason | 程序保留提案正文并设置拒绝理由；拟 supersedes 转成 related |

rejected 的 metadata 是局部更新，未传字段保持原值。传入 `"relations": {}` 可移除最后一组关系；正式 Note 会省略该字段，仍遵守 v1 schema，不生成空关系对象。

```json
{
  "expected_hash": "从 show 返回的完整 SHA-256",
  "reason": "交付了所有订单入口并补充实际验证。",
  "document": ".agent-notes/local/delivered.md"
}
```

```sh
node .agent-notes/runtime/cli.mjs transition <id> --to implemented --root /path/to/project --input .agent-notes/local/deliver.json --json
```

编辑/交付草稿中的相对正文链接按该 Note 当前所在目录解释，转换时重算移动后的路径。新 supersedes 会在活跃目标补 related 反向关系；冻结目标不修改，反向查找来自索引。

转换保留首次日期、slug、class、ID，移动 lifecycle，并修复活跃 Markdown 入链和被移动文件的出链。行内链接、图片和引用式定义均基于 Markdown AST 改写；代码块保留。被引用锚点消失、转义目的地无法精确定位或重叠改写会阻止整个事务，作者需先消除歧义。CLI 不猜测 `#proposal` 应改成哪个已交付章节。

## 归档

```json
{
  "expected_hash": "从 show 返回的完整 SHA-256",
  "reason": "该组件已经退役，原边界不再指导当前实现；保留其历史取舍。"
}
```

```sh
node .agent-notes/runtime/cli.mjs archive <id> --root /path/to/project --input .agent-notes/local/archive.json --json
```

归档和清理要求可解析 Git 基线，默认 HEAD，可用 `--base <commit>` 显式选择。归档只接受 implemented，必须先处理所有现行 requires 和活跃校验错误。

归档只在原 frontmatter 末尾追加 archive 元数据，保留既有 YAML、注释和正文，冻结原出链，修复活跃入链。seal 同时记录归档前后原始字节 hash；只有基线包含完全相同的来源文件时才写 source revision。后续 update/transition/archive/prune 均拒绝该对象。即使本地手动移除 marker 和 seal，也不能越过可信基线冻结保护。

## 条件清理

rejected 需要 reason 说明为何已无防错价值，以及 references。implemented 还需要一个当前有效的 implemented owner、owner 的 expected_hash 和 coverage。owner 可附 document 在同一事务中承接内容；部分 supersedes 不能作为删除依据，完整 supersedes 也不能替代 coverage。

```json
{
  "expected_hash": "旧 Note 的 SHA-256",
  "reason": "原记录的全部独有论证已由新的责任边界记录承接。",
  "owner": {
    "id": "承接者的真实 Note ID",
    "expected_hash": "承接者的 SHA-256",
    "document": ".agent-notes/local/owner.md"
  },
  "coverage": [
    { "source": "#决策", "destination": "#决策" },
    { "source": "#考虑过的替代方案", "destination": "#考虑过的替代方案" },
    { "source": "#验证", "destination": "#验证" }
  ],
  "references": [
    { "path": "承接者的真实 Markdown 路径", "target_id": null },
    { "path": "README.md", "target_id": "承接者的真实 Note ID" }
  ]
}
```

```sh
node .agent-notes/runtime/cli.mjs prune <id> --root /path/to/project --input .agent-notes/local/prune.json --dry-run --json
node .agent-notes/runtime/cli.mjs prune <id> --root /path/to/project --input .agent-notes/local/prune.json --json
```

coverage 的 source/destination 使用实际存在的章节锚点，分别相对旧 Note 和 owner。映射应涵盖全部独有理由、替代方案、后果、验证与覆盖缺口；定位存在由脚本检查，语义覆盖的充分性由评审确认。

references 必须逐项处理所有活跃入链来源，含结构关系和正文；没有入链传 `[]`。target_id 为另一个真实 Note ID，或 null 表示移除。移除正文链接会保留可见文字；图片保留 alt。owner 对被删除对象的 supersedes 使用 null 移除，不能制造自引用。锚点不会被猜测或自动重新命名。

冻结来源不修改。另一个 rejected 正文中的链接若要换成不同决定或删除，也属于改写历史，会阻止清理；可以保留旧记录，不能以清理为由越过保护。直接清理 proposed 被禁止；若整个 PR 内经过拒绝再合法清理，check 从两端快照只报告需审查中间过程。

## 事务和恢复

写命令先生成完整内存变更，校验终态及历史保护，再取得 `.agent-notes/local/write-lock`。取得锁后与落盘完成前都会核对 Git 基线、配置、已安装 runtime、输入、Notes 和引用来源；变化则中止或回滚。每个文件原子替换，多文件整体依靠 journal 与恢复协议，不声称多文件同时原子可见。

普通写入失败会恢复原文件。进程被终止后，工作树查询和新写入报告 `RECOVERY_REQUIRED`，避免把半完成状态当成正常文档；index/commit 检查仍可独立运行。将原写命令附加 `--recover`，会先恢复中断事务，再按当前输入重新预检执行：

```sh
node .agent-notes/runtime/cli.mjs archive <id> --root /path/to/project --input .agent-notes/local/archive.json --recover --json
```

`--recover` 不能与 `--dry-run` 同用。活跃或其他主机的锁返回 WRITE_BUSY。恢复时只有文件仍匹配 journal 的 before/after 之一才允许恢复；外部编辑返回 RECOVERY_CONFLICT，保留原文和 journal，并指出路径。先保存并人工协调该编辑，使文件回到 journal 的某个端点后，再重试恢复。不要直接删除 journal 或 reset 仓库。

锁归属无法读取、恢复本身再次中断或 PID 被复用时会保守停止，需要检查进程与 journal 后人工处理。这是文件系统恢复边界，没有 Agent 会话/宿主事件协议或后台自动清理。

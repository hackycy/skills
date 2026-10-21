# Agent Note 文档契约

本文定义 `agent-note/1` 与 `agent-note-archive/1` 的持久格式、关系及历史保护。工具升级持续读取合法的既有文档，保持其内容与路径。命令输入见 [CLI 契约](cli.md)和[写入参考](../writing.md)。

## 1. 文档根、身份与编码

默认 `.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic.md`。lifecycle 为 proposed、implemented、rejected、archived；class 为 feature、bug-fix、simplification、architecture、process、testing。文档根在 init 时配置，必须位于项目内。

ID 为 `an-` 加小写 UUID v4，由 create 生成；标题为唯一 H1。日期为首次 create 的 UTC 日期，标题生成安全 slug；同身份的日期、slug 和 class 不随正文修改而重命名，状态转换仅移动 lifecycle。同名冲突报错，用户调整标题后重试。ID 不随移动改变，CLI 不接收调用者分配的 ID，不为删除的决定复用身份。

普通 Note 是 UTF-8、无 BOM、LF 换行的 Markdown；create/update 将活跃草稿写成该编码。安装器以窄范围 `.gitattributes` 规则为文档根设置 `text eol=lf`，保留其他规则；冲突预检失败。check 报告不符合编码的文件，archive 不借编码转换改正文。已封存文件以原始字节计 hash。

文件名/ID 保持稳定，生命周期转换负责移动并修复引用；工具升级不改变文档路径或内容。

## 2. YAML frontmatter

必需字段只有 format、id、status、scope、read_when。标题与 class 不在元数据中重复保存。

| 字段 | 准确形式与条件 |
| --- | --- |
| format | 字符串 `agent-note/1` |
| id | `an-<UUID v4>` |
| status | proposed / implemented / rejected；archived 目录保留 implemented |
| scope | paths/topics 非空数组之一，或 `global: true`；global 与其他两项互斥 |
| read_when | 非空单行字符串，说明何时需要读取 |
| rejection_reason | 非空字符串；仅 rejected 必需 |
| relations | 可选对象，包含 related、requires、supersedes 中至少一项 |
| archive | 仅 archived 需要，包含 date（YYYY-MM-DD）和非空 reason |

paths 为仓库根相对路径，使用 `/`；支持普通字符、`*`、`?`、独立路径段 `**`，按大小写匹配，包含点文件。不支持绝对路径、`..`、反向排除、花括号或 extglob。topics 是精确匹配的非空领域词，不做隐式自然语言推断。数组非空、元素唯一，未知字段和 YAML 重复键报错。frontmatter 使用 JSON 可表达的值，不支持自定义 tag、alias/merge key 或隐式日期对象；日期显式写字符串。

v1 的字段集合固定。新增模板说明不能变成旧文档的新必填项；未来确需扩展协议时使用新 format，并继续读取 v1，不静默重写它。

## 3. 关系

```yaml
relations:
  related:
    - an-98e9a99f-81c9-4e06-901f-aedb1429d493
  requires:
    - an-83869376-c1c7-43c5-a6f5-450c7fe4ee4f
  supersedes:
    - id: an-019b1195-adb7-4a41-b9cd-d73066b39efa
      extent: partial
      reason: 只迁移新渠道，旧渠道仍沿用原决定。
```

这是关系形状示例，不是可以直接写入任意项目的记录。related/requires 是 ID 数组；supersedes 为 `{id, extent, reason}` 数组，extent 为 full 或 partial，理由非空。各数组内目标不重复，不允许指向自己。

- related 指向存在的 Note，可指向冻结历史；它不声明依赖或替代。
- requires 指向活跃 implemented，不能指向 archive 或已经被现行 implemented 完整替代的决定。依赖图不能有环。
- supersedes 指向存在的 implemented 或 rejected，可指向 archive；来源只能 proposed 或 implemented。替代图不能有环。proposed 的边表示意图，只有 implemented 后继才改变旧决定的现行地位。
- partial 不使旧决定整体失效；full 也不意味着全部独有内容已被吸收。保留在活跃树的旧 Note 仍可包含有用理由，查询明确标识其替代关系，不能把旧结论误作当前要求。

新的替代关系在活跃目标中补 related 反向关系，工具按 ID 展示可点击路径；正文需要引用时仍写标题包裹的相对 Markdown 链接。冻结目标使用反向查询，不补写旧文。拒绝一个带拟替代关系的 proposed 时，将拟 supersedes 转为 related，保留提案正文，不能让 rejected 后继继续表达生效替代。

允许清理时，所有活跃结构关系与正文入链必须指向承接者或明确移除；新 owner 的 supersedes 不保留悬空 ID。必要历史来源使用固定 Git 链接补充，不能代替保存独有内容。

## 4. 正文与生命周期

正文从问题开始，章节内容必须非空，不能包含未填写模板占位符。识别下面固定的中英文 H2 名称；项目语言只选择生成哪种模板，不改变旧文件的合法性。可以增加领域章节，H1 不重复。

| 状态 | 按顺序出现的必需章节 |
| --- | --- |
| proposed | 问题 / Problem；提案 / Proposal；考虑过的替代方案 / Alternatives considered；验收标准 / Acceptance criteria；风险 / Risks |
| implemented | 问题 / Problem；决策 / Decision；考虑过的替代方案 / Alternatives considered；后果 / Consequences；验证 / Verification |
| rejected | 保留拒绝时的 proposed 正文与章节；拒绝理由放 rejection_reason |

implemented 不保留 Proposal、Plan、Migration plan、Acceptance criteria 及其对应中文提案/计划标题。验证描述实际已完成的检查与可定位证据，不能只写“已完成”。替代方案必须来自实际考虑；没有其他可行候选时如实说明为何没有，不为满足模板编造讨论。

更新边界固定如下：

- proposed：允许完善同一提案；已经变成另一个问题/选择时新建 Note。
- implemented：允许更新同一决定的事实、路径、scope、验证与补充论证；不得替换成另一决定。语义身份由作者与评审检查。
- proposed → implemented：保留 ID、首次日期及原有理由，整理为实际决定与验证；允许在同一个 PR 与代码一起交付。
- proposed → rejected：程序保留正文，添加真实拒绝理由并移动/修复链接。
- rejected：原提案正文和 rejection_reason 保留。update 仅可改 scope、read_when、relations，以及由 CLI 计算的引用目标修复；不接受新的正文或改写裁决。需要纠正或补充历史判断时新建有 related 关系的 Note，不伪装为原来的理由。
- archived：正文、元数据、路径和已有 seal 全部冻结。

rejected 不增加单独的 seal 系统。针对可信基线中已为 rejected 的记录，check 比较正文与拒绝理由；只放行同一引用对象因路径变化产生的确定性链接修复，无法验证的变化报错。基线中还是 proposed 时，无法由两端快照恢复本次拒绝前每一步讨论，列入评审。该保护不取消已确认的 rejected 有条件删除权限。

## 5. 归档清单

archive 元数据只在封存时添加：

```json
{
  "archive": {
    "date": "2026-10-21",
    "reason": "该边界已不再参与当前实现，保留历史取舍用于追溯。"
  }
}
```

`archived/manifest.json` 使用以下固定形状，entries 以 ID 为键；路径均相对 Notes 根：

```json
{
  "format": "agent-note-archive/1",
  "entries": {
    "an-98e9a99f-81c9-4e06-901f-aedb1429d493": {
      "path": "archived/architecture/2026-10-21-event-ownership.md",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "source": {
        "path": "implemented/architecture/2026-10-21-event-ownership.md",
        "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    }
  }
}
```

示例 hash 仅展示形状。sha256 为小写 64 位十六进制：外层记录封存后整份文件的原始字节，source 记录操作前路径及整份文件的字节。source 可额外包含 revision；只有该 Git commit 中的来源文件与 source hash 完全一致时才写入，否则省略，不能把某个 HEAD 冒称为未提交正文的来源。

每个 archived Note 恰有一条对应 entry，反向也成立；ID、路径、状态、archive 元数据和 hash 均须一致。已有 entry 相对可信基线保持全部字段不变，只能追加新 entry；当前树与基线中的归档身份、路径都参与保护，先删 marker/seal 再删文件不能绕过。

archive 从当前 implemented 原文生成终态，仅加入 archive 元数据，保留正文与其他元数据，移动到对应目录。其自身历史出链不重写；修复活跃入链，不校验冻结出链为当前事实。有精确 source revision 时可回查来源，否则依靠 Git 历史追溯，不能保证当时所有外部链接可重现。

存在 requires 指向待归档对象时必须先处理现行依赖。先有必须修复的活跃格式/链接问题则先处理，不借归档逃过检查。首次封存的操作前正文由 archive 命令核对；独立 check 只有基线可提供对应来源时才能复核这一过程。基线已冻结的对象则始终严格检查。

## 6. 查询与引用修复

静态入口只说明查询时机和命令，不列全库 Note。`context --paths ... --topic ...` 返回 ID、H1、status、read_when、路径、匹配原因及替代关系；全局、精确 topic、glob 和 requires 闭包构成必读集合。全文搜索沿用仓库搜索，不引入第二套检索服务。

默认候选来自活跃树；archive 通过显式 `--include-archived` 查询或 show/历史关系追溯。结果完整输出，不静默截断必读项；候选过多时提示收窄范围，不自动丢弃全局约束。CLI 扫描文件不等于将正文提供给模型。

show 按 ID 返回当前路径、原文字节的 SHA-256 和正文。直接按路径读取同样有效。没有会话认证、已读凭据、持久免写文件或人工 INDEX。每次从文件重建内存索引，不持久化查询缓存，避免缓存失效协议。

新增文件匹配预期路径，rename 查询旧新路径，delete 查询旧路径。范围扩大按规则重查。scope 未准确标记造成的漏读仍需维护与评审；CLI 不保证模型实际阅读或理解。

转换扫描项目内 Git 跟踪及非忽略 Markdown 的活跃引用，排除冻结历史与安装 runtime；采用 Markdown 链接解析，不能用文本替换误改代码块。相对目标因移动变化时重算路径；被引用锚点消失时报告，不能猜测新含义。无法准确修复的入链阻止相关写事务，允许作者先修复后重试。

## 7. 兼容承诺

元数据形状固定为[Note schema](agent-note-1.schema.json)和[archive schema](agent-note-archive-1.schema.json)。目录、关系目标、Markdown 章节及 Git 历史约束由本文定义，JSON Schema 不承担这些跨文件检查。

runtime 升级只替换工具，旧合法文件继续合法，归档字节与 seal 不变；未知 format 明确拒绝，不忽略后写回。兼容边界从本契约开始；工具版本、模板语言和新增模板说明均不改变旧合法文件的合法性。

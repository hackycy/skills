# agent-governance 维护说明

本文件面向 **Skill 维护者**。执行规则以 `SKILL.md` 和下发到项目中的治理模板为准。

## 当前状态

仍处于未正式发布阶段，`VERSION` 和 `templates/manifest.json -> framework.version` 固定为 `0.0.1`。内部迭代依赖模板 hash、ownership 与当前内容同步，不建立虚构的预发布 migration 历史。

## 治理约束

`init / adopt / status / upgrade / doctor` 通过 baseline hash、managed block 和 `.incoming` 保护项目内容，并检查以下 repository invariants：

- fence-aware 严格 Note parser：精确 header、唯一 Status、章节顺序、重复 H2、forbidden heading；
- Note 空壳阻断：模板 `REQUIRED` 占位符与空章节不能通过；
- 活跃 Note 相对 Markdown link 与结构化关系目标检查；
- canonical lifecycle/class 由 manifest 和 verifier 定义，不依赖可手改的 `framework.json`；
- `archived/manifest.json` SHA-256 seal，archive 后正文不可悄悄改写；
- `archive_agent_note.py` 统一归档流程，并阻止仍有 active inbound reference 的归档；
- `governance_check.py` 作为本地和 CI 的单一 gate；
- manager lock、atomic state/template write、exclusive Note creation；
- `resolve --mode take-framework|keep-local|detach` 明确长期项目偏离；
- health model：healthy / sync-needed / conflicted / broken；
- 可选 GitHub Actions integration；
- `PACKAGE_SHA256S.txt` 由 `scripts/verify_package.py` 真正验证，而不是装饰性文件。

## Ownership 模型

框架拥有：根 `AGENTS.md` managed block、`.agents/AGENTS.md`、Note 规则/模板、项目级治理 Skills、verifier/辅助脚本，以及可选 CI adapter。

项目拥有：真实 Agent Notes、`archived/manifest.json` 的 seal 数据、managed block 外项目规则、源码/测试/普通文档，以及明确 `keep-local` / `detach` 的项目偏离。

`framework.json` 是安装状态，不是治理 schema。canonical taxonomy 由 manifest + verifier 代码确定。

## 同步状态

ownership：

- `framework-managed`：框架可在 baseline 未被本地改写时安全更新；
- `adopted-local`：接管时发现既有本地内容，必须显式决议；
- `project-override`：项目明确保留本地版本；框架变化仅生成候选更新；
- `detached`：框架停止管理；
- `project-owned`：框架只负责首次 seed，之后内容由项目维护，例如 archive manifest。

## Archive 设计

archive manifest 格式：

```json
{
  "version": 1,
  "files": {
    "architecture/2026-01-01-topic.md": {
      "sha256": "...",
      "archived": "2026-10-02",
      "source": "implemented/architecture/2026-01-01-topic.md"
    }
  }
}
```

archive 脚本按 `target → manifest seal → delete active source` 顺序写入，并支持在中途异常留下 target/seal 后安全重试。verifier 要求 every archived Note sealed、every seal target 存在、hash/date/source 一致。

## CI contract

项目内稳定命令：

```bash
python3 .agents/scripts/governance_check.py --root .
```

默认 `sync-needed` 仍 exit 0，避免仅有可选更新就阻断产品 CI；`--strict-sync` 可把它变成 exit 3。broken=1，conflicted=4。

全局 `doctor` 还会比较项目与当前 Skill bundle，因此能识别模板 drift 和 available update；exit code 为 `0/3/4/1`。

## 事故与 breaking change 路由

Agent Note 不应吞掉其他知识类型：

- postmortem 回答真实故障为什么穿过现有防线；
- Agent Note 回答从事故中形成的长期设计/流程决定及其 alternatives；
- upgrade/migration guide 回答用户或下游需要如何迁移。

框架只规定 owner 边界，不强迫所有项目采用同一个 postmortem/upgrade-guide 目录。

## 修改 Skill 时

1. 未正式发布前保持版本 `0.0.1`。
2. 新增/删除 framework asset 时更新 `templates/manifest.json`。
3. 修改治理规则时同步更新 verifier、项目 Skills 和测试，避免文案与 enforcement 分叉。
4. 修改 ownership/upgrade 行为时必须覆盖 adopt、upgrade、resolve、project-owned、optional integration 测试。
5. 修改 archive 行为时必须覆盖 seal、tamper detection、active inbound reference 和重试边界。
6. 运行：

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q scripts templates/project/.agents/scripts tests
python3 scripts/verify_package.py
```

7. 最后重新生成 `PACKAGE_SHA256S.txt`，再运行 package verifier。

## 参考

本 Skill 吸收了 DeepSeek Harness 的 Agent Notes lifecycle、alternatives、supersession、archive/current-authority 分离和 verifier 思路，但保留自己的跨项目治理层：单语 Note、init/adopt/upgrade/resolve、baseline ownership、安全模板分发和多 Agent 并发保护。

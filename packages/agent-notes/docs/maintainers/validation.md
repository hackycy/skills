# 维护验证

从仓库根执行命令；以实际脚本和本次改动为准，不把一次历史验收结果作为后续变更通过的依据。

## 按改动选择检查

| 改动 | 检查要求 |
| --- | --- |
| 维护文档 | `pnpm lint`、受影响的相对链接与锚点、`git diff --check` |
| TypeScript 或配置 | 上述检查，加 `pnpm exec tsc --noEmit` 与对应 Vitest 测试 |
| 格式、关系、历史保护或状态操作 | 包级测试，保留正反样例及历史格式兼容覆盖 |
| README、安装指南、assets 或安装布局 | 构建并打包，检查实际 tarball 的分发范围与已安装项目的文档引用 |
| 分发、委派、升级、修复或事务 | 包级测试，加仓库外 `test:bundle` 与 `test:install` |

包级测试命令为 `pnpm --filter @hackycy/agent-notes test`；单文件测试可在末尾传入 `tests/<name>.test.ts`。根 `pnpm test` 扫描 workspace 包。

## 行为覆盖

- `reader.test.ts`、`commands.test.ts`：契约样例、范围发现、路径与 symlink 边界、工作树/index/commit 隔离、关系与冻结基线。
- `workflow.test.ts`：草稿、expected_hash、身份保持、交付/拒绝、AST 引用修复、内容承接、条件清理与归档。
- `transaction.test.ts`：写失败回滚、真实子进程 SIGKILL、锁竞争、输入/runtime 并发变化、恢复冲突保留外部编辑。
- `distribution.test.ts`：七集合、49 次集合转换、常驻规则文件不变、Git 忽略/属性、资产所有权、备份、重复安装、版本切换、同版本修复与恢复。
- `capacity.test.ts`、`projection.test.ts`：协议及完整投影的独立上限与 +1、累计超限、真实大端点解码、备份总量、非法编码及读取期间增长。
- `assets.test.ts`：产品资源的引用闭包、公开文档的 npm 可达性和维护文档链接。
- `cli-input.test.ts`：全部命令参数、按运行来源区分的帮助与错误、安装缺项/复用/冲突、取消零写入、恢复只读投影及真实 CLI 恢复入口。
- `terminal.test.ts`：独立 PTY 进程覆盖默认问答、输入纠错、Esc/Ctrl+C、退出码 130、stdout 分离及无人值守开关。macOS/Linux 需 Python 3 标准库提供 PTY 驱动；Windows 跳过此组，不能据此宣称 Windows 终端已验证。

改变行为时增加能观察到用户保证的回归场景，避免只重复实现。历史格式样例使用 [contract-examples.json](../../tests/contract-examples.json)，新增工具能力后仍须保持旧合法样例通过。完整替代与完整吸收、基线冻结与首次归档来源、结构通过与语义 review 都要分别覆盖。

## 实际包验收

`pnpm --filter @hackycy/agent-notes build` 构建 standalone ESM CLI。在包目录执行 `pnpm pack --pack-destination <产物目录>`；prepack 会先构建。产物放仓库根已忽略的 `.cache/agent-notes-validation/` 或系统临时目录。

解压实际 tarball 到仓库外，保留其完整目录结构，再从仓库根运行：

```sh
pnpm --filter @hackycy/agent-notes test:bundle /absolute/extracted/package/dist/cli.mjs
pnpm --filter @hackycy/agent-notes test:install /absolute/path/to/package.tgz
```

`test:bundle` 可追加 Node 可执行文件路径，再追加另一版本的已解压 CLI 路径。它验证七集合、49 次转换、全部集合 A/B 双向切换、离线 runtime、stdin/JSON、生命周期、备份、冻结和 Git 换行转换；提供另一版本时验证工具版本切换，并逐字节检查 Notes、配置及 seal 保留。版本切换验收使用两份基于当前实现、版本号与至少一个真实资源增删不同的隔离包。

`test:install` 通过 `npm install --offline --ignore-scripts` 安装实际 tarball，运行真正的 npm bin；检查 npm 文档和运行资源完整，维护材料未入包，安装指南未进入 runtime；覆盖 generic/codex/claude-code 七集合、中英文模板、自定义 Notes 根、Git/普通目录、子目录调用与安装后的文档链接。两种 smoke 都清理自己的临时项目。

分发验收覆盖 `package.json` 的 Node 下限及 Node 24。`core.autocrlf=true` 的 Git clone 测试检查换行转换，不能代替 Windows 原生运行验证；报告实际平台。完整包应包含 runtime、两个 skill、模板、schema 和运行参考文档，维护指南、研究副本与缓存不进入包。

同类接入的改动面另运行 `pnpm exec tsx packages/agent-notes/tests/extension-smoke.ts <仓库外证据目录> <Node绝对路径>`。它仅在隔离源码的描述表追加 example-agent，构建并打包两个真实测试包，分别使用新 skill 根和共享根；解包后检查安装、集合撤出与真实 SIGKILL 后由安装 runtime 恢复。夹具不得污染正式 catalog；证据目录须不存在，构建使用仓库依赖，最终 CLI 在仓库外运行。

## 文档一致性

按[内容归属](design.md#文档内容与分发)选择文档位置。维护入口与 `docs/maintainers/` 可引用源码和测试；产品资源的本地链接在 `assets/` 内闭合，README 和安装指南的链接在 npm 包内闭合。检查源码链接后，还要检查安装后的链接，因为宿主 skill 的共享资源和专用资料位于不同目录。

改变资源布局时，使用当前实现的不同版本夹具验证替换；旧清单中的废弃资产被清理，普通管理先要求修复，repair 备份手改内容后恢复，未知邻接文件保留。Notes、项目配置与归档 seal 逐字节保持；已安装 runtime 仍能通过 repair 离线恢复宿主 skill；源文件损坏时完整同版本 npm 包能修复。

README 保持概览和参考性质；参数、契约、写入规则各有一个定义位置。清理文档时保留上游固定 commit，移除失效路径、重复 schema 和结束的讨论状态；不能以删文档掩盖真实契约差异。

当前接入模型的真实包、Node、容量和宿主证据见[实现验收记录](adapter-validation.md)。历史通过记录不替代未来改动的重跑。

# 维护验证

从仓库根执行命令；以实际脚本和本次改动为准，不把一次历史验收结果作为后续变更通过的依据。

## 按改动选择检查

| 改动 | 检查要求 |
| --- | --- |
| 维护文档 | `pnpm lint`、受影响的相对链接与锚点、`git diff --check` |
| TypeScript 或配置 | 上述检查，加 `pnpm exec tsc --noEmit` 与对应 Vitest 测试 |
| 格式、关系、历史保护或状态操作 | 包级测试，保留正反样例及历史格式兼容覆盖 |
| README、writing.md、contracts、skill、模板或安装布局 | 构建并打包，检查实际 tarball 与已安装项目的文档引用 |
| 分发、委派、升级或事务 | 包级测试，加仓库外 `test:bundle` 与 `test:install` |

包级测试命令为 `pnpm --filter @hackycy/agent-notes test`；单文件测试可在末尾传入 `tests/<name>.test.ts`。根 `pnpm test` 扫描 workspace 包。

## 行为覆盖

- `reader.test.ts`、`commands.test.ts`：契约样例、范围发现、路径与 symlink 边界、工作树/index/commit 隔离、关系与冻结基线。
- `workflow.test.ts`：草稿、expected_hash、身份保持、交付/拒绝、AST 引用修复、内容承接、条件清理与归档。
- `transaction.test.ts`：写失败回滚、真实子进程 SIGKILL、锁竞争、输入/runtime 并发变化、恢复冲突保留外部编辑。
- `distribution.test.ts`：单/双目标、静态导入复用、Git 忽略/属性、资产所有权、备份、重复安装、版本修复、升级与恢复。

改变行为时增加能观察到用户保证的回归场景，避免只重复实现。历史格式样例使用 [contract-examples.json](../tests/contract-examples.json)，新增工具能力后仍须保持旧合法样例通过。完整替代与完整吸收、基线冻结与首次归档来源、结构通过与语义 review 都要分别覆盖。

## 实际包验收

`pnpm --filter @hackycy/agent-notes build` 构建 standalone ESM CLI。在包目录执行 `pnpm pack --pack-destination <产物目录>`；prepack 会先构建。产物放仓库根已忽略的 `.cache/agent-notes-validation/` 或系统临时目录。

解压实际 tarball 到仓库外，保留其完整目录结构，再从仓库根运行：

```sh
pnpm --filter @hackycy/agent-notes test:bundle /absolute/extracted/package/dist/cli.mjs
pnpm --filter @hackycy/agent-notes test:install /absolute/path/to/package.tgz
```

`test:bundle` 可追加 Node 可执行文件路径，再追加另一版本的已解压 CLI 路径。它验证离线 runtime、stdin/JSON、生命周期、备份、冻结和 Git 换行转换；提供另一版本时验证升级与回退，并逐字节检查 Notes、配置及 seal 保留。使用隔离副本构造的另一版本只能证明版本切换机制，不能宣称跨真实历史发行版兼容。

`test:install` 通过 `npm install --offline --ignore-scripts` 安装实际 tarball，运行真正的 npm bin；覆盖 agents/claude 单目标、中英文模板、自定义 Notes 根、Git/普通目录、子目录调用与安装后的文档链接。两种 smoke 都清理自己的临时项目。

分发验收覆盖 `package.json` 的 Node 下限及 Node 24。`core.autocrlf=true` 的 Git clone 测试检查换行转换，不能代替 Windows 原生运行验证；报告实际平台。完整包应包含 runtime、两个 skill、模板、schema 和运行参考文档，维护指南、研究副本与缓存不进入包。

## 文档一致性

维护入口与 `docs/` 可引用源码和测试；运行文档只能相对链接到一同分发的文件。检查源码链接后，还要检查安装后的链接，因为 skill 在安装时会改写模板和写入说明的相对路径。

README 保持概览和参考性质；参数、契约、写入规则各有一个定义位置。清理文档时保留上游固定 commit，移除失效路径、重复 schema 和结束的讨论状态；不能以删文档掩盖真实契约差异。

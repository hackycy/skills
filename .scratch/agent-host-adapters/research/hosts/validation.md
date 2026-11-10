# 验证记录

- `pnpm lint`：2026-11-10 在独立 hosts worktree 完成，exit 0。首次运行自动补齐该 worktree 的 node_modules；simple-git-hooks 因 worktree 的 `.git` 是文件而提示 ENOTDIR，安装流程继续成功，ESLint exit 0。未修改 hooks 或产品源文件。
- 四个 Python runner 均通过 `ast.parse` / 最初 `py_compile` 语法检查。
- 70 个来源条目与 manifest 一一对应；64 个 HTTP 200、6 个 OpenAI 官方 URL SSL timeout；成功原始 body SHA256 全部重新计算一致。
- report 的 shortcut references 均有定义；本地 Markdown 链接目标全部存在；`git diff --check` 通过。
- `discover.py --cache /tmp/host-capabilities-portable-rerun/discovery` 重跑成功，OpenCode 与 Codex fixture 发现结果和首个有效隔离实验一致。重跑完整输出保存在该 /tmp cache，不覆盖主实验摘要。
- `PATH=/usr/bin:/bin /usr/bin/python3 discover.py --cache /tmp/host-capabilities-missing-tools/discovery`：缺少所有宿主 executable 时 graceful skip，exit 0。
- 本目录只有研究报告、来源与实验 runner，没有产品实现变更；未创建 PR、未合并分支。

全量原始输出见 report 引用的忽略 cache。`executable-manifest.json` 记录当前 binary/script 的 realpath、字节数和 SHA256；binary hash 不宣称对应本报告固定源码提交。

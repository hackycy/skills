# Notes 实验证据索引

先读 [report.md](report.md)。本目录只保存报告、脚本、摘要和补丁；产品代码已恢复到固定基线。分支 `research/host-adapters-notes` 是临时研究证据分支，不开 PR、不合并。

## 复跑限制

必须使用隔离 worktree，固定在 `f74deccc5991e0452b3cb83feba51fe1c6bb1c1c`；不要在 main 或日常开发 checkout 执行。`run.mjs synthetic` 会修改产品源码/package.json，并从 fixture 生成第三 target 测试。它不会自动清理，重复 synthetic 前须恢复基线。完整命令和清理范围见报告。

- [run.mjs](run.mjs)：baseline、strict、synthetic、compat 四阶段。默认原始产物位于调用仓库 `.cache/host-adapter-study/notes`；可用第三个命令行参数改原始产物目录，但后续阶段必须使用同一目录。
- [prepare-synthetic.py](prepare-synthetic.py)、[synthetic.patch](synthetic.patch)：七源码文件的具体变更；patch 为零上下文格式，直接应用需 git apply --unidiff-zero，通常使用脚本。虚构 study target，不代表真实宿主。
- [third-target.test.ts.fixture](third-target.test.ts.fixture)：五个新增测试场景。
- [recovery-child.mjs](recovery-child.mjs)：真实 SIGKILL 与 prepared journal 恢复反证。
- [surface.json](surface.json)：源码文件集合、基线/补丁 SHA-256、numstat、六文档核对清单。
- [baseline-results.json](baseline-results.json)、[strict-results.json](strict-results.json)、[synthetic-results.json](synthetic-results.json)、[compat-results.json](compat-results.json)、[supplemental-results.json](supplemental-results.json)：argv/cwd/退出码/结果与日志 hash。`synthetic-attempt1-results.json` 保留测试 stub 不完整的首次失败；不作为成功证据。

## 本轮原始日志位置

本机 worktree 为 `/Users/qigong-it-1/Workspace/skills/.cache/host-adapter-study/worktrees/notes`。其下 `.cache/host-adapter-study/notes` 保存 baseline/strict/compat 的 stdout、stderr、前后文件树、tarball、npm 安装树；`.cache/host-adapter-study/notes-attempt2` 保存成功 synthetic 构建/测试/打包日志。摘要 JSON 的 `environment.raw` 给出绝对路径；每条记录的 stdout/stderr/tree 文件名相对该目录。raw 不进入 Git，第三方可由固定版本脚本重新生成。

项目实验使用系统临时目录的 `agent-notes-host-adapter-study-<repo-hash>`，不在用户工程目录运行。脚本隔离 HOME/npm cache/Git 全局配置，不写宿主配置、不调用付费模型。基线和合成补丁下的补充全套测试由 shell 执行，未隔离 HOME，测试只写其临时 fixture；详见报告限制。

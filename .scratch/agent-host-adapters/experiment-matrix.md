# 实验矩阵与失败模式索引

环境与产物身份见 [baseline.json](baseline.json)。以下为真实产物/独立进程观察；源码解释和重跑前置条件由各调查报告持有。I-install、I-discovery 与 A-agent 分开，所有 A 仍未测。Impeccable 固定 bundle 由研究者以源码中的公钥独立验 Ed25519 envelope、size 与 ZIP hash 后作为 local override 交给 CLI；这不验证 CLI 远程下载/验签端到端链路。

## 安装、故障与恢复

| 条件 | agent-notes 0.3.0 | Impeccable npm4.8.2 / engine0.1.21 / skill4.8.2 | 记录与恢复命令 |
| --- | --- | --- | --- |
| 已有产物，禁止网络 | init/context/check 均0；双目标安装22文件 | local ZIP 与外置engine启动安装0、125文件，但stderr报自含engine获取失败；未物化时installed launcher 127 | [失败报告](research/failures/report.md)；`notes-init-offline`、`impeccable-init-offline-local-bundle` |
| 自含engine就绪后离线 | 项目锁定runtime直接执行，无版本查询 | 本地HTTP回放官方校验字节后新增两份engine；installed launcher engine-probe 离线0 | `impeccable-selfcontained-launcher-offline`；回放不是GitHub网络端到端验证 |
| 不支持的target/provider | `init --target cursor --no-interactive --json` →2/INVALID_INPUT，diff0 | `skills install --providers=not-a-host --yes --no-hooks` →1/Unknown provider(s)，diff0 | CLI拒绝层；与宿主不发现/不加载分开 |
| 普通缓存/源损坏 | 本地runtime源损坏repair →1/INVALID_BUNDLE，diff0；同版本完整npm包repair →0 | cache损坏离线127；坏engine下载回放checksum mismatch/127、不写cache；本地坏ZIP →1、project diff0 | `repair`保持版本/hash；Impeccable需重新取得校验字节 |
| 第二目标权限失败 | init →1，完整回滚，文件hash差异0 | install →1，留下63文件；解除拒绝后重跑补62文件，等于干净125文件 | macOS sandbox file-write拒绝；不是跨平台ACL测试 |
| 真实进程终止 | repair首个rename后SIGKILL，有journal；context →1/RECOVERY_REQUIRED | 杀shim/engine整个进程组，留下4文件，无journal；`--force`重跑补121文件 | [逐案原始记录](research/failures/results/summary.json) |
| 中断后外部编辑 | repair --recover →1/RECOVERY_CONFLICT，diff0；协调回端点后 →0/recovered:true | 本次无等价journal恢复接口 | 不删除journal或覆盖外部编辑 |
| 并发 | 活跃writer持锁，竞争repair →1/WRITE_BUSY，原writer继续0 | 4组同时force；一组1/0、三组0/0，失败为文件打开异常 | 无锁结论同时依据复制调用链；4组不估计失败概率 |
| 真实旧0.2安装升级0.3 | →2/INVALID_CONFIG，diff0；旧工具根与notes_dir不一致，未进入中断点 | 未比较其他CLI版本 | 不把预检拒绝写成升级恢复成功 |
| 原生跨平台 | Darwin arm64真实执行；当前基线测试含Git换行转换 | Darwin arm64真实执行；其他OS只有shim分支注入 | Linux/Windows/FreeBSD原生运行未验证 |

## 清单、第三目标与兼容性

| 实验 | 实际结果 | 证据与范围 |
| --- | --- | --- |
| 六种清单变体×两来源×四命令 | 48调用均零写入；unknown target/field/path →2/INVALID_INSTALLATION，format/2 →2/UNSUPPORTED_FORMAT；runtime upgrade更早PACKAGE_COMMAND_REQUIRED | [严格结果](research/notes/strict-results.json)、[报告](research/notes/report.md)；严格reader确实限制前向扩展 |
| manager委派哨兵 | 同步runtime hash并加未知target后，旧manager context拒绝且runtime marker不存在 | 不只是“源码看起来先读manifest” |
| 合成第三target study | 实改7源码文件、9具名函数、3定义位置；新增1测试文件5场景；282/282通过，真实打包安装成功 | [补丁](research/notes/synthetic.patch)；虚构静态host，不能推算任意宿主成本 |
| 漏掉恢复白名单 | prepared SIGKILL后旧distributionPath →RECOVERY_CONFLICT、零写入；恢复补丁后成功回到空树 | [兼容结果](research/notes/compat-results.json)；安装路径与恢复授权都要派生 |
| 旧0.3读取新runtime+旧targets | 日常context可以委派；repair版本不符；upgrade可降回0.3 | 新runtime本身不是前向兼容障碍 |
| 旧0.3读取新target（单/三目标） | status/context/upgrade/repair全在委派前2/INVALID_INSTALLATION | 新runtime不能修复旧manager parser |
| 真实0.1/0.2读取新自然布局 | status/upgrade等NOT_INSTALLED，context还会把新runtime文档当Note而INVALID_FRONTMATTER | 与各自原生布局上的严格parser实验分开，不能把布局缺失当新枚举错误 |
| 已安装项目增删targets | 重复init不同集合 →TARGET_CONFLICT；upgrade --target →INVALID_INPUT | “新增支持”不包含“原地变更集合” |

## 宿主发现与行为分层

| 层 | 本次实验 | 结果/不能推导的部分 |
| --- | --- | --- |
| 文件已安装 | 两CLI隔离项目树与hash diff | 只证明磁盘内容 |
| skill被发现 | Codex0.156.1 app-server initialize + skills/list；OpenCode1.18.29 debug skill | Codex发现P/U .agents及.codex；OpenCode发现P/U .opencode/.agents/.claude；[完整矩阵与摘要](research/hosts/report.md) |
| 入口加载协议（未实测入口加载） | 官方D与固定loader C | 只支持文档声明/实现语义；没有实际注入观察，不能把skill list当入口加载 |
| agent调用context/check | 未运行model turn | 全部A未验证；适配层不能承诺静态规则必然执行 |

## 第三方重跑

先读取每个runner的报告。安装研究依赖Node>=22.12、Git、pnpm锁定依赖；故障runner明确要求Darwin arm64与sandbox-exec。下载安装产物需要网络，随后run阶段可禁止网络。不得把foreign-platform preloader当作真实OS。

~~~sh
node .scratch/agent-host-adapters/research/failures/prepare.mjs /absolute/repository
node .scratch/agent-host-adapters/research/failures/run.mjs /absolute/repository /absolute/results/failures
python3 .scratch/agent-host-adapters/research/hosts/fetch.py --cache /absolute/cache/hosts/docs
python3 .scratch/agent-host-adapters/research/hosts/discover.py --cache /absolute/cache/hosts/discovery
python3 .scratch/agent-host-adapters/verify-research.py
~~~

第三目标runner会修改实验checkout，必须在固定基线的**可丢弃worktree**运行。先按[Notes调查](research/notes/report.md)安装冻结依赖，依次运行 `baseline`、`strict`、`synthetic`、`compat`；不能在含用户修改的工作树运行synthetic。没有产品实现被合入本次主工作区。

环境/argv/cwd/stdout/stderr/status、项目与HOME树hash/diff见各results文件；大binary/ZIP、原始网页及Notes逐次stdout在忽略cache，脚本和摘要附hash与定位。抓取live官方网页会形成新快照；固定源码与发布产物按commit/checksum拒绝漂移。未验证条件见[可证伪性](falsifiability.md)。

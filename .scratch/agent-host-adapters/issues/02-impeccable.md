# 两种 CLI 的安装适配与失败恢复边界

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: cli_failures
Parent: ../map.md
Blocked by: none

## Question

固定 Impeccable 4.8.2 commit、npm tarball 和发布二进制，追踪宿主适配、安装、缓存、平台选择；与 agent-notes 0.3.0 比较，复现实装树、离线、缓存损坏、部分升级/写入、并发、权限、跨平台分支与恢复。未知宿主须区分 CLI 拒绝、skill 不发现、入口不加载、agent 不调用；源码没有某机制时精确指出，不能仅从没找到测试推出不支持。

## Comments

## Answer

已完成 [两种 CLI 的安装适配与失败恢复边界](../research/failures/report.md)。证据分支 [research/host-adapters-failures](https://github.com/hackycy/skills/tree/research/host-adapters-failures)，提交 [4e68a73](https://github.com/hackycy/skills/commit/4e68a73)。未开 PR、未合并、未改产品实现。

- Impeccable 构建 Provider 表、installer alias/global-path、runtime Provider 是三个知识位置；真实 Devin/Replit 扩展分别改20/9文件。
- 固定npm4.8.2的engine为0.1.21；默认skill resolver不锁定4.8.2。本轮用已独立验签的4.8.2 ZIP。
- 实际125文件安装与ZIP字节hash一致；离线可安装skill但缺engine，安装成功不保证launcher可运行。物化已校验engine后两个宿主launcher离线通过。
- Impeccable权限拒绝留下63文件、SIGKILL留下4文件，并发有1/0竞态；重跑能补齐本例但没有Notes级journal恢复。
- Notes0.3离线init/context/check通过，权限回滚，活跃锁WRITE_BUSY，中断repair后RECOVERY_REQUIRED，外部编辑RECOVERY_CONFLICT且保留，再协调恢复成功。
- 真正0.2→0.3 upgrade预检因config所在根与notes_dir不一致而INVALID_CONFIG；不把它写成成功升级恢复。

包含固定URL/checksum prepare脚本、独立rerunnable harness、argv/cwd/env/stdout/stderr/status、前后hash树及diff。已从全新无缓存目录prepare+完整run通过；pnpm lint与四脚本语法通过。额外源码Vitest60秒超时，保留记录未宣称通过。Windows/Linux/FreeBSD只做选择分支观察；无付费模型、无真实agent发现/入口加载/context/check观察（A未验证）。

# Changelog

## Unreleased

- 新增 generic、codex、claude-code 完整接入集合；generic/codex 共享项目 skill，Claude 使用原生目录，共享 Notes 根与锁定 runtime。
- 管理命令改为 install、hosts set、tool update、repair、status；Note 的 update 保持独立。CLI 不再管理任何 AGENTS/CLAUDE 规则文件。
- 引入 source/1 精确源索引、install/2 完整收据和 transaction/2 双端恢复，保留未知内容、修复前完整备份并限制解析与恢复容量。
- 此次管理协议不兼容旧 init/upgrade/target、旧安装清单或旧 journal，不提供自动迁移；既有合法 Note 文档格式与归档冻结契约保持有效。

## 0.1.0
- 首次公开发布 Agent Notes CLI，提供工程决策记录的校验、发现、生命周期管理及安装升级。

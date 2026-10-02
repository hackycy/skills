# Archived Note 指令

本目录是冻结历史证据，不是当前 authority。

正常开发、格式化、翻译、链接清理和治理模板同步都不得编辑、重排、重命名、移动或删除 archived Note。每个 archived Note 必须在 `manifest.json` 中有 SHA-256 seal；seal 不匹配即视为历史被改写。

只允许通过 `.agents/scripts/archive_agent_note.py` 从 implemented 进入本目录。活跃文档如需表达当前规则，应链接到当前 authority；只有明确历史引用才指向 archive。archive 的出站链接允许随历史一起冻结，不要求持续修复。

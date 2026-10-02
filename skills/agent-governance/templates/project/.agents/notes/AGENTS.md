# Agent Note 指令

把这里当作“决策治理”，不要当作开发日志。

新建或修改 Note 前先读 `README.md`，并搜索活跃 Note 中与当前 Scope、决策、机制、所有权边界或被拒替代方案相关的记录。明确它是独立补充、重复 authority、部分替代还是完全替代。

不要保存 chain-of-thought、聊天过程或逐步试错。一个 implemented 决策如果反转，应创建新的 superseding Note 并建立关系，而不是把旧历史悄悄改写成相反结论。

不要手工编辑 archived Note，也不要手工把文件移动进 archive；归档必须经过 `archive_agent_note.py` 和 SHA-256 seal。

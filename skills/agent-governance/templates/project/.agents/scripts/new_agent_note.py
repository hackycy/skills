#!/usr/bin/env python3
"""从项目内模板创建单文件 Agent Note。仅使用 Python 标准库。"""
from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path

CLASSES = ("feature", "bug-fix", "simplification", "architecture", "process", "testing")
LIFECYCLES = ("proposed", "implemented", "rejected")



SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def main() -> int:
    p = argparse.ArgumentParser(description="创建单文件 Agent Note（默认简体中文正文）")
    p.add_argument("lifecycle", choices=LIFECYCLES, help="Note 生命周期")
    p.add_argument("note_class", choices=CLASSES, help="Note 分类")
    p.add_argument("title", help="Note 标题")
    p.add_argument("--root", default=".", help="仓库根目录")
    p.add_argument("--date", default=dt.date.today().isoformat(), help="首次提出日期 YYYY-MM-DD")
    p.add_argument("--slug", required=True, help="文件名 topic，使用英文 kebab-case")
    args = p.parse_args()

    try:
        dt.date.fromisoformat(args.date)
    except ValueError:
        p.error("--date 必须是 YYYY-MM-DD")

    slug = args.slug.strip().lower()
    if not SLUG.fullmatch(slug):
        p.error("--slug 必须是英文小写 kebab-case，只能包含 a-z、0-9 和连字符")

    root = Path(args.root).resolve()
    template = root / ".agents" / "skills" / "agent-note" / "templates" / f"{args.lifecycle}.md"
    if not template.exists():
        p.error(f"缺少模板：{template}")

    target_dir = root / ".agents" / "notes" / args.lifecycle / args.note_class
    target = target_dir / f"{args.date}-{slug}.md"
    if target.exists():
        p.error(f"目标 Note 已存在：{target}")

    text = template.read_text(encoding="utf-8").replace("{{TITLE}}", args.title.strip())
    target_dir.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")

    print("已创建 Agent Note：")
    print(f"  - {target}")
    print("下一步：先完成 supersession 检查，再填写真实决策内容，最后运行 verify_agent_notes.py。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

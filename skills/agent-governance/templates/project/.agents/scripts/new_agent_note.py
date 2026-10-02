#!/usr/bin/env python3
"""从项目内模板并发安全地创建单文件 Agent Note。仅使用 Python 标准库。"""
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
    target_dir.mkdir(parents=True, exist_ok=True)
    text = template.read_text(encoding="utf-8").replace("{{TITLE}}", args.title.strip())

    try:
        # mode='x' 使用 O_EXCL：多个 Agent 同时创建同名 Note 时只有一个能成功。
        with target.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
    except FileExistsError:
        p.error(f"目标 Note 已存在（可能由另一个 Agent 刚刚创建）：{target}")

    print("已创建 Agent Note：")
    print(f"  - {target}")
    print("该模板故意包含 REQUIRED 占位符；在完成 supersession 检查并填写真实内容前，治理校验会失败。")
    print("完成后运行：python3 .agents/scripts/governance_check.py --root .")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

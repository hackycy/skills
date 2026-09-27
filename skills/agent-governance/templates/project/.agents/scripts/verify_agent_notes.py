#!/usr/bin/env python3
"""校验项目 Agent Notes 的目录、生命周期和单文件结构。仅使用 Python 标准库。"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path

DEFAULT_CLASSES = ("feature", "bug-fix", "simplification", "architecture", "process", "testing")
LIFECYCLES = ("proposed", "implemented", "rejected", "archived")
FILENAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
H1 = re.compile(r"^#\s+Agent Note:\s+(.+?)\s*$", re.MULTILINE)
H2 = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
STATUS = re.compile(r"^Status:\s*(\S+)\s*$", re.MULTILINE)
ARCHIVED = re.compile(r"^Archived:\s*(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE)

REQUIRED = {
    "proposed": {"问题", "提案", "考虑过的替代方案", "验收标准", "风险"},
    "implemented": {"问题", "决策", "考虑过的替代方案", "后果", "验证"},
    "rejected": {"问题", "提案", "拒绝原因", "考虑过的替代方案"},
    "archived": {"问题", "决策", "考虑过的替代方案", "后果", "验证"},
}
FORBIDDEN = {
    "proposed": {"决策", "拒绝原因"},
    "implemented": {"提案", "计划", "迁移计划", "验收标准", "拒绝原因"},
    "rejected": {"决策", "验收标准"},
    "archived": {"提案", "计划", "迁移计划", "验收标准", "拒绝原因"},
}


def read_state(root: Path) -> dict:
    path = root / ".agents" / "framework.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def load_classes(state: dict) -> tuple[str, ...]:
    values = state.get("note_classes") or []
    return tuple(values) if values else DEFAULT_CLASSES


def valid_date(value: str) -> bool:
    try:
        dt.date.fromisoformat(value)
        return True
    except ValueError:
        return False


def verify_note(path: Path, root: Path, lifecycle: str) -> list[str]:
    rel = path.relative_to(root)
    errors: list[str] = []
    m = FILENAME.fullmatch(path.name)
    if not m:
        errors.append(f"{rel}: 文件名必须是 YYYY-MM-DD-english-kebab-case.md")
        return errors
    if not valid_date(m.group(1)):
        errors.append(f"{rel}: 文件名日期非法")

    text = path.read_text(encoding="utf-8")
    if not H1.search(text):
        errors.append(f"{rel}: 缺少 '# Agent Note: <标题>'")

    expected_status = "implemented" if lifecycle == "archived" else lifecycle
    sm = STATUS.search(text)
    if not sm or sm.group(1) != expected_status:
        errors.append(f"{rel}: Status 必须是 {expected_status}")

    headings = {x.strip() for x in H2.findall(text)}
    missing = REQUIRED[lifecycle] - headings
    forbidden = FORBIDDEN[lifecycle] & headings
    if missing:
        errors.append(f"{rel}: 缺少章节：{', '.join(sorted(missing))}")
    if forbidden:
        errors.append(f"{rel}: 当前生命周期不应出现章节：{', '.join(sorted(forbidden))}")

    if lifecycle == "archived":
        am = ARCHIVED.search(text)
        if not am or not valid_date(am.group(1)):
            errors.append(f"{rel}: archived Note 必须包含合法的 'Archived: YYYY-MM-DD'")

    return errors


def verify(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    notes = root / ".agents" / "notes"
    state = read_state(root)
    classes = load_classes(state)

    if not notes.exists():
        return ["缺少 .agents/notes"], []
    if (notes / "INDEX.md").exists():
        errors.append(".agents/notes/INDEX.md: 不允许集中式 Note 索引；直接按 lifecycle/class 浏览或搜索仓库")

    for lifecycle in LIFECYCLES:
        life_dir = notes / lifecycle
        if not life_dir.exists():
            errors.append(f"缺少生命周期目录：{life_dir.relative_to(root)}")
            continue

        for child in sorted(life_dir.iterdir()):
            if child.is_dir() and child.name not in classes:
                errors.append(f"{lifecycle}/ 下存在未知 Note class：{child.name}")
            elif child.is_file() and child.name != "AGENTS.md":
                errors.append(f"{child.relative_to(root)}: Note 必须位于 <lifecycle>/<class>/ 下")

        for cls in classes:
            class_dir = life_dir / cls
            if not class_dir.exists():
                errors.append(f"缺少分类目录：{class_dir.relative_to(root)}")
                continue
            for path in sorted(class_dir.iterdir()):
                if path.is_dir():
                    errors.append(f"{path.relative_to(root)}: class 目录下不允许额外子目录")
                    continue
                if path.name == ".gitkeep":
                    continue
                if path.suffix != ".md":
                    warnings.append(f"{path.relative_to(root)}: 非 .md 文件不参与单语 Note 校验")
                    continue
                errors.extend(verify_note(path, root, lifecycle))

    return errors, warnings


def main() -> int:
    p = argparse.ArgumentParser(description="校验单语 Agent Notes")
    p.add_argument("--root", default=".", help="仓库根目录")
    args = p.parse_args()
    root = Path(args.root).resolve()
    errors, warnings = verify(root)

    for item in warnings:
        print(f"WARNING: {item}")
    for item in errors:
        print(f"ERROR: {item}")
    if errors:
        print(f"Agent Note 校验失败：{len(errors)} 个错误，{len(warnings)} 个警告")
        return 1
    print(f"Agent Note 校验通过：{len(warnings)} 个警告")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

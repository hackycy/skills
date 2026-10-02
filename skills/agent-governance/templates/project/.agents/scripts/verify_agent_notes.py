#!/usr/bin/env python3
"""严格校验 Agent Notes：目录、格式、内容、关系、链接与归档 seal。

仅使用 Python 标准库。该文件既可作为 CLI，也可被 archive_agent_note.py 导入。
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit

CANONICAL_CLASSES = ("feature", "bug-fix", "simplification", "architecture", "process", "testing")
CANONICAL_LIFECYCLES = ("proposed", "implemented", "rejected", "archived")
ACTIVE_LIFECYCLES = ("proposed", "implemented", "rejected")
FILENAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
H1_RE = re.compile(r"^# Agent Note: \S.+$")
H2_RE = re.compile(r"^##\s+(.+?)\s*$")
STATUS_RE = re.compile(r"^Status:\s*(\S+)\s*$")
ARCHIVED_RE = re.compile(r"^Archived:\s*(\d{4}-\d{2}-\d{2})\s*$")
SCOPE_RE = re.compile(r"^Scope:\s*(\S.*?)\s*$")
RELATION_RE = re.compile(r"^(Supersedes|Related):\s*(.*?)\s*$")
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
PLACEHOLDER_LINE_RE = re.compile(r"^\s*(?:TODO|TBD|待补充|待填写|请填写)(?:[:：].*)?\s*$", re.MULTILINE)
SCOPE_VALUE_RE = re.compile(r"^(?:none|[a-z0-9][a-z0-9/_-]*)$")

REQUIRED_ORDER = {
    "proposed": ("问题", "提案", "考虑过的替代方案", "验收标准", "风险"),
    "implemented": ("问题", "决策", "考虑过的替代方案", "后果", "验证"),
    "rejected": ("问题", "提案", "拒绝原因", "考虑过的替代方案"),
    "archived": ("问题", "决策", "考虑过的替代方案", "后果", "验证"),
}
FORBIDDEN = {
    "proposed": {"决策", "拒绝原因"},
    "implemented": {"提案", "计划", "迁移计划", "验收标准", "拒绝原因"},
    "rejected": {"决策", "验收标准"},
    "archived": {"提案", "计划", "迁移计划", "验收标准", "拒绝原因"},
}
ROOT_ALLOWED = {"README.md", "AGENTS.md"}
LIFECYCLE_ALLOWED = {"AGENTS.md"}
ARCHIVE_ROOT_ALLOWED = {"AGENTS.md", "manifest.json"}


@dataclass(frozen=True)
class Heading:
    title: str
    line_index: int


@dataclass
class ParsedNote:
    path: Path
    lifecycle: str
    lines: list[str]
    prose_lines: list[tuple[int, str]]
    headings: list[Heading]
    sections: dict[str, str]
    status: str | None
    archived: str | None
    scope: str | None
    supersedes: list[str]
    related: list[str]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def valid_date(value: str) -> bool:
    try:
        dt.date.fromisoformat(value)
        return True
    except ValueError:
        return False


def read_state(root: Path) -> dict:
    path = root / ".agents" / "framework.json"
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {"__error__": f"无法解析 .agents/framework.json: {exc}"}
    return value if isinstance(value, dict) else {"__error__": ".agents/framework.json 必须是 JSON object"}


def strip_fences(lines: list[str]) -> list[tuple[int, str]]:
    """返回 fenced code block 之外的行，保留原始行号索引。"""
    result: list[tuple[int, str]] = []
    in_fence = False
    fence_char = ""
    fence_len = 0
    for idx, line in enumerate(lines):
        stripped = line.lstrip()
        m = re.match(r"^(`{3,}|~{3,})", stripped)
        if m:
            token = m.group(1)
            char = token[0]
            if not in_fence:
                in_fence = True
                fence_char = char
                fence_len = len(token)
            elif char == fence_char and len(token) >= fence_len:
                in_fence = False
                fence_char = ""
                fence_len = 0
            continue
        if not in_fence:
            result.append((idx, line))
    return result


def parse_relation_value(value: str) -> list[str]:
    value = value.strip()
    if not value or value == "none":
        return []
    return [x.strip() for x in value.split(",") if x.strip()]


def parse_note(path: Path, lifecycle: str) -> ParsedNote:
    lines = path.read_text(encoding="utf-8").splitlines()
    prose = strip_fences(lines)
    headings: list[Heading] = []
    for idx, line in prose:
        m = H2_RE.match(line)
        if m:
            headings.append(Heading(m.group(1).strip(), idx))

    sections: dict[str, str] = {}
    for pos, heading in enumerate(headings):
        end = headings[pos + 1].line_index if pos + 1 < len(headings) else len(lines)
        sections[heading.title] = "\n".join(lines[heading.line_index + 1 : end]).strip()

    status_values: list[str] = []
    archived_values: list[str] = []
    scope_values: list[str] = []
    relation_values: dict[str, list[str]] = {"Supersedes": [], "Related": []}
    for _idx, line in prose:
        if m := STATUS_RE.match(line):
            status_values.append(m.group(1))
        if m := ARCHIVED_RE.match(line):
            archived_values.append(m.group(1))
        if m := SCOPE_RE.match(line):
            scope_values.append(m.group(1).strip())
        if m := RELATION_RE.match(line):
            relation_values[m.group(1)].append(m.group(2).strip())

    def single(values: list[str]) -> str | None:
        return values[0] if len(values) == 1 else None

    return ParsedNote(
        path=path,
        lifecycle=lifecycle,
        lines=lines,
        prose_lines=prose,
        headings=headings,
        sections=sections,
        status=single(status_values),
        archived=single(archived_values),
        scope=single(scope_values),
        supersedes=parse_relation_value(single(relation_values["Supersedes"]) or ""),
        related=parse_relation_value(single(relation_values["Related"]) or ""),
    )


def has_placeholder(text: str) -> bool:
    return "<!-- REQUIRED:" in text or bool(PLACEHOLDER_LINE_RE.search(text))


def meaningful(text: str) -> bool:
    if has_placeholder(text):
        return False
    cleaned = HTML_COMMENT_RE.sub("", text)
    cleaned = re.sub(r"[`*_>#\-\[\]()]", "", cleaned)
    cleaned = re.sub(r"\s+", "", cleaned)
    return len(cleaned) >= 2


def header_errors(note: ParsedNote, rel: Path) -> list[str]:
    errors: list[str] = []
    lines = note.lines
    if not lines or not H1_RE.match(lines[0]):
        errors.append(f"{rel}: 第 1 行必须是 '# Agent Note: <标题>'")
    if len(lines) < 2 or lines[1] != "":
        errors.append(f"{rel}: 第 2 行必须为空行")

    expected_status = "implemented" if note.lifecycle == "archived" else note.lifecycle
    if len(lines) < 3 or lines[2] != f"Status: {expected_status}":
        errors.append(f"{rel}: 第 3 行必须精确为 'Status: {expected_status}'")

    # Metadata block: active note starts at line 4; archive adds Archived line first.
    cursor = 3
    if note.lifecycle == "archived":
        if len(lines) <= cursor or not ARCHIVED_RE.match(lines[cursor]):
            errors.append(f"{rel}: archived Note 必须在 Status 下一行包含 'Archived: YYYY-MM-DD'")
        cursor += 1

    # Optional metadata lines are contiguous and in canonical order.
    metadata_order = ("Scope:", "Supersedes:", "Related:")
    seen_meta: list[str] = []
    while cursor < len(lines) and lines[cursor] != "":
        if any(lines[cursor].startswith(prefix) for prefix in metadata_order):
            seen_meta.append(lines[cursor].split(":", 1)[0] + ":")
            cursor += 1
            continue
        errors.append(f"{rel}: header metadata 只允许 Scope/Supersedes/Related，且后面必须有空行")
        break
    if cursor >= len(lines) or lines[cursor] != "":
        errors.append(f"{rel}: header metadata 后必须有一个空行")
    canonical_seen = [x for x in metadata_order if x in seen_meta]
    if seen_meta != canonical_seen or len(seen_meta) != len(set(seen_meta)):
        errors.append(f"{rel}: header metadata 必须按 Scope → Supersedes → Related 排列，且每项最多一次")

    prose_only = [line for _idx, line in note.prose_lines]
    status_count = sum(1 for line in prose_only if STATUS_RE.match(line))
    archived_count = sum(1 for line in prose_only if ARCHIVED_RE.match(line))
    scope_count = sum(1 for line in prose_only if SCOPE_RE.match(line))
    relation_counts = {
        key: sum(1 for line in prose_only if line.startswith(key + ":")) for key in ("Supersedes", "Related")
    }
    if status_count != 1:
        errors.append(f"{rel}: Status 行必须且只能出现一次")
    if note.lifecycle == "archived":
        if archived_count != 1 or note.archived is None or not valid_date(note.archived):
            errors.append(f"{rel}: Archived 行必须且只能出现一次，并使用合法 YYYY-MM-DD")
    elif archived_count:
        errors.append(f"{rel}: 非 archived Note 不允许出现 Archived 行")
    if scope_count > 1:
        errors.append(f"{rel}: Scope 最多出现一次")
    for key, count in relation_counts.items():
        if count > 1:
            errors.append(f"{rel}: {key} 最多出现一次")
    if note.scope is not None and not SCOPE_VALUE_RE.fullmatch(note.scope):
        errors.append(f"{rel}: Scope 必须是 'none' 或英文稳定 scope（a-z0-9/_-）")
    return errors


def resolve_relation(root: Path, value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate
    return (root / candidate).resolve()


def relation_errors(note: ParsedNote, root: Path, rel: Path) -> list[str]:
    errors: list[str] = []
    self_path = note.path.resolve()
    notes_root = (root / ".agents" / "notes").resolve()
    for key, values in (("Supersedes", note.supersedes), ("Related", note.related)):
        for value in values:
            target = resolve_relation(root, value)
            try:
                target.relative_to(notes_root)
            except ValueError:
                errors.append(f"{rel}: {key} 只能引用 .agents/notes/ 内的 repo-relative 路径：{value}")
                continue
            if target == self_path:
                errors.append(f"{rel}: {key} 不允许引用自身")
            elif not target.exists():
                errors.append(f"{rel}: {key} 引用不存在：{value}")
            elif target.suffix != ".md":
                errors.append(f"{rel}: {key} 必须指向 .md Note：{value}")
    return errors


def extract_markdown_targets(note: ParsedNote) -> list[str]:
    targets: list[str] = []
    for _idx, line in note.prose_lines:
        for raw in LINK_RE.findall(line):
            raw = raw.strip()
            if raw.startswith("<") and ">" in raw:
                raw = raw[1 : raw.index(">")]
            else:
                # Markdown optional title: path "title"
                raw = raw.split(maxsplit=1)[0]
            targets.append(raw)
    return targets


def markdown_link_errors(note: ParsedNote, root: Path, rel: Path) -> list[str]:
    errors: list[str] = []
    for raw in extract_markdown_targets(note):
        if raw.startswith("#"):
            continue
        parsed = urlsplit(raw)
        if parsed.scheme or raw.startswith("//"):
            continue
        path_part = unquote(parsed.path)
        if not path_part:
            continue
        target = (note.path.parent / path_part).resolve()
        if not target.exists():
            errors.append(f"{rel}: Markdown 相对链接不存在：{raw}")
    return errors


def verify_note(path: Path, root: Path, lifecycle: str) -> list[str]:
    rel = path.relative_to(root)
    errors: list[str] = []
    m = FILENAME.fullmatch(path.name)
    if not m:
        return [f"{rel}: 文件名必须是 YYYY-MM-DD-english-kebab-case.md"]
    if not valid_date(m.group(1)):
        errors.append(f"{rel}: 文件名日期非法")

    note = parse_note(path, lifecycle)
    errors.extend(header_errors(note, rel))

    titles = [h.title for h in note.headings]
    if not titles or titles[0] != "问题":
        errors.append(f"{rel}: 第一个 H2 必须是 '## 问题'")
    duplicates = sorted({x for x in titles if titles.count(x) > 1})
    if duplicates:
        errors.append(f"{rel}: H2 章节标题不得重复：{', '.join(duplicates)}")

    required = REQUIRED_ORDER[lifecycle]
    missing = [name for name in required if name not in titles]
    if missing:
        errors.append(f"{rel}: 缺少章节：{', '.join(missing)}")
    forbidden = [name for name in titles if name in FORBIDDEN[lifecycle]]
    if forbidden:
        errors.append(f"{rel}: 当前生命周期不应出现章节：{', '.join(sorted(set(forbidden)))}")

    positions = [titles.index(name) for name in required if name in titles]
    if positions != sorted(positions):
        errors.append(f"{rel}: 必需章节顺序错误，应为：{' → '.join(required)}")

    for name in required:
        if name in note.sections and not meaningful(note.sections[name]):
            errors.append(f"{rel}: '## {name}' 仍为空、仅含占位符或内容不足")

    if has_placeholder(path.read_text(encoding="utf-8")):
        errors.append(f"{rel}: Note 中仍存在模板占位符（REQUIRED 或独占 TODO/TBD/待补充行）")

    errors.extend(relation_errors(note, root, rel))
    # Frozen archive is allowed to contain stale outbound links; active notes are not.
    if lifecycle != "archived":
        errors.extend(markdown_link_errors(note, root, rel))
    return errors


def load_archive_manifest(root: Path) -> tuple[dict, list[str]]:
    path = root / ".agents" / "notes" / "archived" / "manifest.json"
    errors: list[str] = []
    if not path.exists():
        return {}, [".agents/notes/archived/manifest.json: 缺少归档 seal manifest"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {}, [f".agents/notes/archived/manifest.json: JSON 非法：{exc}"]
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("files"), dict):
        errors.append(".agents/notes/archived/manifest.json: 必须是 {version: 1, files: {...}}")
    return data if isinstance(data, dict) else {}, errors


def verify_archive(root: Path, classes: tuple[str, ...]) -> list[str]:
    errors: list[str] = []
    archive_root = root / ".agents" / "notes" / "archived"
    manifest, manifest_errors = load_archive_manifest(root)
    errors.extend(manifest_errors)
    files = manifest.get("files", {}) if isinstance(manifest.get("files"), dict) else {}

    actual: dict[str, Path] = {}
    for cls in classes:
        class_dir = archive_root / cls
        if not class_dir.exists():
            continue
        for path in class_dir.glob("*.md"):
            actual[f"{cls}/{path.name}"] = path

    for rel, path in sorted(actual.items()):
        entry = files.get(rel)
        if not isinstance(entry, dict):
            errors.append(f".agents/notes/archived/{rel}: 未在 manifest 中封存")
            continue
        expected_sha = entry.get("sha256")
        if not isinstance(expected_sha, str) or sha256_file(path) != expected_sha:
            errors.append(f".agents/notes/archived/{rel}: SHA-256 与 seal manifest 不一致，历史记录被改写")
        note = parse_note(path, "archived")
        if entry.get("archived") != note.archived:
            errors.append(f".agents/notes/archived/{rel}: manifest archived 日期与 Note 不一致")
        source = entry.get("source")
        if not isinstance(source, str) or not source.startswith("implemented/"):
            errors.append(f".agents/notes/archived/{rel}: manifest source 必须记录原 implemented 路径")

    for rel, entry in sorted(files.items()):
        if rel not in actual:
            errors.append(f".agents/notes/archived/manifest.json: seal 指向不存在的文件：{rel}")
        parts = Path(rel).parts
        if len(parts) != 2 or parts[0] not in classes or not FILENAME.fullmatch(parts[1]):
            errors.append(f".agents/notes/archived/manifest.json: 非法归档路径：{rel}")
        if not isinstance(entry, dict):
            errors.append(f".agents/notes/archived/manifest.json: {rel} 条目必须是 object")
    return errors


def verify_tree(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    notes = root / ".agents" / "notes"
    state = read_state(root)
    if state.get("__error__"):
        errors.append(state["__error__"])
    state_classes = tuple(state.get("note_classes") or CANONICAL_CLASSES)
    state_lifecycles = tuple(state.get("note_lifecycles") or CANONICAL_LIFECYCLES)
    if state_classes != CANONICAL_CLASSES:
        errors.append(".agents/framework.json: note_classes 与治理框架封闭 taxonomy 不一致")
    if state_lifecycles != CANONICAL_LIFECYCLES:
        errors.append(".agents/framework.json: note_lifecycles 与治理框架封闭 lifecycle 不一致")
    classes = CANONICAL_CLASSES

    if not notes.exists():
        return ["缺少 .agents/notes"], warnings
    if (notes / "INDEX.md").exists():
        errors.append(".agents/notes/INDEX.md: 不允许集中式 Note 索引；直接按 lifecycle/class 浏览或搜索仓库")

    for child in notes.iterdir():
        if child.is_dir() and child.name not in CANONICAL_LIFECYCLES:
            errors.append(f".agents/notes/{child.name}: 未知 lifecycle 目录")
        elif child.is_file() and child.name not in ROOT_ALLOWED:
            errors.append(f"{child.relative_to(root)}: notes 根目录存在未允许文件")

    for lifecycle in CANONICAL_LIFECYCLES:
        life_dir = notes / lifecycle
        if not life_dir.exists():
            errors.append(f"缺少生命周期目录：{life_dir.relative_to(root)}")
            continue
        allowed = ARCHIVE_ROOT_ALLOWED if lifecycle == "archived" else LIFECYCLE_ALLOWED
        for child in sorted(life_dir.iterdir()):
            if child.is_dir() and child.name not in classes:
                errors.append(f"{lifecycle}/ 下存在未知 Note class：{child.name}")
            elif child.is_file() and child.name not in allowed:
                errors.append(f"{child.relative_to(root)}: lifecycle 根目录存在未允许文件")
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
                    errors.append(f"{path.relative_to(root)}: class 目录只允许 Agent Note .md 文件")
                    continue
                errors.extend(verify_note(path, root, lifecycle))

    errors.extend(verify_archive(root, classes))
    return errors, warnings


def reference_targets(path: Path, root: Path, lifecycle: str) -> set[Path]:
    """返回一个 active Note 对其他 Note 的结构化或 Markdown 引用目标。"""
    note = parse_note(path, lifecycle)
    targets: set[Path] = set()
    for raw in [*note.supersedes, *note.related]:
        targets.add(resolve_relation(root, raw))
    for raw in extract_markdown_targets(note):
        parsed = urlsplit(raw)
        if raw.startswith("#") or parsed.scheme or raw.startswith("//") or not parsed.path:
            continue
        targets.add((path.parent / unquote(parsed.path)).resolve())
    return targets


def find_active_inbound_references(root: Path, target: Path) -> list[Path]:
    result: list[Path] = []
    notes_root = root / ".agents" / "notes"
    target = target.resolve()
    for lifecycle in ACTIVE_LIFECYCLES:
        life = notes_root / lifecycle
        if not life.exists():
            continue
        for path in life.glob("*/*.md"):
            if path.resolve() == target:
                continue
            if target in reference_targets(path, root, lifecycle):
                result.append(path)
    return sorted(result)


def main() -> int:
    p = argparse.ArgumentParser(description="严格校验单语 Agent Notes、关系、链接和归档 seal")
    p.add_argument("--root", default=".", help="仓库根目录")
    p.add_argument("--json", action="store_true", help="输出 JSON")
    args = p.parse_args()
    root = Path(args.root).resolve()
    errors, warnings = verify_tree(root)
    if args.json:
        print(json.dumps({"ok": not errors, "errors": errors, "warnings": warnings}, indent=2, ensure_ascii=False))
    else:
        for item in warnings:
            print(f"WARNING: {item}")
        for item in errors:
            print(f"ERROR: {item}")
        if errors:
            print(f"Agent Note 校验失败：{len(errors)} 个错误，{len(warnings)} 个警告")
        else:
            print(f"Agent Note 校验通过：{len(warnings)} 个警告")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

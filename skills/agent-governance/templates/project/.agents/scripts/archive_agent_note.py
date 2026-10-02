#!/usr/bin/env python3
"""将 implemented Agent Note 归档并写入不可变 SHA-256 seal manifest。"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

from verify_agent_notes import (
    CANONICAL_CLASSES,
    find_active_inbound_references,
    parse_note,
    sha256_bytes,
    sha256_file,
    verify_archive,
    verify_note,
)


class ArchiveError(RuntimeError):
    pass


@contextmanager
def maintenance_lock(root: Path):
    lock = root / ".agents" / ".governance" / "locks" / "agent-note-maintenance.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise ArchiveError(
            f"治理维护锁已存在：{lock.relative_to(root)}；确认没有其他 Agent 正在归档/维护后再处理该锁"
        ) from exc
    try:
        os.write(fd, f"pid={os.getpid()}\n".encode())
        os.close(fd)
        yield
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        try:
            Path(tmp).unlink()
        except FileNotFoundError:
            pass


def archived_text(source_text: str, archive_date: str) -> str:
    lines = source_text.splitlines()
    if len(lines) < 4 or lines[2] != "Status: implemented":
        raise ArchiveError("源 Note 不是规范的 implemented header")
    if lines[3].startswith("Archived:"):
        raise ArchiveError("源 Note 已包含 Archived 行，不能从 implemented 再次归档")
    lines.insert(3, f"Archived: {archive_date}")
    return "\n".join(lines) + ("\n" if source_text.endswith("\n") else "")


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "files": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ArchiveError(f"归档 manifest JSON 非法：{exc}") from exc
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("files"), dict):
        raise ArchiveError("归档 manifest 必须是 {version: 1, files: {...}}")
    return data


def main() -> int:
    p = argparse.ArgumentParser(description="归档 implemented Agent Note，并写入不可变 hash seal")
    p.add_argument("note", help="implemented Note 路径（repo-relative 或 absolute）")
    p.add_argument("--root", default=".", help="仓库根目录")
    p.add_argument("--date", default=dt.date.today().isoformat(), help="归档日期 YYYY-MM-DD")
    args = p.parse_args()
    root = Path(args.root).resolve()
    try:
        dt.date.fromisoformat(args.date)
    except ValueError as exc:
        p.error("--date 必须是 YYYY-MM-DD")
        raise AssertionError from exc

    raw = Path(args.note)
    source = raw.resolve() if raw.is_absolute() else (root / raw).resolve()
    notes_root = root / ".agents" / "notes"
    try:
        rel = source.relative_to(notes_root)
    except ValueError as exc:
        raise ArchiveError("Note 必须位于 .agents/notes/ 下") from exc
    parts = rel.parts
    if len(parts) != 3 or parts[0] != "implemented" or parts[1] not in CANONICAL_CLASSES:
        raise ArchiveError("只能归档 .agents/notes/implemented/<class>/ 下的 Note")
    if not source.exists():
        raise ArchiveError(f"源 Note 不存在：{source}")

    note_class, filename = parts[1], parts[2]
    destination = notes_root / "archived" / note_class / filename
    manifest_path = notes_root / "archived" / "manifest.json"

    with maintenance_lock(root):
        existing_archive_errors = verify_archive(root, CANONICAL_CLASSES)
        # 允许本次目标处于“上次崩溃留下的未 seal 状态”，其他 archive 错误仍阻止继续。
        target_marker = f".agents/notes/archived/{note_class}/{filename}"
        filtered = [e for e in existing_archive_errors if target_marker not in e]
        if filtered:
            raise ArchiveError("现有 archive 已不健康，先修复后再归档：\n- " + "\n- ".join(filtered))

        source_errors = verify_note(source, root, "implemented")
        if source_errors:
            raise ArchiveError("源 Note 未通过 implemented 校验：\n- " + "\n- ".join(source_errors))

        inbound = find_active_inbound_references(root, source)
        if inbound:
            pretty = "\n- ".join(str(x.relative_to(root)) for x in inbound)
            raise ArchiveError(
                "仍有活跃 Note 引用该 implemented Note。先把这些引用改到当前 authority 或明确的历史目标，再归档：\n- " + pretty
            )

        source_text = source.read_text(encoding="utf-8")
        archive_date = args.date
        if destination.exists():
            # 支持前一次进程在 target/manifest/source 三步之间中断后的安全重试。
            parsed_existing = parse_note(destination, "archived")
            if parsed_existing.archived:
                archive_date = parsed_existing.archived
        desired = archived_text(source_text, archive_date)
        desired_bytes = desired.encode("utf-8")
        desired_sha = sha256_bytes(desired_bytes)

        if destination.exists() and destination.read_bytes() != desired_bytes:
            raise ArchiveError(f"归档目标已存在且内容与本次归档不一致：{destination.relative_to(root)}")
        if not destination.exists():
            atomic_write(destination, desired)

        manifest = load_manifest(manifest_path)
        key = f"{note_class}/{filename}"
        entry = manifest["files"].get(key)
        expected_entry = {
            "sha256": desired_sha,
            "archived": archive_date,
            "source": f"implemented/{note_class}/{filename}",
        }
        if entry is not None and entry != expected_entry:
            raise ArchiveError(f"manifest 已存在冲突 seal：{key}")
        manifest["files"][key] = expected_entry
        rendered = json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
        atomic_write(manifest_path, rendered)

        # manifest 已持久化后才移除 active source；中途崩溃时重跑可完成收尾。
        source.unlink()

        if sha256_file(destination) != desired_sha:
            raise ArchiveError("归档后 SHA-256 自检失败")

    print("Agent Note 已归档并封存：")
    print(f"  source: {rel}")
    print(f"  archive: {destination.relative_to(root)}")
    print(f"  sha256: {desired_sha}")
    print("后续任何 archived 正文修改都会使治理校验失败。")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ArchiveError as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(2)

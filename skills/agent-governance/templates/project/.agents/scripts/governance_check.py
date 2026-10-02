#!/usr/bin/env python3
"""项目内统一治理检查入口，适合本地和 CI。"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from verify_agent_notes import CANONICAL_CLASSES, CANONICAL_LIFECYCLES, verify_tree

BEGIN = "<!-- agent-governance:begin -->"
END = "<!-- agent-governance:end -->"


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_text(text: str) -> str:
    return sha_bytes(text.encode("utf-8"))


def extract_block(text: str) -> str | None:
    start = text.find(BEGIN)
    if start < 0:
        return None
    end = text.find(END, start)
    if end < 0:
        return None
    end += len(END)
    if text[end : end + 1] == "\n":
        end += 1
    return text[start:end]


def check_framework(root: Path) -> tuple[list[str], list[str], list[str]]:
    """返回 broken, conflicted, sync_warnings。"""
    broken: list[str] = []
    conflicted: list[str] = []
    sync_warnings: list[str] = []
    state_path = root / ".agents" / "framework.json"
    if not state_path.exists():
        return ["缺少 .agents/framework.json；项目未安装 agent-governance"], [], []
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return [f".agents/framework.json 无法解析：{exc}"], [], []

    if tuple(state.get("note_classes") or ()) != CANONICAL_CLASSES:
        broken.append("framework.json note_classes 与 canonical taxonomy 不一致")
    if tuple(state.get("note_lifecycles") or ()) != CANONICAL_LIFECYCLES:
        broken.append("framework.json note_lifecycles 与 canonical lifecycle 不一致")

    for rel, entry in state.get("managed_files", {}).items():
        ownership = entry.get("ownership", "framework-managed")
        target = root / rel
        if ownership == "framework-managed":
            if not target.exists():
                broken.append(f"缺少 framework-managed 文件：{rel}")
                continue
            baseline = entry.get("baseline_sha256")
            if not baseline or sha_bytes(target.read_bytes()) != baseline:
                conflicted.append(f"framework-managed 文件存在未决本地修改：{rel}")
        elif ownership == "adopted-local":
            conflicted.append(f"仍未决议 adopted-local 文件：{rel}")
        elif ownership == "project-override":
            if not target.exists():
                broken.append(f"project-override 文件缺失：{rel}")
        elif ownership == "project-owned":
            if not target.exists():
                broken.append(f"project-owned 文件缺失：{rel}")
        elif ownership == "detached":
            continue
        else:
            broken.append(f"未知 ownership {ownership!r}: {rel}")

    for block_id, entry in state.get("managed_blocks", {}).items():
        ownership = entry.get("ownership", "framework-managed")
        target = root / entry.get("target", "")
        if ownership == "framework-managed":
            if not target.exists():
                broken.append(f"缺少 framework-managed block host：{entry.get('target')}#{block_id}")
                continue
            current = extract_block(target.read_text(encoding="utf-8"))
            baseline = entry.get("baseline_sha256")
            if current is None:
                broken.append(f"缺少 framework-managed block：{entry.get('target')}#{block_id}")
            elif not baseline or sha_text(current) != baseline:
                conflicted.append(f"framework-managed block 存在未决本地修改：{entry.get('target')}#{block_id}")
        elif ownership == "adopted-local":
            conflicted.append(f"仍未决议 adopted-local block：{entry.get('target')}#{block_id}")
        elif ownership == "project-override":
            if current is None:
                broken.append(f"project-override managed block 缺失：{entry.get('target')}#{block_id}")
        elif ownership == "detached":
            continue
        else:
            broken.append(f"未知 block ownership {ownership!r}: {block_id}")

    for item in state.get("pending_conflicts", []):
        if f"pending conflict: {item}" not in conflicted:
            conflicted.append(f"pending conflict: {item}")
    for item in state.get("available_updates", []):
        sync_warnings.append(f"project override 有新 framework 候选：{item}")
    for item in state.get("orphaned_managed_paths", []):
        sync_warnings.append(f"存在已从当前 manifest 移除的旧托管路径：{item}")
    return broken, conflicted, sync_warnings


def main() -> int:
    p = argparse.ArgumentParser(description="运行项目 Agent 治理统一检查")
    p.add_argument("--root", default=".", help="仓库根目录")
    p.add_argument("--json", action="store_true")
    p.add_argument("--strict-sync", action="store_true", help="把 sync-needed 警告也视为失败")
    args = p.parse_args()
    root = Path(args.root).resolve()

    note_errors, note_warnings = verify_tree(root)
    broken, conflicted, sync_warnings = check_framework(root)
    broken.extend(note_errors)
    warnings = [*note_warnings, *sync_warnings]

    if broken:
        health = "broken"
        code = 1
    elif conflicted:
        health = "conflicted"
        code = 4
    elif sync_warnings:
        health = "sync-needed"
        code = 3 if args.strict_sync else 0
    else:
        health = "healthy"
        code = 0

    payload = {
        "health": health,
        "broken": broken,
        "conflicted": conflicted,
        "warnings": warnings,
    }
    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(f"Agent Governance: {health}")
        for item in broken:
            print(f"ERROR: {item}")
        for item in conflicted:
            print(f"CONFLICT: {item}")
        for item in warnings:
            print(f"WARNING: {item}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())

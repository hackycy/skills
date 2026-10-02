#!/usr/bin/env python3
"""验证 agent-governance bundle 完整性、manifest source 和 PACKAGE_SHA256S。"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKSUMS = ROOT / "PACKAGE_SHA256S.txt"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def actual_files() -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path == CHECKSUMS or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        rel = "./" + path.relative_to(ROOT).as_posix()
        result[rel] = sha(path)
    return result


def expected_files() -> dict[str, str]:
    if not CHECKSUMS.exists():
        return {}
    result: dict[str, str] = {}
    for line in CHECKSUMS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, rel = line.split(None, 1)
        result[rel.strip()] = digest
    return result


def main() -> int:
    errors: list[str] = []
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    manifest = json.loads((ROOT / "templates/manifest.json").read_text(encoding="utf-8"))
    if str(manifest.get("framework", {}).get("version", "")) != version:
        errors.append("VERSION 与 templates/manifest.json framework.version 不一致")

    for spec in manifest.get("files", []):
        source = ROOT / "templates" / spec["source"]
        if not source.is_file():
            errors.append(f"manifest source 不存在：{spec['source']}")
    for spec in manifest.get("managed_blocks", []):
        source = ROOT / "templates" / spec["source"]
        if not source.is_file():
            errors.append(f"managed block source 不存在：{spec['source']}")

    actual = actual_files()
    expected = expected_files()
    for rel in sorted(set(actual) - set(expected)):
        errors.append(f"PACKAGE_SHA256S 缺少文件：{rel}")
    for rel in sorted(set(expected) - set(actual)):
        errors.append(f"PACKAGE_SHA256S 指向不存在文件：{rel}")
    for rel in sorted(set(actual) & set(expected)):
        if actual[rel] != expected[rel]:
            errors.append(f"PACKAGE_SHA256S hash 不匹配：{rel}")

    if errors:
        for item in errors:
            print(f"ERROR: {item}")
        print(f"package verification failed: {len(errors)} error(s)")
        return 1
    print(f"package verification passed: {len(actual)} file(s) sealed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

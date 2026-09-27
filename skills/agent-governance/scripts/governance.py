#!/usr/bin/env python3
"""Agent 工程治理框架管理器。

仅依赖 Python 标准库。Skill bundle 是治理模板源；每个项目安装一份本地治理框架，
并用 .agents/framework.json 保存 ownership 与 baseline hash，以支持安全同步当前模板。
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = SKILL_ROOT / "templates" / "manifest.json"
STATE_REL = Path(".agents/framework.json")
BEGIN = "<!-- agent-governance:begin -->"
END = "<!-- agent-governance:end -->"


class GovernanceError(RuntimeError):
    pass


@dataclass
class OperationResult:
    changed: list[str]
    preserved: list[str]
    conflicts: list[str]
    warnings: list[str]

    @classmethod
    def empty(cls) -> "OperationResult":
        return cls([], [], [], [])


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise GovernanceError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GovernanceError(f"invalid JSON: {path}: {exc}") from exc


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_manifest() -> dict[str, Any]:
    manifest = read_json(MANIFEST_PATH)
    version_path = SKILL_ROOT / "VERSION"
    bundle_version = version_path.read_text(encoding="utf-8").strip()
    manifest_version = str(manifest.get("framework", {}).get("version", ""))
    if not bundle_version or bundle_version != manifest_version:
        raise GovernanceError(
            f"bundle VERSION ({bundle_version!r}) does not match manifest framework.version ({manifest_version!r})"
        )
    return manifest


def variables(project_root: Path, manifest: dict[str, Any]) -> dict[str, str]:
    fw = manifest["framework"]
    return {
        "PROJECT_NAME": project_root.name,
        "FRAMEWORK_VERSION": str(fw["version"]),
    }


def render(text: str, values: dict[str, str]) -> str:
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def template_text(source: str, values: dict[str, str]) -> str:
    path = SKILL_ROOT / "templates" / source
    if not path.exists():
        raise GovernanceError(f"manifest source does not exist: {path}")
    return render(path.read_text(encoding="utf-8"), values)


def framework_state(project_root: Path) -> dict[str, Any] | None:
    path = project_root / STATE_REL
    return read_json(path) if path.exists() else None


def extract_block(text: str) -> str | None:
    start = text.find(BEGIN)
    if start < 0:
        return None
    end = text.find(END, start)
    if end < 0:
        raise GovernanceError(f"found {BEGIN!r} without matching {END!r}")
    end += len(END)
    return text[start:end] + ("\n" if text[end:end+1] == "\n" else "")


def replace_block(host: str, new_block: str) -> str:
    current = extract_block(host)
    if current is None:
        suffix = "" if not host or host.endswith("\n") else "\n"
        gap = "" if not host else "\n"
        return host + suffix + gap + new_block.rstrip("\n") + "\n"
    start = host.find(BEGIN)
    end = host.find(END, start) + len(END)
    if host[end:end+1] == "\n":
        end += 1
    return host[:start] + new_block.rstrip("\n") + "\n" + host[end:]


def incoming_path(project_root: Path, target: str, block: bool = False) -> Path:
    rel = Path(target)
    base = project_root / ".agents" / ".governance" / "incoming" / "current" / rel
    if block:
        base = base.with_name(base.name + ".block.incoming")
    else:
        base = base.with_name(base.name + ".incoming")
    return base


def write_incoming(project_root: Path, target: str, content: str, *, block: bool = False) -> Path:
    path = incoming_path(project_root, target, block=block)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def state_skeleton(project_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    fw = manifest["framework"]
    return {
        "framework": fw["name"],
        "installed_version": fw["version"],
        "installed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "project_name": project_root.name,
        "note_classes": manifest["note_classes"],
        "note_lifecycles": manifest["note_lifecycles"],
        "notes": manifest.get("notes", {"language": "zh-CN", "mode": "single-file"}),
        "managed_files": {},
        "managed_blocks": {},
        "pending_conflicts": [],
        "orphaned_managed_paths": [],
    }


def ensure_directories(project_root: Path, manifest: dict[str, Any], result: OperationResult) -> None:
    for rel in manifest.get("directories", []):
        path = project_root / rel
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            result.changed.append(rel + "/")


def preflight_init(project_root: Path, manifest: dict[str, Any], values: dict[str, str]) -> list[str]:
    collisions: list[str] = []
    for spec in manifest.get("files", []):
        target = project_root / spec["target"]
        if target.exists():
            desired = template_text(spec["source"], values)
            if target.read_text(encoding="utf-8") != desired:
                collisions.append(spec["target"])
    return collisions


def register_file(state: dict[str, Any], spec: dict[str, Any], content: str, *, ownership: str = "framework-managed") -> None:
    state["managed_files"][spec["target"]] = {
        "source": spec["source"],
        "strategy": spec["strategy"],
        "ownership": ownership,
        "baseline_sha256": sha_text(content) if ownership == "framework-managed" else None,
        "template_sha256": sha_text(content),
    }


def install_block(project_root: Path, state: dict[str, Any], spec: dict[str, Any], desired: str, result: OperationResult, *, adopt: bool) -> None:
    target = project_root / spec["target"]
    host = target.read_text(encoding="utf-8") if target.exists() else ""
    current = extract_block(host)
    if current is None:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(replace_block(host, desired), encoding="utf-8")
        result.changed.append(spec["target"] + " [managed block]")
        ownership = "framework-managed"
        baseline = sha_text(desired)
    elif current == desired:
        ownership = "framework-managed"
        baseline = sha_text(desired)
        result.preserved.append(spec["target"] + " [managed block already current]")
    elif adopt:
        ownership = "adopted-local"
        baseline = None
        incoming = write_incoming(project_root, spec["target"], desired, block=True)
        result.conflicts.append(f"{spec['target']} [existing managed block preserved; incoming: {incoming.relative_to(project_root)}]")
    else:
        raise GovernanceError(f"发现已有且不符合当前模板的 agent-governance managed block： {spec['target']}；请使用 adopt")
    state["managed_blocks"][spec["id"]] = {
        "target": spec["target"],
        "source": spec["source"],
        "strategy": spec["strategy"],
        "ownership": ownership,
        "baseline_sha256": baseline,
        "template_sha256": sha_text(desired),
    }




def command_init(project_root: Path, manifest: dict[str, Any]) -> OperationResult:
    if framework_state(project_root) is not None:
        raise GovernanceError("框架已经安装；请使用 status、upgrade 或 doctor")
    values = variables(project_root, manifest)
    collisions = preflight_init(project_root, manifest, values)
    if collisions:
        joined = "\n  - ".join(collisions)
        raise GovernanceError("init 发现已有且与框架模板冲突的路径；请改用 adopt：\n  - " + joined)

    result = OperationResult.empty()
    state = state_skeleton(project_root, manifest)
    ensure_directories(project_root, manifest, result)

    for spec in manifest.get("files", []):
        desired = template_text(spec["source"], values)
        target = project_root / spec["target"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_text(desired, encoding="utf-8")
            if target.suffix == ".py":
                target.chmod(target.stat().st_mode | 0o111)
            result.changed.append(spec["target"])
        else:
            result.preserved.append(spec["target"] + " [already current]")
        register_file(state, spec, desired)

    for spec in manifest.get("managed_blocks", []):
        desired = template_text(spec["source"], values)
        install_block(project_root, state, spec, desired, result, adopt=False)

    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result


def command_adopt(project_root: Path, manifest: dict[str, Any]) -> OperationResult:
    if framework_state(project_root) is not None:
        raise GovernanceError("框架状态已经存在；请使用 upgrade，不要再次 adopt")
    values = variables(project_root, manifest)
    result = OperationResult.empty()
    state = state_skeleton(project_root, manifest)
    ensure_directories(project_root, manifest, result)

    for spec in manifest.get("files", []):
        desired = template_text(spec["source"], values)
        target = project_root / spec["target"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_text(desired, encoding="utf-8")
            if target.suffix == ".py":
                target.chmod(target.stat().st_mode | 0o111)
            register_file(state, spec, desired)
            result.changed.append(spec["target"])
        elif target.read_text(encoding="utf-8") == desired:
            register_file(state, spec, desired)
            result.preserved.append(spec["target"] + " [already matches framework]")
        else:
            incoming = write_incoming(project_root, spec["target"], desired)
            register_file(state, spec, desired, ownership="adopted-local")
            state["pending_conflicts"].append(spec["target"])
            result.conflicts.append(f"{spec['target']} [adopted local; incoming: {incoming.relative_to(project_root)}]")

    for spec in manifest.get("managed_blocks", []):
        desired = template_text(spec["source"], values)
        install_block(project_root, state, spec, desired, result, adopt=True)
        block_state = state["managed_blocks"][spec["id"]]
        if block_state["ownership"] == "adopted-local":
            state["pending_conflicts"].append(spec["target"] + "#managed-block")

    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result


def update_managed_file(project_root: Path, state: dict[str, Any], spec: dict[str, Any], desired: str, result: OperationResult) -> None:
    rel = spec["target"]
    target = project_root / rel
    old = state.get("managed_files", {}).get(rel)
    target.parent.mkdir(parents=True, exist_ok=True)

    if not target.exists():
        target.write_text(desired, encoding="utf-8")
        if target.suffix == ".py":
            target.chmod(target.stat().st_mode | 0o111)
        register_file(state, spec, desired)
        result.changed.append(rel + " [restored/added]")
        return

    current_text = target.read_text(encoding="utf-8")
    current_hash = sha_text(current_text)
    desired_hash = sha_text(desired)

    if old is None:
        # New manifest path in a project upgraded from an older release.
        if current_hash == desired_hash:
            register_file(state, spec, desired)
            result.preserved.append(rel + " [new managed path already current]")
        else:
            incoming = write_incoming(project_root, rel, desired)
            state["managed_files"][rel] = {
                "source": spec["source"], "strategy": spec["strategy"], "ownership": "adopted-local",
                "baseline_sha256": None, "template_sha256": desired_hash,
            }
            result.conflicts.append(f"{rel} [new framework path collides with local file; incoming: {incoming.relative_to(project_root)}]")
        return

    ownership = old.get("ownership", "framework-managed")
    baseline = old.get("baseline_sha256")

    if current_hash == desired_hash:
        register_file(state, spec, desired)
        result.preserved.append(rel + " [already current]")
    elif ownership == "framework-managed" and baseline and current_hash == baseline:
        target.write_text(desired, encoding="utf-8")
        if target.suffix == ".py":
            target.chmod(target.stat().st_mode | 0o111)
        register_file(state, spec, desired)
        result.changed.append(rel)
    else:
        incoming = write_incoming(project_root, rel, desired)
        old.update({"source": spec["source"], "strategy": spec["strategy"], "template_sha256": desired_hash})
        if ownership == "adopted-local":
            old["baseline_sha256"] = None
        result.conflicts.append(f"{rel} [local changes preserved; incoming: {incoming.relative_to(project_root)}]")


def update_managed_block(project_root: Path, state: dict[str, Any], spec: dict[str, Any], desired: str, result: OperationResult) -> None:
    target = project_root / spec["target"]
    host = target.read_text(encoding="utf-8") if target.exists() else ""
    current = extract_block(host)
    old = state.get("managed_blocks", {}).get(spec["id"])
    desired_hash = sha_text(desired)

    if current is None:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(replace_block(host, desired), encoding="utf-8")
        state["managed_blocks"][spec["id"]] = {
            "target": spec["target"], "source": spec["source"], "strategy": spec["strategy"],
            "ownership": "framework-managed", "baseline_sha256": desired_hash, "template_sha256": desired_hash,
        }
        result.changed.append(spec["target"] + " [managed block inserted]")
        return

    current_hash = sha_text(current)
    ownership = (old or {}).get("ownership", "framework-managed")
    baseline = (old or {}).get("baseline_sha256")

    if current_hash == desired_hash:
        state["managed_blocks"][spec["id"]] = {
            "target": spec["target"], "source": spec["source"], "strategy": spec["strategy"],
            "ownership": "framework-managed", "baseline_sha256": desired_hash, "template_sha256": desired_hash,
        }
        result.preserved.append(spec["target"] + " [managed block already current]")
    elif old and ownership == "framework-managed" and baseline and current_hash == baseline:
        target.write_text(replace_block(host, desired), encoding="utf-8")
        state["managed_blocks"][spec["id"]] = {
            "target": spec["target"], "source": spec["source"], "strategy": spec["strategy"],
            "ownership": "framework-managed", "baseline_sha256": desired_hash, "template_sha256": desired_hash,
        }
        result.changed.append(spec["target"] + " [managed block]")
    else:
        incoming = write_incoming(project_root, spec["target"], desired, block=True)
        if old is None:
            old = {}
            state["managed_blocks"][spec["id"]] = old
        old.update({
            "target": spec["target"], "source": spec["source"], "strategy": spec["strategy"],
            "ownership": ownership if old else "adopted-local", "template_sha256": desired_hash,
        })
        result.conflicts.append(f"{spec['target']} [managed block locally changed; incoming: {incoming.relative_to(project_root)}]")


def command_upgrade(project_root: Path, manifest: dict[str, Any]) -> OperationResult:
    state = framework_state(project_root)
    if state is None:
        raise GovernanceError("框架尚未安装；请使用 init 或 adopt")
    values = variables(project_root, manifest)
    result = OperationResult.empty()
    ensure_directories(project_root, manifest, result)

    old_paths = set(state.get("managed_files", {}).keys())
    new_paths = {spec["target"] for spec in manifest.get("files", [])}
    orphaned = sorted(old_paths - new_paths)
    state["orphaned_managed_paths"] = orphaned
    for rel in orphaned:
        result.warnings.append(f"已保留孤立托管路径，不自动删除： {rel}")

    for spec in manifest.get("files", []):
        desired = template_text(spec["source"], values)
        update_managed_file(project_root, state, spec, desired, result)

    for spec in manifest.get("managed_blocks", []):
        desired = template_text(spec["source"], values)
        update_managed_block(project_root, state, spec, desired, result)

    # 根据当前文件与当前模板重新计算待处理冲突。
    pending: list[str] = []
    for spec in manifest.get("files", []):
        rel = spec["target"]
        entry = state["managed_files"].get(rel, {})
        desired = template_text(spec["source"], values)
        target = project_root / rel
        if target.exists() and sha_file(target) != sha_text(desired):
            if entry.get("ownership") != "framework-managed" or sha_file(target) != entry.get("baseline_sha256"):
                pending.append(rel)
    for spec in manifest.get("managed_blocks", []):
        target = project_root / spec["target"]
        current = extract_block(target.read_text(encoding="utf-8")) if target.exists() else None
        desired = template_text(spec["source"], values)
        if current != desired:
            pending.append(spec["target"] + "#managed-block")

    fw = manifest["framework"]
    state["installed_version"] = fw["version"]
    state["note_classes"] = manifest["note_classes"]
    state["note_lifecycles"] = manifest["note_lifecycles"]
    state["notes"] = manifest.get("notes", {"language": "zh-CN", "mode": "single-file"})
    state["last_sync_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    state["pending_conflicts"] = sorted(set(pending))
    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result

def status_data(project_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    state = framework_state(project_root)
    bundled = manifest["framework"]
    if state is None:
        return {"installed": False, "bundled": bundled}
    values = variables(project_root, manifest)
    modified: list[str] = []
    adopted: list[str] = []
    missing: list[str] = []

    for rel, entry in state.get("managed_files", {}).items():
        target = project_root / rel
        if not target.exists():
            missing.append(rel)
            continue
        ownership = entry.get("ownership", "framework-managed")
        if ownership == "adopted-local":
            adopted.append(rel)
        baseline = entry.get("baseline_sha256")
        if baseline and sha_file(target) != baseline:
            modified.append(rel)

    for block_id, entry in state.get("managed_blocks", {}).items():
        target = project_root / entry["target"]
        if not target.exists():
            missing.append(entry["target"] + "#managed-block")
            continue
        try:
            current = extract_block(target.read_text(encoding="utf-8"))
        except GovernanceError:
            current = None
        if entry.get("ownership") == "adopted-local":
            adopted.append(entry["target"] + "#managed-block")
        baseline = entry.get("baseline_sha256")
        if baseline and (current is None or sha_text(current) != baseline):
            modified.append(entry["target"] + "#managed-block")

    target_drift: list[str] = []
    manifest_by_target = {x["target"]: x for x in manifest.get("files", [])}
    for rel, spec in manifest_by_target.items():
        target = project_root / rel
        if target.exists():
            desired = template_text(spec["source"], values)
            if sha_file(target) != sha_text(desired):
                target_drift.append(rel)

    return {
        "installed": True,
        "installed_version": state.get("installed_version"),
        "skill_version": bundled["version"],
        "modified_managed": sorted(set(modified)),
        "adopted_local": sorted(set(adopted)),
        "missing_managed": sorted(set(missing)),
        "drift_from_current_bundle": sorted(set(target_drift)),
        "pending_conflicts": state.get("pending_conflicts", []),
        "orphaned_managed_paths": state.get("orphaned_managed_paths", []),
        "notes": state.get("notes", {}),
    }


def command_doctor(project_root: Path, manifest: dict[str, Any]) -> tuple[dict[str, Any], int, str]:
    status = status_data(project_root, manifest)
    if not status.get("installed"):
        return status, 1, "框架尚未安装"

    verifier = project_root / ".agents" / "scripts" / "verify_agent_notes.py"
    if not verifier.exists():
        return status, 1, "缺少项目 Agent Note 校验器"
    proc = subprocess.run(
        [sys.executable, str(verifier), "--root", str(project_root)],
        cwd=project_root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    structural_bad = bool(status.get("missing_managed") or status.get("pending_conflicts") or status.get("modified_managed"))
    return status, 1 if proc.returncode or structural_bad else 0, proc.stdout.strip()


def print_result(title: str, result: OperationResult, project_root: Path) -> None:
    print(title)
    print(f"项目：{project_root}")
    if result.changed:
        print("已变更：")
        for item in result.changed:
            print(f"  + {item}")
    if result.preserved:
        print("已保留/已是当前模板：")
        for item in result.preserved:
            print(f"  = {item}")
    if result.conflicts:
        print("已保护的冲突：")
        for item in result.conflicts:
            print(f"  ! {item}")
    if result.warnings:
        print("警告：")
        for item in result.warnings:
            print(f"  ? {item}")
    print(f"汇总：changed={len(result.changed)} preserved={len(result.preserved)} conflicts={len(result.conflicts)} warnings={len(result.warnings)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="在仓库中安装和维护 agent-governance")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "adopt", "status", "upgrade", "doctor"):
        p = sub.add_parser(name)
        p.add_argument("--project-root", default=".", help="仓库根目录")
        if name == "status":
            p.add_argument("--json", action="store_true", help="输出机器可读 JSON")
    args = parser.parse_args()
    project_root = Path(args.project_root).resolve()
    if not project_root.exists():
        raise GovernanceError(f"项目根目录不存在： {project_root}")
    manifest = load_manifest()

    if args.command == "init":
        result = command_init(project_root, manifest)
        print_result("agent-governance 初始化完成", result, project_root)
        return 0
    if args.command == "adopt":
        result = command_adopt(project_root, manifest)
        print_result("agent-governance 接管完成", result, project_root)
        return 0
    if args.command == "upgrade":
        result = command_upgrade(project_root, manifest)
        print_result("agent-governance 治理模板同步完成", result, project_root)
        return 2 if result.conflicts else 0
    if args.command == "status":
        data = status_data(project_root, manifest)
        if args.json:
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0 if data.get("installed") else 1
    if args.command == "doctor":
        data, code, verifier_output = command_doctor(project_root, manifest)
        print(json.dumps(data, indent=2, ensure_ascii=False))
        print("\n校验器：")
        print(verifier_output)
        if data.get("pending_conflicts"):
            print("\nDoctor 提示：仍有待处理的框架冲突；完成语义合并后重新运行 upgrade 同步。")
        return code
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except GovernanceError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        raise SystemExit(2)

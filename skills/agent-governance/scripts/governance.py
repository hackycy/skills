#!/usr/bin/env python3
"""Agent 工程治理框架管理器。

仅依赖 Python 标准库。负责安全安装、接管、同步、冲突决议、CI 适配与治理体检。
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

SKILL_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = SKILL_ROOT / "templates" / "manifest.json"
STATE_REL = Path(".agents/framework.json")
LOCK_REL = Path(".agents/.governance/manager.lock")
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
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise GovernanceError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GovernanceError(f"invalid JSON: {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise GovernanceError(f"JSON root must be an object: {path}")
    return value


def atomic_write_text(path: Path, text: str, *, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    temp = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
        if executable:
            path.chmod(path.stat().st_mode | 0o111)
    finally:
        try:
            temp.unlink()
        except FileNotFoundError:
            pass


def write_json(path: Path, data: dict[str, Any]) -> None:
    atomic_write_text(path, json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def sha_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@contextmanager
def project_lock(project_root: Path) -> Iterator[None]:
    lock = project_root / LOCK_REL
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        details = ""
        try:
            details = lock.read_text(encoding="utf-8").strip()
        except Exception:  # noqa: BLE001
            pass
        suffix = f" ({details})" if details else ""
        raise GovernanceError(
            f"治理管理锁已存在：{LOCK_REL}{suffix}。确认没有其他治理进程后，可显式执行 unlock --force。"
        ) from exc
    try:
        os.write(fd, f"pid={os.getpid()} created={dt.datetime.now(dt.timezone.utc).isoformat()}\n".encode())
        os.close(fd)
        yield
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


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
    return {"PROJECT_NAME": project_root.name, "FRAMEWORK_VERSION": str(fw["version"])}


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
    if text.find(BEGIN, start + len(BEGIN)) >= 0:
        raise GovernanceError("AGENTS.md 中存在重复 agent-governance begin marker")
    end = text.find(END, start)
    if end < 0:
        raise GovernanceError(f"found {BEGIN!r} without matching {END!r}")
    if text.find(END, end + len(END)) >= 0:
        raise GovernanceError("AGENTS.md 中存在重复 agent-governance end marker")
    end += len(END)
    return text[start:end] + ("\n" if text[end : end + 1] == "\n" else "")


def replace_block(host: str, new_block: str) -> str:
    current = extract_block(host)
    if current is None:
        suffix = "" if not host or host.endswith("\n") else "\n"
        gap = "" if not host else "\n"
        return host + suffix + gap + new_block.rstrip("\n") + "\n"
    start = host.find(BEGIN)
    end = host.find(END, start) + len(END)
    if host[end : end + 1] == "\n":
        end += 1
    return host[:start] + new_block.rstrip("\n") + "\n" + host[end:]


def incoming_path(project_root: Path, target: str, block: bool = False) -> Path:
    rel = Path(target)
    base = project_root / ".agents" / ".governance" / "incoming" / "current" / rel
    return base.with_name(base.name + (".block.incoming" if block else ".incoming"))


def write_incoming(project_root: Path, target: str, content: str, *, block: bool = False) -> Path:
    path = incoming_path(project_root, target, block=block)
    atomic_write_text(path, content)
    return path


def clear_incoming(project_root: Path, target: str, *, block: bool = False) -> None:
    try:
        incoming_path(project_root, target, block=block).unlink()
    except FileNotFoundError:
        pass


def regular_specs(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return [x for x in manifest.get("files", []) if not x.get("optional")]


def current_specs(manifest: dict[str, Any], state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    result = regular_specs(manifest)
    if state is not None:
        installed = set(state.get("managed_files", {}).keys())
        result += [x for x in manifest.get("files", []) if x.get("optional") and x["target"] in installed]
    return result


def spec_by_target(manifest: dict[str, Any], target: str) -> dict[str, Any] | None:
    return next((x for x in manifest.get("files", []) if x["target"] == target), None)


def block_by_id(manifest: dict[str, Any], block_id: str) -> dict[str, Any] | None:
    return next((x for x in manifest.get("managed_blocks", []) if x["id"] == block_id), None)


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
        "available_updates": [],
        "orphaned_managed_paths": [],
    }


def ensure_directories(project_root: Path, manifest: dict[str, Any], result: OperationResult) -> None:
    for rel in manifest.get("directories", []):
        path = project_root / rel
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            result.changed.append(rel + "/")


def register_file(
    state: dict[str, Any], spec: dict[str, Any], content: str, *, ownership: str = "framework-managed"
) -> None:
    state["managed_files"][spec["target"]] = {
        "source": spec["source"],
        "strategy": spec["strategy"],
        "ownership": ownership,
        "baseline_sha256": sha_text(content) if ownership in {"framework-managed", "project-override"} else None,
        "template_sha256": sha_text(content),
    }


def install_file(
    project_root: Path,
    state: dict[str, Any],
    spec: dict[str, Any],
    desired: str,
    result: OperationResult,
    *,
    adopt: bool,
) -> None:
    target = project_root / spec["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    strategy = spec.get("strategy", "replace-if-unmodified")
    executable = target.suffix == ".py"

    if strategy == "seed-project-owned":
        if not target.exists():
            atomic_write_text(target, desired, executable=executable)
            result.changed.append(spec["target"] + " [project-owned seed]")
        else:
            result.preserved.append(spec["target"] + " [project-owned]")
        register_file(state, spec, desired, ownership="project-owned")
        return

    if not target.exists():
        atomic_write_text(target, desired, executable=executable)
        register_file(state, spec, desired)
        result.changed.append(spec["target"])
    elif target.read_text(encoding="utf-8") == desired:
        register_file(state, spec, desired)
        result.preserved.append(spec["target"] + " [already current]")
    elif adopt:
        incoming = write_incoming(project_root, spec["target"], desired)
        register_file(state, spec, desired, ownership="adopted-local")
        result.conflicts.append(f"{spec['target']} [adopted local; incoming: {incoming.relative_to(project_root)}]")
    else:
        raise GovernanceError(f"发现已有且与框架模板冲突的路径：{spec['target']}；请使用 adopt")


def install_block(
    project_root: Path,
    state: dict[str, Any],
    spec: dict[str, Any],
    desired: str,
    result: OperationResult,
    *,
    adopt: bool,
) -> None:
    target = project_root / spec["target"]
    host = target.read_text(encoding="utf-8") if target.exists() else ""
    current = extract_block(host)
    if current is None:
        atomic_write_text(target, replace_block(host, desired))
        ownership = "framework-managed"
        baseline = sha_text(desired)
        result.changed.append(spec["target"] + " [managed block]")
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
        raise GovernanceError(f"已有 agent-governance managed block 与当前模板冲突：{spec['target']}；请使用 adopt")
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
    collisions: list[str] = []
    for spec in regular_specs(manifest):
        if spec.get("strategy") == "seed-project-owned":
            continue
        target = project_root / spec["target"]
        if target.exists() and target.read_text(encoding="utf-8") != template_text(spec["source"], values):
            collisions.append(spec["target"])
    if collisions:
        raise GovernanceError("init 发现已有且与框架模板冲突的路径；请改用 adopt：\n  - " + "\n  - ".join(collisions))

    result = OperationResult.empty()
    state = state_skeleton(project_root, manifest)
    ensure_directories(project_root, manifest, result)
    for spec in regular_specs(manifest):
        install_file(project_root, state, spec, template_text(spec["source"], values), result, adopt=False)
    for spec in manifest.get("managed_blocks", []):
        install_block(project_root, state, spec, template_text(spec["source"], values), result, adopt=False)
    recompute_flags(project_root, manifest, state, values)
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
    for spec in regular_specs(manifest):
        install_file(project_root, state, spec, template_text(spec["source"], values), result, adopt=True)
    for spec in manifest.get("managed_blocks", []):
        install_block(project_root, state, spec, template_text(spec["source"], values), result, adopt=True)
    recompute_flags(project_root, manifest, state, values)
    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result


def update_managed_file(
    project_root: Path,
    state: dict[str, Any],
    spec: dict[str, Any],
    desired: str,
    result: OperationResult,
) -> None:
    rel = spec["target"]
    target = project_root / rel
    old = state.get("managed_files", {}).get(rel)
    desired_hash = sha_text(desired)
    executable = target.suffix == ".py"
    target.parent.mkdir(parents=True, exist_ok=True)

    if old is None:
        install_file(project_root, state, spec, desired, result, adopt=True)
        return

    ownership = old.get("ownership", "framework-managed")
    if ownership == "detached":
        result.preserved.append(rel + " [detached]")
        return
    if ownership == "project-owned":
        if target.exists():
            result.preserved.append(rel + " [project-owned]")
        else:
            result.warnings.append(f"project-owned 文件缺失，不自动重建以避免覆盖历史数据：{rel}")
        return
    if ownership == "project-override":
        if not target.exists():
            result.warnings.append(f"project-override 文件缺失：{rel}")
        elif old.get("template_sha256") != desired_hash:
            incoming = write_incoming(project_root, rel, desired)
            result.warnings.append(f"{rel} [project override 有新框架候选：{incoming.relative_to(project_root)}]")
        else:
            result.preserved.append(rel + " [project override]")
        return
    if ownership == "adopted-local":
        incoming = write_incoming(project_root, rel, desired)
        old.update({"source": spec["source"], "strategy": spec["strategy"], "template_sha256": desired_hash})
        result.conflicts.append(f"{rel} [adopted local 未决；incoming: {incoming.relative_to(project_root)}]")
        return
    if ownership != "framework-managed":
        raise GovernanceError(f"未知 ownership {ownership!r}: {rel}")

    if not target.exists():
        atomic_write_text(target, desired, executable=executable)
        register_file(state, spec, desired)
        result.changed.append(rel + " [restored]")
        return
    current_hash = sha_file(target)
    baseline = old.get("baseline_sha256")
    if current_hash == desired_hash:
        register_file(state, spec, desired)
        result.preserved.append(rel + " [already current]")
    elif baseline and current_hash == baseline:
        atomic_write_text(target, desired, executable=executable)
        register_file(state, spec, desired)
        result.changed.append(rel)
    else:
        incoming = write_incoming(project_root, rel, desired)
        old.update({"source": spec["source"], "strategy": spec["strategy"], "template_sha256": desired_hash})
        result.conflicts.append(f"{rel} [local changes preserved; incoming: {incoming.relative_to(project_root)}]")


def update_managed_block(
    project_root: Path,
    state: dict[str, Any],
    spec: dict[str, Any],
    desired: str,
    result: OperationResult,
) -> None:
    target = project_root / spec["target"]
    host = target.read_text(encoding="utf-8") if target.exists() else ""
    current = extract_block(host)
    old = state.get("managed_blocks", {}).get(spec["id"])
    desired_hash = sha_text(desired)
    if old is None:
        install_block(project_root, state, spec, desired, result, adopt=True)
        return
    ownership = old.get("ownership", "framework-managed")
    if ownership == "detached":
        result.preserved.append(spec["target"] + " [managed block detached]")
        return
    if ownership == "project-override":
        if current is None:
            result.warnings.append(f"project-override managed block 缺失：{spec['target']}")
        elif old.get("template_sha256") != desired_hash:
            incoming = write_incoming(project_root, spec["target"], desired, block=True)
            result.warnings.append(f"{spec['target']} [project override block 有新候选：{incoming.relative_to(project_root)}]")
        else:
            result.preserved.append(spec["target"] + " [managed block project override]")
        return
    if ownership == "adopted-local":
        incoming = write_incoming(project_root, spec["target"], desired, block=True)
        old.update({"template_sha256": desired_hash})
        result.conflicts.append(f"{spec['target']} [adopted local block 未决；incoming: {incoming.relative_to(project_root)}]")
        return
    if ownership != "framework-managed":
        raise GovernanceError(f"未知 managed block ownership {ownership!r}: {spec['id']}")

    baseline = old.get("baseline_sha256")
    current_hash = sha_text(current) if current is not None else None
    if current_hash == desired_hash:
        old.update({"baseline_sha256": desired_hash, "template_sha256": desired_hash})
        result.preserved.append(spec["target"] + " [managed block already current]")
    elif current is not None and baseline and current_hash == baseline:
        atomic_write_text(target, replace_block(host, desired))
        old.update({"baseline_sha256": desired_hash, "template_sha256": desired_hash})
        result.changed.append(spec["target"] + " [managed block]")
    elif current is None and not target.exists():
        atomic_write_text(target, replace_block(host, desired))
        old.update({"baseline_sha256": desired_hash, "template_sha256": desired_hash})
        result.changed.append(spec["target"] + " [managed block restored]")
    else:
        incoming = write_incoming(project_root, spec["target"], desired, block=True)
        old.update({"template_sha256": desired_hash})
        result.conflicts.append(f"{spec['target']} [managed block locally changed; incoming: {incoming.relative_to(project_root)}]")


def recompute_flags(
    project_root: Path, manifest: dict[str, Any], state: dict[str, Any], values: dict[str, str]
) -> None:
    pending: list[str] = []
    updates: list[str] = []
    specs = {x["target"]: x for x in current_specs(manifest, state)}
    for rel, entry in state.get("managed_files", {}).items():
        ownership = entry.get("ownership", "framework-managed")
        target = project_root / rel
        spec = specs.get(rel)
        if ownership == "adopted-local":
            pending.append(rel)
        elif ownership == "framework-managed" and target.exists():
            baseline = entry.get("baseline_sha256")
            if baseline and sha_file(target) != baseline:
                pending.append(rel)
        elif ownership == "project-override" and spec is not None:
            desired_hash = sha_text(template_text(spec["source"], values))
            if desired_hash != entry.get("template_sha256"):
                updates.append(rel)
    for block_id, entry in state.get("managed_blocks", {}).items():
        ownership = entry.get("ownership", "framework-managed")
        spec = block_by_id(manifest, block_id)
        target = project_root / entry.get("target", "")
        current = None
        if target.exists():
            try:
                current = extract_block(target.read_text(encoding="utf-8"))
            except GovernanceError:
                current = None
        if ownership == "adopted-local":
            pending.append(entry["target"] + "#managed-block")
        elif ownership == "framework-managed" and current is not None:
            baseline = entry.get("baseline_sha256")
            if baseline and sha_text(current) != baseline:
                pending.append(entry["target"] + "#managed-block")
        elif ownership == "project-override" and spec is not None:
            desired_hash = sha_text(template_text(spec["source"], values))
            if desired_hash != entry.get("template_sha256"):
                updates.append(entry["target"] + "#managed-block")
    state["pending_conflicts"] = sorted(set(pending))
    state["available_updates"] = sorted(set(updates))


def command_upgrade(project_root: Path, manifest: dict[str, Any]) -> OperationResult:
    state = framework_state(project_root)
    if state is None:
        raise GovernanceError("框架尚未安装；请使用 init 或 adopt")
    values = variables(project_root, manifest)
    result = OperationResult.empty()
    ensure_directories(project_root, manifest, result)

    specs = current_specs(manifest, state)
    old_paths = set(state.get("managed_files", {}).keys())
    new_paths = {spec["target"] for spec in specs}
    orphaned = sorted(old_paths - new_paths)
    state["orphaned_managed_paths"] = orphaned
    for rel in orphaned:
        result.warnings.append(f"已保留孤立托管路径，不自动删除：{rel}")

    for spec in specs:
        update_managed_file(project_root, state, spec, template_text(spec["source"], values), result)
    for spec in manifest.get("managed_blocks", []):
        update_managed_block(project_root, state, spec, template_text(spec["source"], values), result)

    fw = manifest["framework"]
    state["installed_version"] = fw["version"]
    state["note_classes"] = manifest["note_classes"]
    state["note_lifecycles"] = manifest["note_lifecycles"]
    state["notes"] = manifest.get("notes", {"language": "zh-CN", "mode": "single-file"})
    state["last_sync_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    recompute_flags(project_root, manifest, state, values)
    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result


def status_data(project_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    state = framework_state(project_root)
    bundled = manifest["framework"]
    if state is None:
        return {"installed": False, "bundled": bundled, "health": "broken"}
    values = variables(project_root, manifest)
    modified: list[str] = []
    adopted: list[str] = []
    overrides: list[str] = []
    detached: list[str] = []
    project_owned: list[str] = []
    missing: list[str] = []

    for rel, entry in state.get("managed_files", {}).items():
        target = project_root / rel
        ownership = entry.get("ownership", "framework-managed")
        if ownership in {"framework-managed", "project-override", "project-owned"} and not target.exists():
            missing.append(rel)
            continue
        if ownership == "framework-managed":
            baseline = entry.get("baseline_sha256")
            if baseline and sha_file(target) != baseline:
                modified.append(rel)
        elif ownership == "adopted-local":
            adopted.append(rel)
        elif ownership == "project-override":
            overrides.append(rel)
        elif ownership == "detached":
            detached.append(rel)
        elif ownership == "project-owned":
            project_owned.append(rel)

    for block_id, entry in state.get("managed_blocks", {}).items():
        target = project_root / entry["target"]
        ownership = entry.get("ownership", "framework-managed")
        current = None
        if target.exists():
            try:
                current = extract_block(target.read_text(encoding="utf-8"))
            except GovernanceError:
                pass
        key = entry["target"] + "#managed-block"
        if ownership in {"framework-managed", "project-override"} and current is None:
            missing.append(key)
        elif ownership == "framework-managed":
            baseline = entry.get("baseline_sha256")
            if baseline and sha_text(current or "") != baseline:
                modified.append(key)
        elif ownership == "adopted-local":
            adopted.append(key)
        elif ownership == "project-override":
            overrides.append(key)
        elif ownership == "detached":
            detached.append(key)

    drift: list[str] = []
    specs = current_specs(manifest, state)
    for spec in specs:
        entry = state.get("managed_files", {}).get(spec["target"])
        if not entry or entry.get("ownership") in {"detached", "project-owned"}:
            continue
        desired_hash = sha_text(template_text(spec["source"], values))
        if desired_hash != entry.get("template_sha256"):
            drift.append(spec["target"])
    for spec in manifest.get("managed_blocks", []):
        entry = state.get("managed_blocks", {}).get(spec["id"])
        if not entry or entry.get("ownership") == "detached":
            continue
        desired_hash = sha_text(template_text(spec["source"], values))
        if desired_hash != entry.get("template_sha256"):
            drift.append(spec["target"] + "#managed-block")

    pending = state.get("pending_conflicts", [])
    available = state.get("available_updates", [])
    orphaned = state.get("orphaned_managed_paths", [])
    if missing:
        health = "broken"
    elif modified or pending or adopted:
        health = "conflicted"
    elif drift or available or orphaned:
        health = "sync-needed"
    else:
        health = "healthy"

    return {
        "installed": True,
        "health": health,
        "installed_version": state.get("installed_version"),
        "skill_version": bundled["version"],
        "modified_managed": sorted(set(modified)),
        "adopted_local": sorted(set(adopted)),
        "project_overrides": sorted(set(overrides)),
        "detached": sorted(set(detached)),
        "project_owned": sorted(set(project_owned)),
        "missing_managed": sorted(set(missing)),
        "drift_from_current_bundle": sorted(set(drift)),
        "pending_conflicts": pending,
        "available_updates": available,
        "orphaned_managed_paths": orphaned,
        "notes": state.get("notes", {}),
    }


def command_doctor(project_root: Path, manifest: dict[str, Any]) -> tuple[dict[str, Any], int, dict[str, Any]]:
    status = status_data(project_root, manifest)
    if not status.get("installed"):
        return status, 1, {"health": "broken", "broken": ["框架尚未安装"]}
    checker = project_root / ".agents" / "scripts" / "governance_check.py"
    if not checker.exists():
        return status, 1, {"health": "broken", "broken": ["缺少项目治理检查器"]}
    proc = subprocess.run(
        [sys.executable, str(checker), "--root", str(project_root), "--json"],
        cwd=project_root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    try:
        check = json.loads(proc.stdout)
    except json.JSONDecodeError:
        check = {"health": "broken", "broken": ["governance_check 输出无法解析"], "raw": proc.stdout}
        proc = subprocess.CompletedProcess(proc.args, 1, proc.stdout, proc.stderr)

    check_health = check.get("health")
    status_health = status.get("health")
    if check_health == "broken" or status_health == "broken":
        health, code = "broken", 1
    elif check_health == "conflicted" or status_health == "conflicted":
        health, code = "conflicted", 4
    elif status_health == "sync-needed" or check_health == "sync-needed":
        health, code = "sync-needed", 3
    else:
        health, code = "healthy", 0
    status["health"] = health
    return status, code, check


def resolve_entry(project_root: Path, manifest: dict[str, Any], target_arg: str, mode: str) -> OperationResult:
    state = framework_state(project_root)
    if state is None:
        raise GovernanceError("框架尚未安装")
    values = variables(project_root, manifest)
    result = OperationResult.empty()

    if target_arg.endswith("#managed-block"):
        target_name = target_arg[: -len("#managed-block")]
        pair = next(
            ((bid, e) for bid, e in state.get("managed_blocks", {}).items() if e.get("target") == target_name), None
        )
        if pair is None:
            raise GovernanceError(f"未找到 managed block：{target_arg}")
        block_id, entry = pair
        spec = block_by_id(manifest, block_id)
        host_path = project_root / target_name
        host = host_path.read_text(encoding="utf-8") if host_path.exists() else ""
        current = extract_block(host)
        if mode == "take-framework":
            if spec is None:
                raise GovernanceError("该 block 已不在当前 manifest，不能 take-framework")
            desired = template_text(spec["source"], values)
            atomic_write_text(host_path, replace_block(host, desired))
            entry.update(
                ownership="framework-managed", baseline_sha256=sha_text(desired), template_sha256=sha_text(desired)
            )
            result.changed.append(target_arg + " [take-framework]")
        elif mode == "keep-local":
            if current is None:
                raise GovernanceError("managed block 不存在，无法 keep-local；可选择 detach")
            desired_hash = sha_text(template_text(spec["source"], values)) if spec else entry.get("template_sha256")
            entry.update(ownership="project-override", baseline_sha256=sha_text(current), template_sha256=desired_hash)
            result.preserved.append(target_arg + " [project override]")
        elif mode == "detach":
            entry.update(ownership="detached", baseline_sha256=None)
            result.preserved.append(target_arg + " [detached]")
        clear_incoming(project_root, target_name, block=True)
    else:
        entry = state.get("managed_files", {}).get(target_arg)
        if entry is None:
            raise GovernanceError(f"未找到托管路径：{target_arg}")
        if entry.get("ownership") == "project-owned":
            raise GovernanceError(f"project-owned 数据不能通过 resolve 覆盖或脱离：{target_arg}")
        spec = spec_by_target(manifest, target_arg)
        target = project_root / target_arg
        if mode == "take-framework":
            if spec is None:
                raise GovernanceError("该路径已不在当前 manifest，不能 take-framework")
            desired = template_text(spec["source"], values)
            atomic_write_text(target, desired, executable=target.suffix == ".py")
            register_file(state, spec, desired)
            result.changed.append(target_arg + " [take-framework]")
        elif mode == "keep-local":
            if not target.exists():
                raise GovernanceError("目标文件不存在，无法 keep-local；可选择 detach")
            desired_hash = sha_text(template_text(spec["source"], values)) if spec else entry.get("template_sha256")
            entry.update(ownership="project-override", baseline_sha256=sha_file(target), template_sha256=desired_hash)
            result.preserved.append(target_arg + " [project override]")
        elif mode == "detach":
            entry.update(ownership="detached", baseline_sha256=None)
            result.preserved.append(target_arg + " [detached]")
        clear_incoming(project_root, target_arg)

    recompute_flags(project_root, manifest, state, values)
    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result


def command_install_ci(project_root: Path, manifest: dict[str, Any], provider: str) -> OperationResult:
    state = framework_state(project_root)
    if state is None:
        raise GovernanceError("框架尚未安装；先 init/adopt")
    candidates = [x for x in manifest.get("files", []) if x.get("optional") and x.get("integration") == provider]
    if not candidates:
        raise GovernanceError(f"不支持 CI provider：{provider}")
    values = variables(project_root, manifest)
    result = OperationResult.empty()
    for spec in candidates:
        update_managed_file(project_root, state, spec, template_text(spec["source"], values), result)
    recompute_flags(project_root, manifest, state, values)
    write_json(project_root / STATE_REL, state)
    result.changed.append(str(STATE_REL))
    return result


def print_result(title: str, result: OperationResult, project_root: Path) -> None:
    print(title)
    print(f"项目：{project_root}")
    for label, marker, values in (
        ("已变更", "+", result.changed),
        ("已保留/已是当前状态", "=", result.preserved),
        ("已保护的冲突", "!", result.conflicts),
        ("警告/可选更新", "?", result.warnings),
    ):
        if values:
            print(label + "：")
            for item in values:
                print(f"  {marker} {item}")
    print(
        f"汇总：changed={len(result.changed)} preserved={len(result.preserved)} "
        f"conflicts={len(result.conflicts)} warnings={len(result.warnings)}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="在仓库中安装和维护 agent-governance")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "adopt", "status", "upgrade", "doctor"):
        p = sub.add_parser(name)
        p.add_argument("--project-root", default=".", help="仓库根目录")
        if name == "status":
            p.add_argument("--json", action="store_true", help="输出机器可读 JSON")
    resolve = sub.add_parser("resolve")
    resolve.add_argument("target", help="托管路径；managed block 使用 AGENTS.md#managed-block")
    resolve.add_argument("--mode", choices=("take-framework", "keep-local", "detach"), required=True)
    resolve.add_argument("--project-root", default=".")
    ci = sub.add_parser("install-ci")
    ci.add_argument("--provider", choices=("github-actions",), default="github-actions")
    ci.add_argument("--project-root", default=".")
    unlock = sub.add_parser("unlock")
    unlock.add_argument("--project-root", default=".")
    unlock.add_argument("--force", action="store_true", required=True)

    args = parser.parse_args()
    project_root = Path(args.project_root).resolve()
    if not project_root.exists():
        raise GovernanceError(f"项目根目录不存在：{project_root}")
    manifest = load_manifest()

    if args.command == "unlock":
        lock = project_root / LOCK_REL
        if lock.exists():
            lock.unlink()
            print(f"已移除治理锁：{LOCK_REL}")
        else:
            print("治理锁不存在。")
        return 0

    if args.command in {"init", "adopt", "upgrade", "resolve", "install-ci"}:
        with project_lock(project_root):
            if args.command == "init":
                result = command_init(project_root, manifest)
                print_result("agent-governance 初始化完成", result, project_root)
                return 0
            if args.command == "adopt":
                result = command_adopt(project_root, manifest)
                print_result("agent-governance 接管完成", result, project_root)
                return 2 if result.conflicts else 0
            if args.command == "upgrade":
                result = command_upgrade(project_root, manifest)
                print_result("agent-governance 治理模板同步完成", result, project_root)
                return 2 if result.conflicts else 0
            if args.command == "resolve":
                result = resolve_entry(project_root, manifest, args.target, args.mode)
                print_result("agent-governance 冲突决议完成", result, project_root)
                return 0
            if args.command == "install-ci":
                result = command_install_ci(project_root, manifest, args.provider)
                print_result("agent-governance CI 适配安装完成", result, project_root)
                return 2 if result.conflicts else 0

    if args.command == "status":
        data = status_data(project_root, manifest)
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0 if data.get("installed") else 1
    if args.command == "doctor":
        data, code, check = command_doctor(project_root, manifest)
        print(json.dumps({"status": data, "project_check": check}, indent=2, ensure_ascii=False))
        return code
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except GovernanceError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        raise SystemExit(2)

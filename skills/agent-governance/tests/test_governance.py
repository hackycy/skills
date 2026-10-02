from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
MANAGER = SKILL / "scripts" / "governance.py"
PACKAGE_VERIFY = SKILL / "scripts" / "verify_package.py"


class GovernanceTests(unittest.TestCase):
    def run_mgr(self, repo: Path, *args: str, expect: int = 0, manager: Path | None = None) -> subprocess.CompletedProcess[str]:
        proc = subprocess.run(
            [sys.executable, str(manager or MANAGER), *args, "--project-root", str(repo)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        self.assertEqual(proc.returncode, expect, proc.stdout)
        return proc

    def run_project(self, repo: Path, script: str, *args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
        proc = subprocess.run(
            [sys.executable, str(repo / ".agents/scripts" / script), *args, "--root", str(repo)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        self.assertEqual(proc.returncode, expect, proc.stdout)
        return proc

    def init_repo(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        td = tempfile.TemporaryDirectory()
        repo = Path(td.name) / "repo"
        repo.mkdir()
        self.run_mgr(repo, "init")
        return td, repo

    @staticmethod
    def valid_note(lifecycle: str, title: str = "稳定事件所有权", *, extra: str = "", relations: str = "") -> str:
        status = "implemented" if lifecycle == "archived" else lifecycle
        archived = "Archived: 2026-10-02\n" if lifecycle == "archived" else ""
        meta = "Scope: session/events\nSupersedes: none\nRelated: none\n"
        if relations:
            meta = relations.rstrip() + "\n"
        bodies = {
            "proposed": """## 问题\n\n需要稳定事件 ownership，避免跨模块产生多个 authority。\n\n## 提案\n\n由 session domain 统一拥有事件发布。\n\n## 考虑过的替代方案\n\n保留分散发布被否决，因为会形成重复 authority。\n\n## 验收标准\n\n集成测试证明所有事件都经过唯一发布入口。\n\n## 风险\n\n迁移期间需要同步更新旧调用方。\n""",
            "implemented": """## 问题\n\n需要稳定事件 ownership，避免跨模块产生多个 authority。\n\n## 决策\n\nsession domain 统一拥有事件发布。\n\n## 考虑过的替代方案\n\n保留分散发布被否决，因为会形成重复 authority。\n\n## 后果\n\n获得单一 ownership，但迁移时必须更新所有旧调用方。\n\n## 验证\n\n单元测试和集成测试覆盖唯一发布入口。\n""",
            "rejected": """## 问题\n\n需要稳定事件 ownership。\n\n## 提案\n\n允许每个插件独立发布同名事件。\n\n## 拒绝原因\n\n该方案产生重复 authority，无法稳定推导事件来源。\n\n## 考虑过的替代方案\n\n采用 session domain 单一发布入口。\n""",
            "archived": """## 问题\n\n需要稳定事件 ownership，避免跨模块产生多个 authority。\n\n## 决策\n\nsession domain 统一拥有事件发布。\n\n## 考虑过的替代方案\n\n保留分散发布被否决，因为会形成重复 authority。\n\n## 后果\n\n获得单一 ownership，但迁移时必须更新所有旧调用方。\n\n## 验证\n\n单元测试和集成测试覆盖唯一发布入口。\n""",
        }
        return f"# Agent Note: {title}\n\nStatus: {status}\n{archived}{meta}\n{bodies[lifecycle]}{extra}"

    def test_bundle_version_fixed(self) -> None:
        self.assertEqual((SKILL / "VERSION").read_text().strip(), "0.0.1")
        manifest = json.loads((SKILL / "templates/manifest.json").read_text())
        self.assertEqual(manifest["framework"]["version"], "0.0.1")

    def test_init_is_healthy_and_archive_manifest_project_owned(self) -> None:
        td, repo = self.init_repo()
        try:
            out = self.run_mgr(repo, "doctor")
            self.assertIn('"health": "healthy"', out.stdout)
            manifest = repo / ".agents/notes/archived/manifest.json"
            self.assertTrue(manifest.exists())
            state = json.loads((repo / ".agents/framework.json").read_text())
            self.assertEqual(state["managed_files"][".agents/notes/archived/manifest.json"]["ownership"], "project-owned")
        finally:
            td.cleanup()

    def test_new_note_placeholder_intentionally_fails_until_filled(self) -> None:
        td, repo = self.init_repo()
        try:
            self.run_project(
                repo,
                "new_agent_note.py",
                "proposed",
                "architecture",
                "稳定事件所有权",
                "--slug",
                "stable-event-ownership",
                "--date",
                "2026-09-25",
            )
            bad = self.run_project(repo, "governance_check.py", expect=1)
            self.assertIn("REQUIRED", bad.stdout)
            note = repo / ".agents/notes/proposed/architecture/2026-09-25-stable-event-ownership.md"
            note.write_text(self.valid_note("proposed"), encoding="utf-8")
            self.run_project(repo, "governance_check.py")
        finally:
            td.cleanup()

    def test_new_note_exclusive_create_preserves_existing(self) -> None:
        td, repo = self.init_repo()
        try:
            args = (
                "proposed", "architecture", "稳定事件所有权", "--slug", "stable-event-ownership", "--date", "2026-09-25"
            )
            self.run_project(repo, "new_agent_note.py", *args)
            note = repo / ".agents/notes/proposed/architecture/2026-09-25-stable-event-ownership.md"
            before = note.read_text()
            self.run_project(repo, "new_agent_note.py", *args, expect=2)
            self.assertEqual(note.read_text(), before)
        finally:
            td.cleanup()

    def test_fenced_fake_headings_do_not_satisfy_format(self) -> None:
        td, repo = self.init_repo()
        try:
            note = repo / ".agents/notes/proposed/architecture/2026-09-25-fake-headings.md"
            note.write_text(
                "# Agent Note: fake\n\nStatus: proposed\nScope: session/events\nSupersedes: none\nRelated: none\n\n"
                "## 问题\n\n真实问题。\n\n```md\n## 提案\n## 考虑过的替代方案\n## 验收标准\n## 风险\n```\n",
                encoding="utf-8",
            )
            out = self.run_project(repo, "verify_agent_notes.py", expect=1)
            self.assertIn("缺少章节", out.stdout)
        finally:
            td.cleanup()

    def test_duplicate_status_and_wrong_section_order_fail(self) -> None:
        td, repo = self.init_repo()
        try:
            note = repo / ".agents/notes/implemented/architecture/2026-09-25-bad-order.md"
            text = self.valid_note("implemented").replace("## 决策", "Status: implemented\n\n## 决策", 1)
            text = text.replace("## 问题", "## 后果\n\n先写后果。\n\n## 问题", 1).replace("\n## 后果\n\n获得单一 ownership", "\n## 验证补充\n\n额外。\n\n## 后果\n\n获得单一 ownership", 1)
            note.write_text(text, encoding="utf-8")
            out = self.run_project(repo, "verify_agent_notes.py", expect=1)
            self.assertIn("Status 行必须且只能出现一次", out.stdout)
            self.assertIn("必需章节顺序错误", out.stdout)
        finally:
            td.cleanup()

    def test_broken_relative_markdown_link_fails(self) -> None:
        td, repo = self.init_repo()
        try:
            note = repo / ".agents/notes/implemented/architecture/2026-09-25-link.md"
            note.write_text(self.valid_note("implemented", extra="\n参见 [missing](./does-not-exist.md)。\n"), encoding="utf-8")
            out = self.run_project(repo, "verify_agent_notes.py", expect=1)
            self.assertIn("Markdown 相对链接不存在", out.stdout)
        finally:
            td.cleanup()

    def test_tampered_framework_taxonomy_fails(self) -> None:
        td, repo = self.init_repo()
        try:
            state_path = repo / ".agents/framework.json"
            state = json.loads(state_path.read_text())
            state["note_classes"].append("whatever")
            state_path.write_text(json.dumps(state), encoding="utf-8")
            out = self.run_project(repo, "governance_check.py", expect=1)
            self.assertIn("canonical taxonomy", out.stdout)
        finally:
            td.cleanup()

    def test_archive_seals_and_tamper_is_detected(self) -> None:
        td, repo = self.init_repo()
        try:
            src = repo / ".agents/notes/implemented/architecture/2026-09-25-stable-event-ownership.md"
            src.write_text(self.valid_note("implemented"), encoding="utf-8")
            self.run_project(repo, "archive_agent_note.py", str(src.relative_to(repo)), "--date", "2026-10-02")
            self.assertFalse(src.exists())
            dst = repo / ".agents/notes/archived/architecture/2026-09-25-stable-event-ownership.md"
            self.assertTrue(dst.exists())
            manifest = json.loads((repo / ".agents/notes/archived/manifest.json").read_text())
            self.assertIn("architecture/2026-09-25-stable-event-ownership.md", manifest["files"])
            self.run_project(repo, "governance_check.py")
            dst.write_text(dst.read_text() + "\n偷偷修改历史。\n", encoding="utf-8")
            out = self.run_project(repo, "governance_check.py", expect=1)
            self.assertIn("历史记录被改写", out.stdout)
        finally:
            td.cleanup()

    def test_archive_refuses_active_inbound_reference(self) -> None:
        td, repo = self.init_repo()
        try:
            src = repo / ".agents/notes/implemented/architecture/2026-09-25-old.md"
            src.write_text(self.valid_note("implemented"), encoding="utf-8")
            ref = repo / ".agents/notes/implemented/architecture/2026-09-26-new.md"
            relations = "Scope: session/events\nSupersedes: none\nRelated: .agents/notes/implemented/architecture/2026-09-25-old.md"
            ref.write_text(self.valid_note("implemented", title="新决策", relations=relations), encoding="utf-8")
            out = self.run_project(repo, "archive_agent_note.py", str(src.relative_to(repo)), expect=2)
            self.assertIn("仍有活跃 Note 引用", out.stdout)
            self.assertTrue(src.exists())
        finally:
            td.cleanup()

    def test_adopt_preserves_existing_note_and_local_governance(self) -> None:
        with tempfile.TemporaryDirectory() as td_name:
            repo = Path(td_name) / "repo"
            note_dir = repo / ".agents/notes/proposed/architecture"
            note_dir.mkdir(parents=True)
            note = note_dir / "2026-09-20-existing-decision.md"
            original = self.valid_note("proposed")
            note.write_text(original, encoding="utf-8")
            (repo / ".agents/AGENTS.md").write_text("custom\n", encoding="utf-8")
            self.run_mgr(repo, "adopt", expect=2)
            self.assertEqual(note.read_text(), original)
            self.assertEqual((repo / ".agents/AGENTS.md").read_text(), "custom\n")
            state = json.loads((repo / ".agents/framework.json").read_text())
            self.assertEqual(state["managed_files"][".agents/AGENTS.md"]["ownership"], "adopted-local")

    def test_resolve_keep_local_clears_conflict(self) -> None:
        td, repo = self.init_repo()
        try:
            target = repo / ".agents/notes/README.md"
            target.write_text(target.read_text() + "\n项目长期定制。\n", encoding="utf-8")
            self.run_mgr(repo, "upgrade", expect=2)
            self.run_mgr(repo, "resolve", ".agents/notes/README.md", "--mode", "keep-local")
            state = json.loads((repo / ".agents/framework.json").read_text())
            self.assertEqual(state["managed_files"][".agents/notes/README.md"]["ownership"], "project-override")
            self.assertEqual(state["pending_conflicts"], [])
            self.run_mgr(repo, "doctor")
        finally:
            td.cleanup()

    def test_project_override_gets_update_without_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as td_name:
            base = Path(td_name)
            skill_copy = base / "agent-governance"
            shutil.copytree(SKILL, skill_copy, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            manager = skill_copy / "scripts/governance.py"
            repo = base / "repo"
            repo.mkdir()
            self.run_mgr(repo, "init", manager=manager)
            target = repo / ".agents/notes/README.md"
            target.write_text(target.read_text() + "\n项目 override。\n")
            self.run_mgr(repo, "upgrade", expect=2, manager=manager)
            self.run_mgr(repo, "resolve", ".agents/notes/README.md", "--mode", "keep-local", manager=manager)
            source = skill_copy / "templates/project/.agents/notes/README.md"
            source.write_text(source.read_text() + "\n框架新版本候选。\n")
            out = self.run_mgr(repo, "upgrade", manager=manager)
            self.assertIn("project override 有新框架候选", out.stdout)
            state = json.loads((repo / ".agents/framework.json").read_text())
            self.assertIn(".agents/notes/README.md", state["available_updates"])
            self.run_mgr(repo, "doctor", expect=3, manager=manager)

    def test_resolve_take_framework_and_detach(self) -> None:
        td, repo = self.init_repo()
        try:
            target = repo / ".agents/AGENTS.md"
            target.write_text("local\n")
            self.run_mgr(repo, "upgrade", expect=2)
            self.run_mgr(repo, "resolve", ".agents/AGENTS.md", "--mode", "take-framework")
            state = json.loads((repo / ".agents/framework.json").read_text())
            self.assertEqual(state["managed_files"][".agents/AGENTS.md"]["ownership"], "framework-managed")
            self.run_mgr(repo, "resolve", ".agents/AGENTS.md", "--mode", "detach")
            state = json.loads((repo / ".agents/framework.json").read_text())
            self.assertEqual(state["managed_files"][".agents/AGENTS.md"]["ownership"], "detached")
        finally:
            td.cleanup()

    def test_project_owned_archive_manifest_cannot_be_resolved_over(self) -> None:
        td, repo = self.init_repo()
        try:
            out = self.run_mgr(
                repo,
                "resolve",
                ".agents/notes/archived/manifest.json",
                "--mode",
                "take-framework",
                expect=2,
            )
            self.assertIn("project-owned", out.stdout)
        finally:
            td.cleanup()

    def test_install_optional_github_actions_ci(self) -> None:
        td, repo = self.init_repo()
        try:
            workflow = repo / ".github/workflows/agent-governance.yml"
            self.assertFalse(workflow.exists())
            self.run_mgr(repo, "install-ci", "--provider", "github-actions")
            self.assertTrue(workflow.exists())
            self.assertIn("governance_check.py", workflow.read_text())
            self.run_mgr(repo, "doctor")
        finally:
            td.cleanup()

    def test_manager_lock_prevents_concurrent_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as td_name:
            repo = Path(td_name) / "repo"
            repo.mkdir()
            lock = repo / ".agents/.governance/manager.lock"
            lock.parent.mkdir(parents=True)
            lock.write_text("pid=999\n")
            out = self.run_mgr(repo, "init", expect=2)
            self.assertIn("治理管理锁已存在", out.stdout)
            self.run_mgr(repo, "unlock", "--force")
            self.run_mgr(repo, "init")

    def test_same_version_sync_updates_unmodified_templates(self) -> None:
        with tempfile.TemporaryDirectory() as td_name:
            base = Path(td_name)
            skill_copy = base / "agent-governance"
            shutil.copytree(SKILL, skill_copy, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            manager = skill_copy / "scripts/governance.py"
            repo = base / "repo"
            repo.mkdir()
            self.run_mgr(repo, "init", manager=manager)
            target = repo / ".agents/AGENTS.md"
            before = target.read_text()
            source = skill_copy / "templates/project/.agents/AGENTS.md"
            source.write_text(source.read_text() + "\n同版本模板同步标记。\n")
            self.run_mgr(repo, "upgrade", manager=manager)
            self.assertNotEqual(before, target.read_text())
            self.assertIn("同版本模板同步标记", target.read_text())

    def test_package_metadata_and_adapters(self) -> None:
        root_skill = (SKILL / "SKILL.md").read_text()
        frontmatter = root_skill.split("---", 2)[1]
        self.assertIn("name: agent-governance", frontmatter)
        self.assertNotIn("disable-model-invocation", frontmatter)
        openai = (SKILL / "agents/openai.yaml").read_text()
        self.assertIn("allow_implicit_invocation: false", openai)
        manifest = json.loads((SKILL / "templates/manifest.json").read_text())
        targets = {x["target"] for x in manifest["files"]}
        for name in ("agent-note", "agent-note-maintenance", "project-governance"):
            self.assertIn(f".agents/skills/{name}/agents/openai.yaml", targets)
            self.assertIn(f".claude/skills/{name}/SKILL.md", targets)

    def test_package_checksum_verifier(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(PACKAGE_VERIFY)], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False
        )
        self.assertEqual(proc.returncode, 0, proc.stdout)


if __name__ == "__main__":
    unittest.main()

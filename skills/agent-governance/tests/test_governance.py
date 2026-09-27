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


class GovernanceTests(unittest.TestCase):
    def run_mgr(self, repo: Path, *args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
        proc = subprocess.run(
            [sys.executable, str(MANAGER), *args, "--project-root", str(repo)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        self.assertEqual(proc.returncode, expect, proc.stdout)
        return proc

    def test_bundle_version_is_fixed_unreleased_version(self) -> None:
        self.assertEqual((SKILL / "VERSION").read_text(encoding="utf-8").strip(), "0.0.1")
        manifest = json.loads((SKILL / "templates/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["framework"]["version"], "0.0.1")
        self.assertNotIn("schema_version", manifest["framework"])
        self.assertNotIn("template_version", manifest["framework"])

    def test_init_note_verify_and_conflict_preservation(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            (repo / "AGENTS.md").write_text("# 项目规则\n\n保留这句话。\n", encoding="utf-8")

            self.run_mgr(repo, "init")
            agents = (repo / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("保留这句话。", agents)
            self.assertIn("agent-governance:begin", agents)
            self.assertTrue((repo / ".agents/framework.json").exists())

            creator = repo / ".agents/scripts/new_agent_note.py"
            note_proc = subprocess.run(
                [
                    sys.executable,
                    str(creator),
                    "proposed",
                    "architecture",
                    "稳定事件所有权",
                    "--slug",
                    "stable-event-ownership",
                    "--root",
                    str(repo),
                    "--date",
                    "2026-09-25",
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
            self.assertEqual(note_proc.returncode, 0, note_proc.stdout)
            note = repo / ".agents/notes/proposed/architecture/2026-09-25-stable-event-ownership.md"
            self.assertTrue(note.exists())
            self.assertIn("## 问题", note.read_text(encoding="utf-8"))

            doctor = self.run_mgr(repo, "doctor")
            self.assertIn("Agent Note 校验通过", doctor.stdout)

            managed = repo / ".agents/notes/README.md"
            original = managed.read_text(encoding="utf-8")
            managed.write_text(original + "\n本地定制。\n", encoding="utf-8")
            sync = self.run_mgr(repo, "upgrade", expect=2)
            self.assertIn("已保护的冲突", sync.stdout)
            self.assertIn("本地定制。", managed.read_text(encoding="utf-8"))
            incoming = repo / ".agents/.governance/incoming/current/.agents/notes/README.md.incoming"
            self.assertTrue(incoming.exists())

            managed.write_text(incoming.read_text(encoding="utf-8"), encoding="utf-8")
            self.run_mgr(repo, "upgrade")
            state = json.loads((repo / ".agents/framework.json").read_text(encoding="utf-8"))
            self.assertEqual(state["pending_conflicts"], [])
            self.assertEqual(state["installed_version"], "0.0.1")
            self.assertEqual(state["notes"]["mode"], "single-file")

    def test_note_slug_must_be_ascii_kebab_case(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            self.run_mgr(repo, "init")
            creator = repo / ".agents/scripts/new_agent_note.py"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(creator),
                    "proposed",
                    "architecture",
                    "稳定事件所有权",
                    "--slug",
                    "稳定事件所有权",
                    "--root",
                    str(repo),
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
            self.assertNotEqual(proc.returncode, 0, proc.stdout)
            self.assertIn("英文小写 kebab-case", proc.stdout)

    def test_note_filename_and_body_language(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            self.run_mgr(repo, "init")
            creator = repo / ".agents/scripts/new_agent_note.py"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(creator),
                    "implemented",
                    "process",
                    "治理模板同步策略",
                    "--slug",
                    "governance-template-sync-policy",
                    "--root",
                    str(repo),
                    "--date",
                    "2026-09-25",
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stdout)
            note = repo / ".agents/notes/implemented/process/2026-09-25-governance-template-sync-policy.md"
            self.assertTrue(note.exists())
            text = note.read_text(encoding="utf-8")
            self.assertIn("# Agent Note: 治理模板同步策略", text)
            self.assertIn("Status: implemented", text)
            self.assertIn("## 决策", text)
            self.run_mgr(repo, "doctor")

    def test_adopt_existing_note_without_rewriting_it(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            note_dir = repo / ".agents/notes/proposed/architecture"
            note_dir.mkdir(parents=True)
            note = note_dir / "2026-09-20-existing-decision.md"
            original = """# Agent Note: 已有决策\n\nStatus: proposed\n\n## 问题\n\n问题。\n\n## 提案\n\n提案。\n\n## 考虑过的替代方案\n\n替代方案。\n\n## 验收标准\n\n标准。\n\n## 风险\n\n风险。\n"""
            note.write_text(original, encoding="utf-8")

            self.run_mgr(repo, "adopt")
            self.assertEqual(note.read_text(encoding="utf-8"), original)
            doctor = self.run_mgr(repo, "doctor")
            self.assertIn("Agent Note 校验通过", doctor.stdout)

    def test_same_version_sync_updates_unmodified_templates(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            skill_copy = td / "agent-governance"
            shutil.copytree(SKILL, skill_copy, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            manager = skill_copy / "scripts" / "governance.py"
            repo = td / "repo"
            repo.mkdir()

            def run_local(*args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
                proc = subprocess.run(
                    [sys.executable, str(manager), *args, "--project-root", str(repo)],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    check=False,
                )
                self.assertEqual(proc.returncode, expect, proc.stdout)
                return proc

            run_local("init")
            target = repo / ".agents/AGENTS.md"
            before = target.read_text(encoding="utf-8")

            source = skill_copy / "templates/project/.agents/AGENTS.md"
            source.write_text(source.read_text(encoding="utf-8") + "\n同版本模板同步测试标记。\n", encoding="utf-8")
            self.assertEqual((skill_copy / "VERSION").read_text(encoding="utf-8").strip(), "0.0.1")

            run_local("upgrade")
            after = target.read_text(encoding="utf-8")
            self.assertNotEqual(before, after)
            self.assertIn("同版本模板同步测试标记。", after)
            state = json.loads((repo / ".agents/framework.json").read_text(encoding="utf-8"))
            self.assertEqual(state["installed_version"], "0.0.1")
            self.assertIn("last_sync_at", state)

    def test_init_refuses_conflicting_framework_paths(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            (repo / ".agents").mkdir(parents=True)
            (repo / ".agents/AGENTS.md").write_text("custom\n", encoding="utf-8")
            proc = self.run_mgr(repo, "init", expect=2)
            self.assertIn("请改用 adopt", proc.stdout)
            self.assertFalse((repo / ".agents/framework.json").exists())

    def test_removed_manifest_path_is_reported_but_not_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            skill_copy = td / "agent-governance"
            shutil.copytree(SKILL, skill_copy, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            manager = skill_copy / "scripts" / "governance.py"
            repo = td / "repo"
            repo.mkdir()

            def run_local(*args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
                proc = subprocess.run(
                    [sys.executable, str(manager), *args, "--project-root", str(repo)],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    check=False,
                )
                self.assertEqual(proc.returncode, expect, proc.stdout)
                return proc

            run_local("init")
            rel = ".agents/skills/project-governance/SKILL.md"
            target = repo / rel
            self.assertTrue(target.exists())

            manifest_path = skill_copy / "templates/manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["files"] = [x for x in manifest["files"] if x["target"] != rel]
            manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

            out = run_local("upgrade")
            self.assertTrue(target.exists())
            self.assertIn("孤立托管路径", out.stdout)
            state = json.loads((repo / ".agents/framework.json").read_text(encoding="utf-8"))
            self.assertIn(rel, state["orphaned_managed_paths"])

    def test_coding_agent_metadata_and_invocation_policy(self) -> None:
        root_skill = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        frontmatter = root_skill.split("---", 2)[1]
        self.assertIn("name: agent-governance", frontmatter)
        self.assertIn("description:", frontmatter)
        self.assertNotIn("disable-model-invocation", frontmatter)
        self.assertNotIn("user-invocable", frontmatter)

        openai = (SKILL / "agents/openai.yaml").read_text(encoding="utf-8")
        self.assertIn('display_name: "Agent 项目治理"', openai)
        self.assertIn("allow_implicit_invocation: false", openai)
        self.assertIn("$agent-governance", openai)

        expected = {
            "agent-note": "allow_implicit_invocation: true",
            "agent-note-maintenance": "allow_implicit_invocation: false",
            "project-governance": "allow_implicit_invocation: true",
        }
        manifest = json.loads((SKILL / "templates/manifest.json").read_text(encoding="utf-8"))
        targets = {item["target"] for item in manifest["files"]}
        for name, policy in expected.items():
            rel = f".agents/skills/{name}/agents/openai.yaml"
            self.assertIn(rel, targets)
            metadata = (SKILL / "templates/project" / rel).read_text(encoding="utf-8")
            self.assertIn(policy, metadata)
            self.assertIn(f"${name}", metadata)

    def test_init_installs_project_skill_openai_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            self.run_mgr(repo, "init")
            self.assertIn(
                "allow_implicit_invocation: true",
                (repo / ".agents/skills/agent-note/agents/openai.yaml").read_text(encoding="utf-8"),
            )
            self.assertIn(
                "allow_implicit_invocation: false",
                (repo / ".agents/skills/agent-note-maintenance/agents/openai.yaml").read_text(encoding="utf-8"),
            )
            self.assertIn(
                "allow_implicit_invocation: true",
                (repo / ".agents/skills/project-governance/agents/openai.yaml").read_text(encoding="utf-8"),
            )
            for name in ("agent-note", "agent-note-maintenance", "project-governance"):
                adapter = repo / ".claude/skills" / name / "SKILL.md"
                self.assertTrue(adapter.exists())
                self.assertIn(f".agents/skills/{name}/SKILL.md", adapter.read_text(encoding="utf-8"))
            maintenance_adapter = (
                repo / ".claude/skills/agent-note-maintenance/SKILL.md"
            ).read_text(encoding="utf-8")
            self.assertIn("disable-model-invocation: true", maintenance_adapter)
            self.assertIn("user-invocable: true", maintenance_adapter)


if __name__ == "__main__":
    unittest.main()

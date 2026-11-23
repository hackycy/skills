---
name: agent-note
description: Find and apply relevant engineering decision Notes before planning or editing code; record or update lasting rationale that code, tests, and existing docs do not explain.
---

# Use engineering decision Notes

1. Before planning related changes or first editing code, run `node .agents/notes/runtime/cli.mjs context --paths <affected-paths> --topic <topic>` from the project root. Read relevant returned Notes with `show <id> --json` or their paths. Include both sides of renames and new/deleted paths; query again when scope or approach changes. Use [explicit archive discovery](../../references/cli.md#归档与全文搜索) for history, not current guidance.
2. Apply the guidance. Record only lasting rationale or rejected alternatives that code, tests, or existing docs cannot explain. A task may finish with zero Notes: mechanical or local edits, vague ideas, and incomplete material do not warrant a new record. If the task permits project edits and the Note is in scope, record without a separate confirmation unless the user or project rules disallow it. Loading this skill, entering Plan, or reviewing read-only does not grant write permission, including for local drafts.
3. Update the facts of the same decision with `update`; use [maintenance](../agent-note-maintenance/SKILL.md) for state transitions. Before drafting any new Note, follow that skill's scoped audit. If it finds the same active decision, update or deliver the existing Note instead. A different decision, including a reconsidered rejection, gets a new record linked to relevant prior Notes.
4. When drafting, read the relevant [write inputs][writing] and `.agents/notes/config.json`. Use `proposed` for a concrete undelivered proposal and `implemented` for an implemented and verified decision. Read `<status>.<language>.md` from the [template directory](../../templates), taking `language` from the config. Draft in `.agents/notes/local/` and replace prompts with actual rationale and evidence. The CLI assigns identity and location on create. Updates need the latest hash from `show`.
5. Preview `create` or `update` with `--input <json-file> --dry-run --json`. For `create`, read any additional same-title or same-topic `data.candidates` and revisit the audit outcome if needed. A match is not proof of duplication or supersession. Resolve diagnostics, then execute without `--dry-run`. Handle confirmed matches in the same PR using the maintenance skill and run `check --maintenance` over the intended delivery scope. If no Note was written or maintained, still run `check` before delivery.

Report affected Note IDs/paths, why the record was warranted, and validation evidence. Deliver required Notes and related code in the same PR; separate commits are fine. Structural checks validate declarations and relationships; authors and reviewers assess lasting value and decision identity.

[writing]: ../../references/writing.md

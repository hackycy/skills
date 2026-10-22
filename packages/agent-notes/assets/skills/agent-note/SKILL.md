---
name: agent-note
description: Record or update an engineering decision after the user requests a Note or accepts a recording suggestion. Use for durable rationale and discarded alternatives that code, tests and existing docs cannot carry.
---

# Record a decision

1. Confirm the record is warranted: explain which durable “why” or discarded alternative would otherwise be lost. Ordinary Plan, mechanical changes and local UI changes can finish with zero Notes. When only suggesting a Note, obtain acceptance before writing; reuse authorization already given for this work.
2. From the project root, run `node .agent-notes/runtime/cli.mjs context --paths <affected-paths> --topic <topic>`. Read relevant IDs with `show <id> --json`. Include both sides of renames and new/deleted paths; requery when scope changes.
3. For the same decision, maintain its facts with `update`. For a different decision, create a new Note and link the old one; use partial/full supersession only for the stated extent. A rejected decision being reconsidered also gets a new Note.
4. Read the relevant section of [write inputs][writing] and the project's `.agent-notes/config.json`. Draft in `.agent-notes/local/` using the configured language: [Chinese proposal][proposal-zh], [English proposal][proposal-en], [Chinese delivered decision][implemented-zh], or [English delivered decision][implemented-en]. Replace prompts with concrete rationale and evidence; create input supplies class/status/rationale, and the CLI assigns identity and location. Updates require the latest hash returned by `show`.
5. Run `create` or `update` with `--input <json-file> --dry-run --json`, resolve diagnostics, then execute the same operation without dry-run. Use the maintenance skill for state transitions, archival and conditional deletion. Run `check` over the intended delivery scope.

Finish with the Note ID/path, why it merits a record and validation evidence. Deliver required Notes and related code in the same PR; separate commits in that PR are fine. Structural checks validate declarations and relationships; authors and reviewers assess whether the rationale is durable and the decision is still the same.

[writing]: ../../references/writing.md
[proposal-zh]: ../../templates/proposed.zh-CN.md
[proposal-en]: ../../templates/proposed.en.md
[implemented-zh]: ../../templates/implemented.zh-CN.md
[implemented-en]: ../../templates/implemented.en.md

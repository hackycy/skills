---
name: agent-note
description: Query relevant engineering decision Notes before planning or editing, read their guidance, and check before delivery. Also record durable rationale when the user requests a Note or accepts a suggestion.
---

# Use engineering decision Notes

1. Before planning related changes or first editing code, run `node .agents/notes/runtime/cli.mjs context --paths <affected-paths> --topic <topic>` from the project root. Read relevant returned Notes with `show <id> --json` or their paths. Include both sides of renames and new/deleted paths; query again when scope or approach changes.
2. Apply the relevant guidance to the task. Before delivery, run `node .agents/notes/runtime/cli.mjs check` over the intended scope; inspect diagnostics and review items. A task may finish with zero Notes. Continue below when durable “why” or discarded alternatives cannot live in code, tests or existing docs: obtain acceptance of a recording suggestion or use the user's explicit request, retaining authorization already given for this work.
3. For the same decision, maintain its facts with `update`. For a different decision, create a new Note and link the old one; use partial/full supersession only for the stated extent. A rejected decision being reconsidered also gets a new Note.
4. Read the relevant section of [write inputs][writing] and the project's `.agents/notes/config.json`. Draft in `.agents/notes/local/` using the configured language: [Chinese proposal][proposal-zh], [English proposal][proposal-en], [Chinese delivered decision][implemented-zh], or [English delivered decision][implemented-en]. Replace prompts with concrete rationale and evidence; create input supplies class/status/rationale, and the CLI assigns identity and location. Updates require the latest hash returned by `show`.
5. Run `create` or `update` with `--input <json-file> --dry-run --json`, resolve diagnostics, then execute the same operation without dry-run. Use the maintenance skill for state transitions, archival and conditional deletion. Run `check` over the intended delivery scope.

Finish with the Note ID/path, why it merits a record and validation evidence. Deliver required Notes and related code in the same PR; separate commits in that PR are fine. Structural checks validate declarations and relationships; authors and reviewers assess whether the rationale is durable and the decision is still the same.

[writing]: ../../references/writing.md
[proposal-zh]: ../../templates/proposed.zh-CN.md
[proposal-en]: ../../templates/proposed.en.md
[implemented-zh]: ../../templates/implemented.zh-CN.md
[implemented-en]: ../../templates/implemented.en.md

---
name: agent-note-maintenance
description: Audit active Agent Notes when adding a Note or reviewing decision history; handle proposal delivery or rejection, supersession, archival, and conditional pruning.
---

# Maintain decision history

## Audit the relevant active Notes

Before drafting a new Note, run `node .agents/notes/runtime/cli.mjs context --paths <affected-paths> --topic <topic>` from the project root, using exact topics. Look for the same decision, mechanism, or rejected alternative; if needed, search the active `proposed/`, `implemented/`, and `rejected/` directories for those terms. Read relevant results with `show <id> --json`. Classify by what remains true or useful, not by title or topic. For a standalone maintenance review, use `check --maintenance --json` for candidates within the requested scope. Neither candidate list is a cleanup queue. Use [explicit archive discovery](../../references/cli.md#归档与全文搜索) for historical comparisons only.

## Resolve confirmed matches in the same PR

| Finding | Action |
| --- | --- |
| Same active decision | Update the existing Note or deliver its proposal after implementation and verification. Rejected Notes retain their proposal and rejection rationale; reconsidering one requires a new Note. |
| Different decision, related or partly replacing the old one | Link the decisions. Use `supersedes` only for the actual replacement scope and only against an implemented or rejected target. Keep partial replacements cross-linked and maintain any facts that still apply. |
| New proposal would fully replace an implemented decision | Record the intended replacement, but keep the old decision current. Reassess when the proposal ships. |
| Shipped decision fully replaces an implemented decision | Keep independent guidance active. If there is none, prune only when a current implemented owner has absorbed all unique content and every active inbound reference can be handled. Otherwise archive eligible history with lasting historical value, or retain the Note if neither action qualifies. |
| Proposed Note is confirmed obsolete or declined | `transition --to rejected` with the real reason; preserve the proposal. A competing proposal alone does not establish that it was declined. |
| Rejected Note is in scope | Keep it while it prevents a plausible mistake. Otherwise `prune` with the reason and explicit handling of all active inbound references. |

Handle known matches as part of adding or delivering the replacement; do not defer them to a general audit. Before making a full replacement effective, resolve any active `requires` that would become invalid. If dependencies, links, the evidence, or the task's write scope block an action, preserve the valid state and report the blocker rather than forcing the change.

## Preview, write, and verify

For the chosen action, read the corresponding [write inputs and recovery](../../references/writing.md). `transition --to implemented` replaces proposal sections with the shipped decision, consequences, and verification. `prune` of an implemented Note requires owner/hash and section coverage for rationale, alternatives, consequences, verification and gaps; full supersession alone is insufficient. Archive only implemented history after resolving current dependencies. Never edit, move, delete, or reseal an existing archive.

Write only within the task's permitted scope and project rules. Refresh hashes with `show`, prepare input in `.agents/notes/local/`, and preview with `--dry-run --json` before executing. Resolve ambiguous references rather than bypassing the CLI. Run `check --maintenance` against the intended Git baseline and review diagnostics. Report affected IDs/paths, the disposition and reason for each confirmed match, and unresolved blockers. No age threshold automatically makes a decision obsolete.

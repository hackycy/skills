---
name: agent-note-maintenance
description: Maintain engineering Notes when delivering or rejecting a proposal, replacing a decision, reviewing stale guidance, archiving implemented history, or conditionally removing an active Note.
---

# Maintain decision history

Run `node .agent-notes/runtime/cli.mjs check --maintenance --json` from the project root for maintenance candidates, or query `context` for a specific change. Read only relevant Notes with `show <id> --json`; retain each current hash for writes. Candidates require judgment and do not authorize automatic cleanup.

Choose the operation by the actual outcome:

| Outcome | Action |
| --- | --- |
| Facts change within the same decision | `update`; rejected Notes permit routing metadata maintenance while their proposal and rejection rationale remain intact |
| Proposal completely delivered | `transition --to implemented`, replacing proposal sections with actual decision, consequences and verification |
| Proposal discussed and not adopted | `transition --to rejected`; preserve the proposal and explain rejection |
| Decision overturned | Create and link a new decision through `agent-note`; partial/full supersession describes only its actual scope |
| Implemented decision still valid but no longer guides current work | `archive` after resolving current requires dependencies |
| Rejected Note has lost prevention value | `prune` with rationale and explicit handling of all active incoming references |
| Another active implemented Note absorbs all unique content | `prune` with owner/hash and section coverage for rationale, alternatives, consequences, verification and gaps; full supersession alone is insufficient |

For the chosen action, read that section of [write inputs and recovery](../../references/writing.md). Prepare explicit input in `.agent-notes/local/`, preview with `--dry-run --json`, then execute and run `check` with the intended Git baseline. The CLI moves files and repairs active references; resolve ambiguous anchors before retrying. Reuse authorization within the current task.

Archive only implemented history. Frozen Notes, paths and seals are immutable: never edit, move, delete or reseal them. Keep a record active when deletion or archive conditions are not met. A proposal that is abandoned first becomes rejected; rejected Notes remain active until they lose prevention value.

Report the affected IDs/paths, reason for each lifecycle change, checks and any semantic review still needed. Keep maintenance and related code in the same PR. No age threshold automatically makes a decision obsolete.

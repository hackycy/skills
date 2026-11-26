#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
package=packages/agent-notes
mkdir -p "$repo/.cache/note-format-adapters"
scratch=$(mktemp -d "$repo/.cache/note-format-adapters/proof.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT
checkout="$scratch/checkout"
mkdir "$checkout"
git -C "$repo" archive HEAD | tar -x -C "$checkout"
# Include candidate files and preserve the user's checkout throughout the experiment.
git -C "$repo" ls-files -z -m -o --exclude-standard -- "$package" |
  (cd "$repo" && tar --null -T - -cf -) |
  tar -xf - -C "$checkout"
cd "$checkout"
git init -q
git add .
git -c user.name='Format Tests' -c user.email='notes@example.invalid' -c commit.gpgsign=false commit -q --no-verify -m 'Candidate'
pnpm install --frozen-lockfile --ignore-scripts
cd "$package"

require_test_failure() {
  local name=$1
  shift
  local log="$scratch/$name.log"
  if pnpm exec vitest run tests/formats/format-adapters.test.ts -t "$1" >"$log" 2>&1; then
    cat "$log"
    echo "Mutant survived: $name" >&2
    exit 1
  fi
  if ! rg -q 'AssertionError|AssertionError:' "$log"; then
    cat "$log"
    echo "Mutant failed before its expected assertion: $name" >&2
    exit 1
  fi
  echo "Killed $name"
}

mutate() {
  python3 - "$@" <<'PY'
from pathlib import Path
import sys
path, old, new = sys.argv[1:]
file = Path(path)
text = file.read_text()
if text.count(old) != 1:
    raise SystemExit(f"Expected one mutation site in {path}: {old}")
file.write_text(text.replace(old, new))
PY
}

entries=tests/formats/entries.ts
assembly=tests/formats/experimental.ts
registry=src/notes/formats/registry.ts
planner=src/workflow/plan.ts
history=src/notes/history.ts
relations=src/notes/relations.ts

mutate "$entries" 'export const v1NoteRegistration' 'const v1NoteRegistration'
mutate "$assembly" 'createRegistry(entries, defaultFormats)' "createRegistry(entries, { ...defaultFormats, note: 'agent-note/2' })"
require_test_failure missing-v1 'reads v1 and v2'
git restore "$entries" "$assembly"

mutate "$entries" "export { v2NoteRegistration } from './adapters/note-v2'" ''
require_test_failure missing-v2 'reads v1 and v2'
git restore "$entries"

mutate "$registry" "if (entry?.read)" "if (entry?.read && format !== 'agent-note/2')"
require_test_failure v2-as-unknown 'reads v1 and v2'
git restore "$registry"

mutate "$registry" "return dispatch('note', carrier.metadata, context.path).adapter.parse(bytes, context, carrier)" "return lookup('note', selected.note)!.adapter.parse(bytes, context, carrier)"
require_test_failure wrong-adapter 'reads v1 and v2'
git restore "$registry"

mutate "$planner" 'note.source.hash !== expectedHash(hash)' 'false && note.source.hash !== expectedHash(hash)'
require_test_failure missing-hash-check 'dry-runs and applies both directions'
git restore "$planner"

mutate "$history" 'next!.source.hash !== prior.source.hash' 'false && next!.source.hash !== prior.source.hash'
mutate "$history" 'if (!isDeepStrictEqual(entry, index.manifest.entries[id])' 'if (false && (!isDeepStrictEqual(entry, index.manifest.entries[id])'
mutate "$history" 'index.notes.get(id)?.value.path !== path) {' 'index.notes.get(id)?.value.path !== path)) {'
require_test_failure missing-freeze 'protects v2 archived bytes'
git restore "$history"

mutate "$relations" "index.allowProposalActivation && note.metadata.status === 'proposed' && edge.activation === 'on-proposal'" 'false'
require_test_failure missing-activation 'uses the same activation rule'
git restore "$relations"

echo 'Checking required adapter imports'
rm src/notes/formats/adapters/{config,manifest,note}-v1.ts
if pnpm exec tsc --noEmit >"$scratch/no-adapters.types" 2>&1; then
  echo 'Type checking survived the removal of the production adapters' >&2
  exit 1
fi
rg -q 'TS2307.*(config-v1|manifest-v1|note-v1)' "$scratch/no-adapters.types"
if pnpm build >"$scratch/no-adapters.build" 2>&1; then
  echo 'Production build survived the removal of the adapters' >&2
  exit 1
fi
rg -qi '(cannot find|could not resolve|unresolved).*(config-v1|manifest-v1|note-v1)' "$scratch/no-adapters.build"
git restore src/notes/formats/adapters

echo 'Checking a same-carrier v3 adapter and one registration'
cp tests/formats/adapters/note-v3.fixture tests/formats/adapters/note-v3.ts
echo "export { v3NoteRegistration } from './adapters/note-v3'" >> "$entries"
test "$(git diff --name-only --relative)" = "$entries"
test "$(git diff --numstat --relative)" = "$(printf '1\t0\t%s' "$entries")"
test "$(git ls-files --others --exclude-standard -- .)" = 'tests/formats/adapters/note-v3.ts'
pnpm exec tsx tests/formats/v3-proof.ts
pnpm exec vitest run tests/reader.test.ts tests/formats/{architecture,roundtrip,format-adapters}.test.ts

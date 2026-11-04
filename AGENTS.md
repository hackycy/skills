# Repository Guidelines

## Project Structure & Module Organization

This repository contains agent skills and TypeScript CLI packages. Each standalone skill is self-contained in
`skills/<skill-name>/`: `SKILL.md` is the entry point, `agents/openai.yaml`
contains agent metadata when needed, and `references/` or `rules/` holds
supporting material. Keep a skill's documentation and its supporting files in
that directory. CLI packages live in `packages/`; `packages/agent-notes/`
contains the Notes CLI, stable document contracts, runtime and installable skill
assets. Install those assets through the CLI. Root configuration lives in
`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, and `eslint.config.js`.

When maintaining Agent Notes, read [its package guidelines](packages/agent-notes/AGENTS.md)
for the product constraints, contract references and change-specific validation.

Use lowercase kebab-case for skill directories and related files, for example
`skills/product-interface-design/`. Keep Markdown links relative to the file
that owns them.

## Install, Lint, and Type-Check

- `pnpm install` installs dependencies using the package manager pinned in `package.json`.
- `pnpm lint` runs ESLint across the repository. It intentionally ignores
  `skills/**`, so validate changed Markdown and YAML links manually.
- `pnpm exec tsc --noEmit` type-checks TypeScript with the repository's strict
  compiler settings. Run it when changing TypeScript or its configuration.
- `pnpm test` runs package tests with Vitest.
- `pnpm --filter @hackycy/agent-notes build` builds the standalone Notes CLI.

The pre-commit hook verifies the frozen lockfile and runs lint-staged with ESLint.
Do not rely on it to check documentation changes.

## Coding and Documentation Style

Write TypeScript as strict ESM and follow the Antfu ESLint configuration. Match
the existing two-space indentation, single quotes, and no-semicolon style.
Prefer focused edits over unrelated formatting changes.

For skills, begin `SKILL.md` with YAML frontmatter containing a stable `name`
and precise `description`, then use concise Markdown headings. Put optional,
on-demand detail in `references/` rather than duplicating it in the entry point.

## Testing Guidelines

Use `pnpm lint` for all changes and run the TypeScript check and relevant Vitest
tests for code changes. Manually verify skill links, referenced paths, and
examples. For Notes distribution changes, pack the actual package and run
`pnpm --filter @hackycy/agent-notes test:bundle <absolute-cli-path>` against its
extracted CLI outside the checkout; the test accepts an optional Node executable
and another version's CLI for upgrade/downgrade checks. No coverage threshold is
configured.

## CLI Releases

Release only when explicitly requested. Each CLI versions independently; the
root stays private. Register packages/builds in
[`scripts/release/packages.json`](scripts/release/packages.json). Only the
selected CLI and required public runtime dependencies publish, dependencies
first. Internal dependencies use `workspace:*` and pack into exact versions.

Start from clean `main` synchronized with `origin/main`, with nonempty CLI
`CHANGELOG.md` Unreleased notes. Use macOS/Linux, Node 24, npm >=12.2.0, pinned
pnpm, authenticated GitHub CLI and Git push access. Local mode requires npm web
login and 2FA. Bootstrap new packages locally at `0.1.0`, then configure each
package's GitHub trusted publisher for this repository and `release.yml`, with
direct publish/dist-tag permission; first use it within npm's two-day window.

```sh
pnpm release --package @hackycy/agent-notes --version 0.1.0 --mode ci --dry-run
pnpm release --package @hackycy/agent-notes --version 0.1.0 --mode local
pnpm release --tag '@hackycy/agent-notes@0.1.0' --mode ci
```

Choose `--mode ci` or `local` explicitly; dry-run is read-only. New releases
prepare versions/changelogs/lockfile, create one version commit and per-package
tags, then atomic push. Both modes run only lint and type checking as release
gates on the exact tagged commit, build/pack isolated source, upload the actual
tarballs, and create GitHub Releases with tarballs/checksums. CI uses OIDC and
waits for workflow completion; pushes alone never publish. Use
`pnpm release --help` for explicit version/notes overrides when inference is ambiguous.

On failure, preserve edits/artifacts and resume fixed targets with `--tag`.
Already-published targets require original tarballs matching npm integrity,
from GitHub Release or local `--artifacts-dir`; missing evidence needs manual
handling. Keep tags immutable and latest moving forward; source fixes require a
higher version. Local mode checks the CI queue and shares a same-machine lock;
avoid concurrent multi-machine releases. Run `pnpm test:release` for release
behavior changes; these development tests are separate from release gates.

## Commits and Pull Requests

Follow the established Conventional Commit style: `feat: add ...`,
`docs(skill-name): update ...`, or `chore(skills): remove ...`. Use an optional
scope for the affected skill or area and write an imperative summary.

Pull requests should state the user-facing effect, list validation performed,
and link the relevant issue when one exists. Include screenshots only when a
change affects rendered UI or visual assets. Keep generated files, local skill
installations, and secrets out of commits.

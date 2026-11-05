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

Release only when explicitly requested. Run locally from a clean working tree
with npm publish access and Git push access to `origin`. Each CLI versions
independently; the root stays private. The entry point discovers public packages
with `bin` under `packages/` and releases only the selected CLI.

```sh
pnpm release
pnpm release --package @hackycy/agent-notes
pnpm release --package @hackycy/agent-notes --version 0.2.0 --yes
```

Omitted package names prompt for a CLI, or select the only candidate. Omitted
versions use bumpp's native prompt; `--yes` skips its confirmation. CI and
non-terminal callers must supply `--package`, `--version`, and `--yes`.

bumpp updates only the selected manifest, then runs `npm publish` in that
package using its existing publish configuration and `prepack` build. After
npm returns success, bumpp creates `chore(release): <name>@<version>` and the
`<name>@<version>` tag. The entry point atomically pushes the current branch and
that tag to `origin`. CHANGELOG history is left as-is; GitHub Releases are not
created. Lint, type checking and tests remain development checks rather than
release gates; run `pnpm test:release` when changing release behavior.

If npm fails, preserve the version edit and investigate before retrying. If Git
fails after npm returns success, finish the reported Git step manually rather
than rerunning publication. The script preserves the current state without
automatic rollback or recovery.

## Commits and Pull Requests

Follow the established Conventional Commit style: `feat: add ...`,
`docs(skill-name): update ...`, or `chore(skills): remove ...`. Use an optional
scope for the affected skill or area and write an imperative summary.

Pull requests should state the user-facing effect, list validation performed,
and link the relevant issue when one exists. Include screenshots only when a
change affects rendered UI or visual assets. Keep generated files, local skill
installations, and secrets out of commits.

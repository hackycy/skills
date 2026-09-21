# Repository Guidelines

## Project Structure & Module Organization

This repository publishes agent skills. Each skill is self-contained in
`skills/<skill-name>/`: `SKILL.md` is the entry point, `agents/openai.yaml`
contains agent metadata when needed, and `references/` or `rules/` holds
supporting material. Keep a skill's documentation and its supporting files in
that directory. `scripts/cli.ts` contains the TypeScript CLI scaffold; root
configuration lives in `package.json`, `tsconfig.json`, and `eslint.config.js`.

Use lowercase kebab-case for skill directories and related files, for example
`skills/product-interface-design/`. Keep Markdown links relative to the file
that owns them.

## Install, Lint, and Type-Check

- `pnpm install` installs dependencies using the pinned pnpm 10 package manager.
- `pnpm lint` runs ESLint across the repository. It intentionally ignores
  `skills/**`, so validate changed Markdown and YAML links manually.
- `pnpm exec tsc --noEmit` type-checks TypeScript with the repository's strict
  compiler settings. Run it when changing `scripts/` or TypeScript config.

The pre-commit hook runs `pnpm lint-staged`, which fixes staged JavaScript and
TypeScript files with ESLint. Do not rely on it to check documentation changes.

## Coding and Documentation Style

Write TypeScript as strict ESM and follow the Antfu ESLint configuration. Match
the existing two-space indentation, single quotes, and no-semicolon style.
Prefer focused edits over unrelated formatting changes.

For skills, begin `SKILL.md` with YAML frontmatter containing a stable `name`
and precise `description`, then use concise Markdown headings. Put optional,
on-demand detail in `references/` rather than duplicating it in the entry point.

## Testing Guidelines

No automated test framework, test command, or coverage threshold is currently
configured. Use `pnpm lint` for all changes and run the TypeScript check for
code changes. Manually verify skill links, referenced paths, and examples;
include focused tests and their run command when adding executable behavior.

## Commits and Pull Requests

Follow the established Conventional Commit style: `feat: add ...`,
`docs(skill-name): update ...`, or `chore(skills): remove ...`. Use an optional
scope for the affected skill or area and write an imperative summary.

Pull requests should state the user-facing effect, list validation performed,
and link the relevant issue when one exists. Include screenshots only when a
change affects rendered UI or visual assets. Keep generated files, local skill
installations, and secrets out of commits.

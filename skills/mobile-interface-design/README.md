# mobile-interface-design

An Agent Skill for designing and implementing distinctive mobile-first H5 interfaces when there is no UI designer or mockup.

It is **page-scoped by default and product-aware when context exists**: a new page can receive a composition appropriate to its task without silently inventing a second visual system inside an existing app.

## What it does

The skill uses a design-search loop rather than jumping directly from requirements to CSS:

1. preserves product truth and existing behavior;
2. infers the dominant mobile outcome/use mode;
3. extracts product-native material without forcing visible theming;
4. explores structural alternatives when the structure is genuinely open;
5. chooses a semantic expression profile instead of numeric taste scores;
6. runs an **Authored-Idea Gate** — a special signature is optional;
7. commits a concrete page-level Visual Contract while inheriting existing product conventions;
8. builds real UI in the project's stack or HTML/CSS/JS;
9. renders and critiques the result when browser tooling is available;
10. runs replacement, continuity, authorship, and squint tests;
11. uses a lightweight static validator for mobile correctness and high-confidence generated-UI smells.

## Why this version changes the design-search rules

A design method can become a template too. Requiring every page to have one primary CTA, one signature idea repeated three times, a numeric taste profile, or a named composition pattern creates a new kind of generated sameness.

This version keeps the useful search-and-critique loop while making expression conditional on the task:

- a monitoring page may need scan anchors rather than one focal object;
- a settings or verification screen may need no page-specific signature;
- domain knowledge may shape information architecture without becoming a visible motif;
- an existing product should usually inherit its own typography, controls, color semantics, navigation, and motion character.

## Core flow

```text
requirement
-> product truth
-> use mode
-> domain material
-> composition search when needed
-> semantic expression profile
-> authored-idea gate
-> visual contract
-> implementation
-> rendered critique
-> de-template + continuity audit
-> refinement
```

## Install

Copy the `mobile-interface-design` directory into the skills directory used by your coding agent. Keep `SKILL.md` at the root and keep `resources/`, `examples/`, `scripts/`, `assets/`, and `agents/` beside it.

## Optional dependency

For best results, `mobile-interface-design` may use Anthropic's public `frontend-design` skill when installed. It acts as a visual craft dependency; this skill remains authoritative for mobile hierarchy, use mode, ergonomics, navigation, WebView constraints, and product continuity.

## Browser review

For the full loop, provide a browser/rendering tool such as Playwright or a browser MCP. Around 390px is a useful first review width, then spot-check narrower/wider phone widths and known target devices.

Without rendering, the skill can still perform static reasoning and validation but should not claim visual verification.

## Static validation

```bash
node /path/to/mobile-interface-design/scripts/validate-mobile-h5.mjs ./index.html
```

The validator is intentionally heuristic. Product-specific reasoning and rendered review remain stronger quality signals.

## Design philosophy

The skill combines product-grounded structure, brief divergence before convergence, semantic expression controls, optional authored ideas, concrete implementation tokens, mobile technical constraints, product continuity, rendered critique, and lightweight deterministic validation.

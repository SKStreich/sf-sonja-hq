# HQ specs

Scoping documents that require Sonja's decision-making land here as
**HTML** (not markdown), one self-contained file per spec.

This directory mirrors the convention used in
[`sf-ops/docs/specs/`](https://github.com/Streich-Force-Enterprises/sf-ops/tree/main/docs/specs).

## The convention

- **Format:** one `.html` file, no external CSS/JS deps. Inline `<style>`,
  embedded SVG for diagrams. Loads from `file://`.
- **Why HTML, not markdown:** visual flow, schema diagrams, decision
  matrices. Sonja reviews these — markdown prose doesn't scan well for
  decisions. Markdown is fine for Claude's internal scratch context.
- **Filename:** `hq_<topic>_v<N>.html` — e.g. `hq_auth-and-roles_v1.html`.
  Bump `v<N>` on revision; never overwrite a finalized spec.
- **Each spec includes:** visual flow / diagrams, an "Open Questions"
  block, a "Recommendations" callout, and an "Open Decisions" matrix
  where Sonja ticks options.

## Lifecycle

1. **Draft** lives here, version-controlled.
2. **Finalized** (Sonja signs off on the decisions inside): upload to
   Sonja HQ as a knowledge document under the relevant project.
3. **Revisions** save as a new versioned file (`_v2.html`, `_v3.html`,
   ...) AND a new HQ knowledge doc — never overwrite. Each revision
   starts with a "What changed" section summarizing deltas from the
   prior version.

## Current specs

_None yet — this directory was scaffolded in PR for action 15 of the
cross-project audit (HQ Alignment Sprint)._

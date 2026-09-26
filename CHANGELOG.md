# Changelog

All notable changes to `@rathnasgala2/theme-tooling` are documented here.

## Unreleased

### Added

- Initial extraction from the five `@rathnasgala2/theme-*` repositories'
  identical `tooling/scripts` and `tooling/test` (2026-09-25 code-discipline
  review, THD-M6): one shared implementation of every conformance/release
  gate, with the packed file list and stylesheet list derived once from
  each calling theme's own `package.json` (`scripts/packed-files.mjs`)
  instead of hardcoded independently in five places.
- `scripts/check-css-grammar.mjs` (THD-M4): a closed CSS property/at-rule
  allowlist plus a per-file rule-count ceiling — `check-css-hooks.mjs`
  validated selectors only.
- `scripts/check-budgets.mjs` (THD-M3): enforces `theme.json.budgets`
  against the theme's own real packed files; previously declared and never
  checked.
- Four additional `contrast:check` pairs the reference themes' CSS
  actually renders and the original thirteen did not cover (THD-M2):
  muted text and links on `color-surface`, selected text, and `color-accent`
  used as a non-text UI color.
- `bin/cli.mjs`, the single dispatcher every theme's `tooling/run.mjs`
  calls, resolved via the `GALA_THEME_TOOLING_DIR` override documented in
  README "Status: not yet published".

### Changed

- `generate-theme-digests.mjs --check` now copies the theme's packed file
  set into a scratch directory and diffs the regenerated `theme.json`
  against the committed one, instead of running the generator over the
  real file and comparing two generations of the same run (THD-H2). The
  un-flagged `digest:generate` step is no longer part of `verify` (THD-H4).
- `check-forbidden-constructs.mjs`'s external-reference pattern now also
  rejects `url(data:...)`/`url(blob:...)`, not only `http(s)://` and
  protocol-relative references (THD-L4).
- `evidenceDigest` now binds a hash of each local runner's actual captured
  output, not only its pass/fail disposition (THD-M5): a runner that
  starts printing different diagnostics while still exiting zero now
  produces a different digest.
- The closed `package.json` shape `check-package-file-set.mjs` enforces
  widened from `['files','license','name','version']` to
  `['files','license','name','repository','version']`, and now validates
  `repository`'s shape (THD-H6): `npm publish --provenance` cannot build a
  provenance statement without a `repository` field, and the four-key shape
  made that field impossible to add.

### Removed

- `tooling-drift.test.mjs` and its `t.skip`-in-CI failure mode (THD-H3):
  superseded by this package existing at all. There is one copy of this
  tooling now, so there is nothing left to drift.

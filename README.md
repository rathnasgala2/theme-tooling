# `@rathnasgala2/theme-tooling`

Shared dev/test/SBOM/release tooling for the five `@rathnasgala2/theme-*`
packages (`theme-default`, `theme-minimal`, `theme-amaze`, `theme-flashy`,
`theme-zebra`).

## Why this exists

Before this package, each theme repository carried its own byte-for-byte
copy of 25 files under `tooling/scripts` and `tooling/test`, with the
packed file list independently hardcoded in three of those scripts (and
the stylesheet list a fourth and fifth time) — five copies to keep in
sync by hand, guarded only by a drift test that never ran in CI (2026-09-25
code-discipline review, THD-M6/THD-H3). This package is the single
implementation; the five theme repositories depend on it instead of
carrying their own copy.

## Status: not yet published

This package is **not on the npm registry** (publishing it is an owner
decision — see the parent review's THD-M6 remediation). Until it is
published, no theme repository can add it as an ordinary pinned
`devDependency` (`npm ci` cannot install a version that does not exist on
the registry, and a `file:` specifier is not acceptable for CI — it
resolves to a path that does not exist on a fresh checkout).

Every theme repository therefore resolves this package **only** through
`GALA_THEME_TOOLING_DIR`, an environment variable pointing at a checkout
of this repository, via each theme's `tooling/run.mjs`:

```sh
GALA_THEME_TOOLING_DIR=../../theme-tooling npm --prefix tooling run verify
```

If `GALA_THEME_TOOLING_DIR` is unset, `run.mjs` fails closed with an error
naming exactly what to set it to — it does not fall back to a relative
default or to `node_modules`, because until publication there is nothing
reliable to fall back to.

In CI, every theme's `.github/workflows/{ci.yml,release.yaml,nightly.yml}`
checks out this repository to a pinned commit alongside the theme's own
checkout (the same pattern already used for the `@rathnasgala2/template`
sibling checkout), installs its dependencies once, and sets
`GALA_THEME_TOOLING_DIR` for the rest of the job.

**Once this package is published** (owner decision, together with the
version to publish), each theme's `tooling/package.json` should add it as
a normal pinned `devDependency`, `tooling/run.mjs` should resolve it via
the installed `node_modules` copy by default, and `GALA_THEME_TOOLING_DIR`
should become a local-dev-only override for iterating on this package
against a theme before a new tooling version is cut. That change is not
made in this pass, so today's only path is the override.

## What a theme repository looks like on top of this package

A theme's own `tooling/` directory carries exactly one file of its own,
`run.mjs` (a few lines: resolve `GALA_THEME_TOOLING_DIR` or fail closed,
then spawn `bin/cli.mjs` from that checkout with this theme's `tooling/`
directory as the child's cwd) plus a minimal `package.json` whose
`scripts` are all one-line calls into `run.mjs`. Every check, every test,
every release gate is implemented here and simply operates against
whichever theme's `tooling/` directory it was invoked from
(`resolveThemeRoot()`'s cwd-relative default).

## Package layout

- `bin/cli.mjs` — the dispatcher every theme's `run.mjs` calls; owns the
  `verify` sequence (THD-M11: kept in one place, so the README describing
  it can never drift from what actually runs).
- `scripts/` — one implementation per gate: schema, CSS-hook and CSS-grammar
  (property/at-rule/rule-count) conformance, WCAG contrast, budgets, the
  closed packed-file-set and forbidden-construct absence checks, the
  digest cycle, SBOM currency, workflow-pin/drift checks. `packed-files.mjs`
  derives every packed-file and stylesheet list from the calling theme's
  own `package.json` at run time — the single fix for THD-M6's "hardcoded
  in five places, one for the file list and four/five more for the
  stylesheet list."
- `test/` — the corresponding `node:test` suites, parametrized by
  `process.cwd()` (the calling theme), not by this package's own location.
  `tooling-drift.test.mjs` does not exist here: THD-H3's drift gate is
  superseded by this package existing at all — there is nothing left to
  drift, since there is only one copy.

## Digest cycle (`digest:check`, THD-H2/H4)

`digest:generate` (local dev only, never part of `verify` or CI) rewrites
the calling theme's real `theme.json` in place. `digest:check` (part of
`verify`) never touches the real file: it copies the theme's packed file
set into a scratch directory, regenerates the digest chain there, and
diffs the result against the committed `theme.json`. A committed
`theme.json` with a stale asset digest, a stale `integrity`, or digests
copied from another theme now fails this check — previously `--check` ran
the generator over the real file first and compared two generations of
the same run, which could never fail regardless of what was committed.

`fixtureDigest`/`evidenceDigest` remain this package's own genuine local
conformance evidence (five runner IDs this package can execute without a
browser), not the DEC-097-mandated shared fixture release the
not-yet-existing S2-T11 reusable CI workflow will eventually produce.
Unlike the original implementation, `evidenceDigest` now binds a hash of
each runner's actual captured output, not only its pass/fail disposition,
so it changes if a runner's diagnostics change even when it keeps exiting
zero (THD-M5).

## Property/at-rule/volume conformance (`grammar:check`, THD-M4)

`css:check` validates selectors only (the closed hook catalog). `grammar:check`
closes the gap the review found: a closed CSS property allowlist (derived
from every property the five reference themes actually use, plus any
`--gala-*` custom property), a closed at-rule allowlist (`@layer`,
`@media`), and a per-file rule-count ceiling.

## Budgets (`budgets:check`, THD-M3)

Enforces `theme.json.budgets` (`maximumFileBytes`, `maximumTotalBytes`,
`maximumFiles`) against the theme's own real packed files. Template-side
enforcement is out of scope here (TPL-H1/TPL-C2).

## Contrast pairs (`contrast:check`, THD-M2)

The pair list is still hand-maintained (deriving it by walking the parsed
stylesheet was judged not worth the added parser surface for five small
files), but it now also covers the pairs the reference CSS actually
renders and the review found missing: muted text and links on `surface`,
selected text, and `accent` used as a non-text UI color.

## Verify sequence

`verify` runs, in order: `format:check`, `lint`, `schema:check`,
`css:check`, `grammar:check`, `contrast:check`, `budgets:check`,
`package:check`, `absence:check`, `schema-pin:check`, `digest:check`,
`test`, `duplication`, `sbom:check`, `audit`, `workflows:check`. This list
is generated from `bin/cli.mjs`'s own `VERIFY_SEQUENCE`, so this
paragraph and the code it describes cannot drift the way THD-M11 found.

## Developing this package

```sh
source ~/.nvm/nvm.sh && nvm use 24.18.0
npm install
npm run verify
```

This package's own `verify` (format, lint, its own unit tests, duplication,
audit) is unrelated to a theme's `verify`; a theme's `tooling/run.mjs`
never calls it.

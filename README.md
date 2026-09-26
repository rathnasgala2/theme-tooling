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

## Status: versioned, not on npm

This package is versioned (`0.1.0`, tagged `v0.1.0`) but **not published to
the npm registry** — publishing it there is a separate owner decision (see
the parent review's THD-M6 remediation) and has not been made. No theme
repository can add it as an ordinary pinned `devDependency` (`npm ci`
cannot install a version that does not exist on the registry, and a
`file:` specifier is not acceptable for CI — it resolves to a path that
does not exist on a fresh checkout).

It is versioned 0.1.0 and consumed by the theme repos via a pinned
checkout, not from npm. Every theme repository therefore resolves this
package **only** through `GALA_THEME_TOOLING_DIR`, an environment variable
pointing at a checkout of this repository, via each theme's
`tooling/run.mjs`:

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
  stylesheet list." `contrast-pairs.json` is the configurable pair list
  `check-contrast.mjs` reads (see "Contrast pairs" below); `visual-check.mjs`
  and `visual-fixture.mjs` are the shared Playwright + axe-core harness
  (see "Visual/accessibility check" below), not part of `verify`.
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

`digest:check`'s regenerated `theme.json` depends on the exact bytes of the
runner scripts under `scripts/` (`fixtureRelease.runners[].executableDigest`
is a hash of each script's own source, and `evidenceDigest` binds each
runner's captured output). A change to this package's tooling — even a
formatting-only one, such as the `check-package-file-set.mjs` reformat that
fixed its Prettier drift — changes those bytes and therefore the digest
chain every theme's committed `theme.json` was generated against. Each of
the five theme repositories must run `digest:generate` and commit the
resulting `theme.json` after picking up a new commit of this package, or
its own `digest:check` will fail; this is the responsibility of that
theme's own maintenance pass, not something this repository does on the
themes' behalf.

`theme.json`'s digest chain is a function of the exact bytes of every
member of the theme's own packed file set (`packed-files.mjs`), and that
set is not only the `.css` files declared in `package.json.files` — it is
always `package.json`, `README.md` and `LICENSE` _plus_ those declared
files, because npm always includes the first three in a published
tarball regardless of `files`. This means editing a theme's own
`README.md` (a changelog entry, a badge, a typo fix) changes
`evidenceDigest`/`integrity` exactly as editing a stylesheet would, and
`digest:generate` must be re-run and its output re-committed afterward.
Two checkouts that look "identical" but were not diffed byte-for-byte
(for example, two worktrees of the same theme where one has an
uncommitted or stale `README.md`) will legitimately regenerate different
digests — this is the digest chain working as designed (binding the
theme's real content, not just its stylesheets), not a path-dependence
bug in the generator itself: `generate-theme-digests.mjs` reads every
packed file strictly by content (`readFile` on the theme's own packed
paths, entries sorted by path — see `packed-files.mjs`/`buildEntries`)
and embeds no absolute path, `cwd`, timestamp, or process-order-dependent
value anywhere in the chain, so byte-identical packed file sets at two
different absolute paths regenerate byte-identical `theme.json` output
(`test/digest-cycle.test.mjs`'s "path independence" case; also verified
locally by running that case in a 30-iteration loop with zero failures).

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

The list itself lives in `scripts/contrast-pairs.json`, not in
`check-contrast.mjs`, so it is a configurable list rather than a literal
only editable by changing the script (`GALA_CONTRAST_PAIRS_PATH`
overrides the file, used by this package's own failing-fixture tests). It
carries three adjacency pairs beyond the original seventeen —
`color-surface-raised` on `color-surface` (>=1.3:1), `color-accent` on
`color-text` (>=3:1), and `color-accent` on `color-surface` (>=3:1) — for
themes whose CSS actually renders those combinations (a flashy/zebra-style
accent-heavy design, for instance). A theme whose current tokens do not
clear one of these floors will see `contrast:check` fail; that is the
gate finding a real gap in the tokens, not a defect in the gate.

## Visual/accessibility check (`visual:check`, THD-M10)

A shared Playwright + axe-core harness (`scripts/visual-check.mjs`,
fixture built by `scripts/visual-fixture.mjs`): renders one rich fixture
publication (headings 1-6, prose, lists, a blockquote, inline and fenced
code) through `@rathnasgala2/template`'s own renderer with the theme under
test, then loads that page in headless Chromium at 320/768/1440px, once
per palette (light/dark, selected through Playwright's `colorScheme`
context option — the template's pre-paint bootstrap script resolves
`prefers-color-scheme` the same way for a real visitor). At each of the
six combinations it runs an axe-core scan (failing on any `serious`/
`critical` violation), asserts there is no horizontal overflow, and writes
a full-page screenshot.

Usage: `node bin/cli.mjs visual:check -- --out <directory>` (from a
theme's `tooling/`, via `run.mjs`) or directly,
`node scripts/visual-check.mjs --out <directory>`. `--out` is required and
the directory is created if needed; screenshots are written there and are
**never committed** — the caller names a scratch location.

**Deliberately not part of `verify`/`VERIFY_SEQUENCE`.** Every other gate
here needs nothing beyond `npm install`; this one needs a browser binary
on disk, which is a separate, explicit, pinned download:

```sh
npx playwright install chromium
```

Run that once (locally, or as its own CI step/job) before
`npm run visual:check`. `playwright` and `axe-core` are exact-pinned
devDependencies (see `package.json`) so the browser version this harness
drives never drifts silently; bump both together, deliberately, when
upgrading. A theme's CI runs `visual:check` as its own job — install
Chromium, then run the script — rather than folding it into `verify` and
silently imposing that install step on every local `npm run verify`.

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

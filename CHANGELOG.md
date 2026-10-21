# Changelog

All notable changes to `@rathnasgala2/theme-tooling` are documented here.

## [0.7.0] - 2026-10-21

### Added

- `schema:check` admits theme contract 4.1.0 (Template 4.4.0's styling
  contract, `templateRange` `^4.4.0`) alongside 4.0.0, through the same
  contract-4 validator path. The conformance and visual tests run for any
  contract-4 theme (4.0.0 or 4.1.0) and never skip a 4.1.0 theme.
- `test/helpers/template-contract.mjs` reads the installed Template's styling
  contract, so no test types its `catalogDigest`.

### Changed

- Schema 3.16.0 (admits contract 4.1.0) and Template 4.4.0 (styling contract
  4.1.0, 225 public hooks) are the exact dev dependencies.
- The unsupported-contract message names 3.x, 4.0.0 and 4.1.0.
- The generation-4 theme matrix expects theme 4.2.0, contract 4.1.0,
  `templateRange` `^4.4.0` and a `stylingContractDigest` equal to the installed
  Template's `catalogDigest`. A theme checkout still at 4.1.0 fails it until it
  is rebuilt as 4.2.0; `WORKSPACE_ROOT` points the matrix at another set of
  `theme-*` checkouts. The archived contract-3 fixture is unchanged.
- The schema tests' contract-4 package is built as 4.1.0 and also cover the
  still-admitted 4.0.0, the `^4.4.0` requirement and the rejection of a later
  contract version; the palette test helper declares contract 4.1.0.
- `check-theme-schema.mjs` changed, so every theme's runner digests change:
  each theme must run `digest:generate` after picking up this release.
- `audit-allowlist.json` accepts four newly published advisories (markdown-it
  GHSA-r7fv-28h4-cvq7 and GHSA-gfr2-rv44-r23c, sanitize-html
  GHSA-x3q4-9hxx-gx8m and GHSA-cv27-6wvh-8x7j) until 2026-11-04. Template 4.4.0
  pins markdown-it 14.3.1 and sanitize-html 2.17.7 exactly; the suite only
  renders its own fixed fixtures. Remove the entries once the Template
  releases with markdown-it 14.3.3 and sanitize-html 2.18.0 or later.

## [0.6.0] - 2026-10-12

### Added

- `palette:check` (`scripts/check-theme-palette.mjs`), part of `verify` after
  `tokens:check`. It requires a valid `palette` block (the schema package's own
  `validateThemePalette`) that binds the three seed tokens; the theme's default
  palette to pass every pair in both modes (each failing pair and mode is
  reported); `components.css` and `print.css` to set no bound token's custom
  property; `tokens.css` to declare no bound token; every palette in the schema
  stress corpus and every golden-vector input to derive through the theme's
  bindings; and every rejected pick to be refused by `checkPickedColours`.

### Changed

- `tokens:generate` omits every key in `palette.follow` from `tokens.css`, and
  `tokens:check` fails when a bound key is present there and expects it absent.
  The theme's `tokens` entries for bound keys stay in `theme.json` (they are
  the default palette and the digest input). A theme without `palette` is
  unaffected.
- Schema 3.10.0 (adds `@rathnasgala2/schemas/palette`) and Template 4.1.0 are the exact dev
  dependencies.

## [0.5.1] - 2026-10-12

### Fixed

- 0.5.0 removed the npm publish job from the theme release workflows and
  forbade it in the release-workflow shape tests. That was wrong: the themes
  are published to the registry from their `release.yaml` (environment `npm`,
  OIDC `id-token: write`, `registry-url`, the already-published check,
  `npm publish --access public --provenance`). The shape tests now require
  that job and its ordering (already-published check, verify, clean working
  tree, pack and artifact upload, provenance dry run, publish) instead of
  forbidding it.
- 0.5.0 vendored Schema, Template, and all six themes as `file:` tarballs.
  Schema 3.8.0 and Template 4.0.0 are now exact registry dev dependencies and
  the themes are no longer dependencies at all; the generation-4 matrix
  verifies the theme checkouts in the workspace (an absent sibling skips). The
  `vendor/` directory, `vendor:check`, and its tests are removed. Theme
  workflows still check out no Template sibling.

### Unchanged

- All generation-4 capabilities: contract 4 checks, compositions, gradient
  contrast, and the shared audit policy.

## [0.5.0] - 2026-10-11

### Changed

- Contract-4 schema coverage now exercises the exact Default/Newsletter,
  Amaze/Editorial, Flashy/Visual, Minimal/Personal, Zebra/Developer, and
  Editorial/Editorial package compositions, including absent, invalid, and
  cross-profile rejection cases.
- Added an integrity-checked source-only package set for Schema 3.8.0,
  Template 4.0.0, and all six generation-4 themes. CI verifies authoritative
  archive digests before `npm ci`; package and lock metadata cannot resolve a
  sibling checkout or mutable registry version.
- Replaced the skip-on-missing sibling-workspace matrix with a mandatory
  installed-package matrix that verifies every theme's identity, exact
  composition, schema, tokens, package shape, CSS hooks/grammar, contrast,
  budgets, passive file set, and digest chain.
- Schema and Template default resolution now uses the installed vendored
  packages. Explicit environment paths remain development overrides only.
- Dispatcher coverage now includes the local-only Editorial theme. Release
  workflow coverage remains limited to the five repositories that already
  carry workflow files; no npm publication is introduced.
- Release workflow checks require local `npm pack` artifacts and reject npm
  publication authority, registry setup, and identity-token writes.
- Concurrent theme verification now derives every scratch path from its own
  temporary root. Visual verification resolves caller paths before changing
  cwd and scans the stable reduced-motion state instead of an offscreen
  scroll-reveal frame.
- Template-4 rendering checks run for contract-4 themes and explicitly skip
  the tooling package's archived contract-3 standalone fixture.
- Theme consumers now run the same expiry-bound dependency-audit policy as
  this package's own verification instead of bypassing its reviewed
  allowlist with a raw `npm audit` invocation.

## [0.4.0] - 2026-10-10

### Changed

- `contrast:check` measures a text colour over a gradient fill against every
  colour stop and reports the minimum as the pair's ratio, naming the worst
  stop. A gradient it cannot read stays `SKIPPED` with the reason and is never
  counted as a pass. Previously every gradient was skipped.
- The tooling's gradient test cases are built from the fixture theme, not the
  hosting theme. The fixture's light panel gradient now clears 4.5:1.

## [0.3.0] - 2026-10-05

### Changed (breaking: theme contract 3 only, no dual support)

- Every check understands the 116-token contract-3 catalog and its typed
  value grammars (`theme-token-catalog.mjs`, mirrored from
  `@rathnasgala2/schemas` 3.0.0 and pinned to its `default-3.0.json`).
  New `tokens:check` and `tokens:generate` commands; `schema:check`
  rejects a `contractVersion` outside 3.x.
- `grammar:check` validates every custom property as a catalog token with a
  grammar-valid value, and admits `box-shadow`, `opacity`, `transform`,
  `filter` (no `url()`), `aspect-ratio`, `object-fit`, `background`,
  per-corner radii, `text-shadow`, `text-align` and `grid-template-columns`.
- `contrast-pairs.json` is replaced by the 17 contract-3 text pairs; pairs
  over gradients or transparent fills are reported as skipped.
- The hook closure check follows the template's published catalog (178
  hooks) instead of a fixed 64.
- New `test/fixtures/theme-default-contract-3` theme fixture; `npm test`
  runs against it by default. The rich build input names the theme under
  test. The contract 2.1.0 readiness suite is removed.
- Dev dependency `@rathnasgala2/schemas` 3.0.0.

## [0.2.0] - 2026-09-26

### Changed

- **THD-M6 (post-mortem)**: a theme's `sbom:generate` no longer runs
  `cyclonedx-npm` against this package's own `package-lock.json` and
  attributes the result to the calling theme's identity — that design
  repeatedly diverged between a local machine and CI, for reasons traced
  to which `cyclonedx-npm`/`cyclonedx-library` release a lockfile scan
  happened to resolve to. It now builds a self-contained CycloneDX
  document directly from the theme's own `name`/`version`
  (`buildThemeOnlySbom`): zero dependency components (a published theme
  ships none), no tool invocation, no `node_modules`, no lockfile read.
  `sbom:check` now asserts generation is deterministic instead of
  diffing against a committed file — the theme's SBOM is no longer
  committed at all; a release workflow generates and uploads it as a
  build artifact instead.
- `ignore-scripts=true` pinned in `.npmrc` so a local `npm ci` and CI's
  `npm ci` install identically.
- This package now carries its own committed `sbom.cdx.json` (its own
  devDependency tree, still `cyclonedx-npm`-generated — a real dependency
  tree, unlike the above), with `sbom:check` in its own `verify`, and its
  own `.github/workflows/ci.yml` running that `verify` against a real
  `theme-default`/`template` checkout.

## [0.1.0] - 2026-09-26

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
  README "Status: versioned, not on npm".

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

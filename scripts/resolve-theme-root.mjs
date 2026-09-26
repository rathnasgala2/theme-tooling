import path from 'node:path';

/**
 * Resolve this package's own repository root — the directory holding
 * `theme.json`, the three packed stylesheets, `package.json`, `README.md`
 * and `LICENSE`.
 *
 * `THEME_ROOT` (DEC-015 name) overrides the default when set to a
 * non-empty string, pointing every conformance/digest script at an
 * isolated copy of the packed file set instead of the real checkout.
 * This is how `digest-cycle.test.mjs` avoids mutating the committed
 * `theme.json` while `node --test` runs suites concurrently:
 * `generate-theme-digests.mjs` rewrites `theme.json` in place, and
 * without an isolated root a concurrently-running reader —
 * `template-conformance.test.mjs`, which loads `theme.json` through the
 * theme package it points `renderPublication` at — can observe a
 * half-written file and fail with a JSON parse error.
 *
 * Every script here runs with `tooling/` as its process cwd (the npm
 * scripts' and `resolve-template-dir.mjs`'s convention), so the
 * cwd-relative default is one level up from there.
 *
 * @returns {string} the absolute repository root directory
 */
export function resolveThemeRoot() {
  const override = process.env.THEME_ROOT;
  return path.resolve(
    override && override.length > 0 ? override : path.resolve('..'),
  );
}

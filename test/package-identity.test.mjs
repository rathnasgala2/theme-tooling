/**
 * Publish's tests found all five `@rathnasgala2/theme-*` repositories at
 * `package.json` version `2.1.0` still carrying `theme.json.package:
 * "@rathnasgala2/theme-<x>@2.0.0"` — a consumer resolving the theme's
 * identity from `theme.json` (rather than `package.json`) throws
 * `THEME_CONTRACT_IDENTITY_MISMATCH`. Nothing in `verify` caught this
 * because `check-theme-schema.mjs` only validates `theme.json` against
 * the theme-contract JSON Schema, which has no way to know what version
 * `package.json` (a sibling file, outside the schema's document) declares.
 * `checkPackageIdentity` closes that gap directly; this fixture is the red
 * case the coordinator asked the gate to catch.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { checkPackageIdentity } from '../scripts/check-package-identity.mjs';

test('checkPackageIdentity: matching identity passes', () => {
  const result = checkPackageIdentity(
    { name: '@rathnasgala2/theme-default', version: '2.1.0' },
    { package: '@rathnasgala2/theme-default@2.1.0' },
  );
  assert.deepEqual(result, { ok: true });
});

test('checkPackageIdentity: a stale theme.json.package version fails closed (the actual 2026-09-26 bug)', () => {
  const result = checkPackageIdentity(
    { name: '@rathnasgala2/theme-default', version: '2.1.0' },
    { package: '@rathnasgala2/theme-default@2.0.0' },
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /2\.0\.0/);
  assert.match(result.message, /2\.1\.0/);
  assert.match(result.message, /THEME_CONTRACT_IDENTITY_MISMATCH/);
});

test('checkPackageIdentity: a mismatched package name also fails closed', () => {
  const result = checkPackageIdentity(
    { name: '@rathnasgala2/theme-default', version: '2.1.0' },
    { package: '@rathnasgala2/theme-minimal@2.1.0' },
  );
  assert.equal(result.ok, false);
});

/**
 * `release.yaml` shape gate across all five theme repositories (THD-H2,
 * THD-H4, THD-H5, THD-H6): none of these properties can be checked by a
 * Node conformance script run *inside* one theme's own `verify`, since the
 * defect is in the workflow YAML itself, not in anything the workflow
 * runs. Reads each sibling theme's `.github/workflows/release.yaml`
 * directly off disk and asserts on its text/step order, which is exactly
 * what THD-H2/H4/H5/H6 required change.
 *
 * The five sibling theme checkouts are resolved the same way
 * `resolve-template-dir.mjs` resolves the template sibling: `THEME_ROOT`'s
 * parent directory is the workspace, defaulting to the fixed relative
 * `../../<theme-name>` from this file's own location if `WORKSPACE_ROOT`
 * is unset. This test is skipped (not failed) for any sibling that is not
 * present on disk, so it degrades gracefully outside the full workspace
 * checkout.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const THEME_NAMES = [
  'theme-default',
  'theme-minimal',
  'theme-amaze',
  'theme-flashy',
  'theme-zebra',
];

/**
 * @param {string} themeName
 * @returns {string} the resolved workflow path (existence is not guaranteed)
 */
function workflowPath(themeName) {
  const workspaceRoot =
    process.env.WORKSPACE_ROOT ?? path.resolve(import.meta.dirname, '..', '..');
  return path.join(
    workspaceRoot,
    themeName,
    '.github',
    'workflows',
    'release.yaml',
  );
}

for (const themeName of THEME_NAMES) {
  test(`${themeName}/.github/workflows/release.yaml: version-reuse check exits non-zero on an already-published version (THD-H5)`, async (t) => {
    const filePath = workflowPath(themeName);
    let yaml;
    try {
      yaml = await readFile(filePath, 'utf8');
    } catch {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const guardMatch = /if npm view[^\n]*version[^\n]*\n([\s\S]*?)fi\n/.exec(
      yaml,
    );
    assert.ok(
      guardMatch,
      'expected an "npm view <name>@<version>" already-published guard',
    );
    assert.match(
      guardMatch[1],
      /exit 1/,
      'the already-published guard must exit non-zero, not merely log and continue',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: git diff --exit-code runs after verify and before npm pack (THD-H4)`, async (t) => {
    const filePath = workflowPath(themeName);
    let yaml;
    try {
      yaml = await readFile(filePath, 'utf8');
    } catch {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const verifyIndex = yaml.indexOf('npm run verify');
    const diffIndex = yaml.indexOf('git diff --exit-code');
    const packIndex = yaml.indexOf('npm pack');
    assert.notEqual(verifyIndex, -1, 'expected a "npm run verify" step');
    assert.notEqual(diffIndex, -1, 'expected a "git diff --exit-code" step');
    assert.notEqual(packIndex, -1, 'expected an "npm pack" step');
    assert.ok(
      verifyIndex < diffIndex && diffIndex < packIndex,
      'expected order: npm run verify, then git diff --exit-code, then npm pack',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: publish exercises --dry-run --provenance before the real publish (THD-H6)`, async (t) => {
    const filePath = workflowPath(themeName);
    let yaml;
    try {
      yaml = await readFile(filePath, 'utf8');
    } catch {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const dryRunIndex = yaml.indexOf(
      'npm publish --access public --provenance --dry-run',
    );
    const realPublishIndex = yaml.lastIndexOf(
      'npm publish --access public --provenance',
    );
    assert.notEqual(
      dryRunIndex,
      -1,
      'expected an "npm publish ... --provenance --dry-run" step',
    );
    assert.ok(
      dryRunIndex < realPublishIndex,
      'the --dry-run provenance check must run before the real publish',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: no step mutates package.json`, async (t) => {
    const filePath = workflowPath(themeName);
    let yaml;
    try {
      yaml = await readFile(filePath, 'utf8');
    } catch {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    assert.doesNotMatch(
      yaml,
      /npm version|npm pkg set|sed -i[^\n]*package\.json/,
      "the release job must publish the reviewed commit's package.json unchanged",
    );
  });
}

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { GENERATION_4_THEMES } from './fixtures/generation-4-themes.mjs';
import { runCheckScript } from './helpers/run-check.mjs';

const CONFORMANCE_CHECKS = [
  ['check-theme-schema.mjs', []],
  ['check-token-values.mjs', []],
  ['check-package-identity.mjs', []],
  ['check-css-hooks.mjs', []],
  ['check-css-grammar.mjs', []],
  ['check-contrast.mjs', []],
  ['check-budgets.mjs', []],
  ['check-package-file-set.mjs', []],
  ['check-forbidden-constructs.mjs', []],
  ['generate-theme-digests.mjs', ['--check']],
];

/**
 * The theme checkout under test: the current repository when the workspace
 * root is that theme (GitHub Actions), otherwise the sibling directory of the
 * local multi-repository workspace. Themes are not dependencies of the
 * tooling, so an absent sibling skips; any other read error fails.
 */
function themeRoot(themeName) {
  const workspaceRoot =
    process.env.WORKSPACE_ROOT ?? path.resolve(import.meta.dirname, '..', '..');
  return path.basename(path.resolve(workspaceRoot)) === themeName
    ? path.resolve(workspaceRoot)
    : path.join(workspaceRoot, themeName);
}

for (const definition of GENERATION_4_THEMES) {
  test(`${definition.name} is a fully conformant generation-4 theme checkout`, async (t) => {
    const root = themeRoot(definition.name);
    let packageDefinition;
    let theme;
    try {
      [packageDefinition, theme] = await Promise.all([
        readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
        readFile(path.join(root, 'theme.json'), 'utf8').then(JSON.parse),
      ]);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        t.skip(`${root} not present on disk`);
        return;
      }
      throw error;
    }
    assert.equal(packageDefinition.version, '4.0.0');
    assert.equal(theme.contractVersion, '4.0.0');
    assert.equal(theme.templateRange, '^4.0.0');
    assert.equal(
      theme.package,
      `${packageDefinition.name}@${packageDefinition.version}`,
    );
    assert.deepEqual(theme.composition, {
      schemaId: 'urn:gala:schema:template-composition:2.0.0',
      schemaVersion: '2.0.0',
      ...definition.composition,
    });

    for (const [script, args] of CONFORMANCE_CHECKS) {
      const { passed, output } = await runCheckScript(script, {
        args,
        env: { THEME_ROOT: root },
      });
      assert.ok(passed, `${definition.name}: ${script} failed\n${output}`);
    }
  });
}

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

function installedThemeRoot(themeName) {
  return path.dirname(
    fileURLToPath(
      import.meta.resolve(`@rathnasgala2/${themeName}/package.json`),
    ),
  );
}

for (const definition of GENERATION_4_THEMES) {
  test(`${definition.name} is the exact fully conformant installed generation-4 package`, async () => {
    const themeRoot = installedThemeRoot(definition.name);

    const [packageDefinition, theme] = await Promise.all([
      readFile(path.join(themeRoot, 'package.json'), 'utf8').then(JSON.parse),
      readFile(path.join(themeRoot, 'theme.json'), 'utf8').then(JSON.parse),
    ]);
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
        env: { THEME_ROOT: themeRoot },
      });
      assert.ok(passed, `${definition.name}: ${script} failed\n${output}`);
    }
  });
}

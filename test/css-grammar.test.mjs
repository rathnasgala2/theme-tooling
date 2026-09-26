import { strict as assert } from 'node:assert';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { loadPackedFileSet } from '../scripts/packed-files.mjs';
import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../scripts/scratch-theme.mjs';
import { runCheckScript } from './helpers/run-check.mjs';

test('every declaration and at-rule is in the closed property/at-rule catalog, within the rule-count ceiling (THD-M4)', async () => {
  const { passed, output } = await runCheckScript('check-css-grammar.mjs');
  assert.ok(passed, output);
});

test('rejects a rule that sets outline-color/outline-width without outline-style (THD-H1: the longhands alone paint nothing)', async () => {
  const themeRoot = resolveThemeRoot();
  const { stylesheets } = await loadPackedFileSet(themeRoot);
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
    const [firstStylesheet] = stylesheets;
    const cssPath = path.join(scratchRoot, firstStylesheet);
    const css = await readFile(cssPath, 'utf8');
    await writeFile(
      cssPath,
      `${css}\n@layer gala-test {\n[data-gala-publication-root] a {\n  outline-color: red;\n  outline-width: 2px;\n}\n}\n`,
      'utf8',
    );

    const { passed, output } = await runCheckScript('check-css-grammar.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(
      passed,
      false,
      'an inert outline-color/outline-width pair with no outline-style must fail check-css-grammar',
    );
    assert.match(
      output,
      /outline-color.*outline-width.*without outline-style/i,
    );
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

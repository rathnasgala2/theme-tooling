import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';
import { withScratchTheme } from './helpers/with-scratch-theme.mjs';

test('the theme under test carries exactly the 116-token catalog, and tokens.css repeats theme.json in all four scopes', async () => {
  const { passed, output } = await runCheckScript('check-token-values.mjs');
  assert.ok(passed, output);
  assert.match(output, /all 116 tokens/);
});

/**
 * @param {(scratchRoot: string) => Promise<void>} mutate edits the scratch theme
 * @returns {Promise<{passed: boolean, output: string}>} the check's outcome
 */
function checkMutated(mutate) {
  return withScratchTheme(async (scratchRoot) => {
    await mutate(scratchRoot);
    return runCheckScript('check-token-values.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
  });
}

test('fails when a theme.json token value breaks its grammar', async () => {
  const { passed, output } = await checkMutated(async (root) => {
    const theme = await readThemeJson(root);
    const token = theme.tokens.find((row) => row.key === 'paint-chip');
    token.light = 'url(https://example.test/x.png)';
    await writeThemeJson(root, theme);
  });
  assert.equal(passed, false);
  assert.match(output, /paint-chip: light value .* is not a valid paint/);
});

test('fails when a mode-invariant token differs between light and dark', async () => {
  const { passed, output } = await checkMutated(async (root) => {
    const theme = await readThemeJson(root);
    const token = theme.tokens.find((row) => row.key === 'space-1');
    token.dark = '2rem';
    await writeThemeJson(root, theme);
  });
  assert.equal(passed, false);
  assert.match(output, /space-1: length tokens must not differ between modes/);
});

test('fails when a token is missing from theme.json', async () => {
  const { passed, output } = await checkMutated(async (root) => {
    const theme = await readThemeJson(root);
    theme.tokens = theme.tokens.filter((row) => row.key !== 'color-text');
    await writeThemeJson(root, theme);
  });
  assert.equal(passed, false);
  assert.match(output, /missing token color-text/);
});

test('fails when tokens.css drifts from theme.json, drops a token, or declares an unknown one', async () => {
  const { passed, output } = await checkMutated(async (root) => {
    const cssPath = path.join(root, 'tokens.css');
    const css = await readFile(cssPath, 'utf8');
    const drifted = css
      .replace(/--gala-space-1: [^;]+;/u, '--gala-space-1: 9rem;')
      .replace(/ *--gala-ease-spring: [^;]+;\n/u, '')
      .replace('--gala-space-2:', '--gala-space-two:');
    await writeFile(cssPath, drifted, 'utf8');
  });
  assert.equal(passed, false);
  assert.match(output, /--gala-space-1 is "9rem"/);
  assert.match(output, /is missing --gala-ease-spring/);
  assert.match(output, /declares unknown --gala-space-two/);
});

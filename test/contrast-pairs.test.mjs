import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { runCheckScript } from './helpers/run-check.mjs';
import { withScratchDir } from './helpers/scratch-dir.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';
import { withScratchTheme } from './helpers/with-scratch-theme.mjs';

/**
 * Theme contract 3 contrast pairs: `contrast-pairs.json` (overridable with
 * `GALA_CONTRAST_PAIRS_PATH`) lists the text pairs the template renders, all
 * at the WCAG AA 4.5:1 floor. Pairs whose background is a `paint-*` token,
 * or whose fill may be transparent (`color-toc-active`), are measurable only
 * when the value is a plain opaque colour; otherwise they are reported as
 * SKIPPED, never silently passed. Each failing fixture below is isolated to
 * exactly one pair (a scratch pair file of one entry) with token values
 * deliberately set below the floor.
 */

const CONTRAST_PAIRS_PATH = path.join(
  import.meta.dirname,
  '..',
  'scripts',
  'contrast-pairs.json',
);

const EXPECTED_PAIRS = [
  ['color-text', 'color-canvas'],
  ['color-text', 'color-surface'],
  ['color-text-muted', 'color-canvas'],
  ['color-text-muted', 'color-surface'],
  ['color-link', 'color-canvas'],
  ['color-chip-text', 'paint-chip'],
  ['color-btn-text', 'paint-button'],
  ['color-btn-panel-text', 'color-btn-panel'],
  ['color-panel-text', 'paint-panel'],
  ['color-code-text', 'color-code-canvas'],
  ['color-syntax-comment', 'color-code-canvas'],
  ['color-syntax-function', 'color-code-canvas'],
  ['color-syntax-keyword', 'color-code-canvas'],
  ['color-syntax-number', 'color-code-canvas'],
  ['color-syntax-string', 'color-code-canvas'],
  ['color-on-accent', 'color-accent'],
  ['color-toc-active-text', 'color-toc-active'],
];

test('scripts/contrast-pairs.json carries exactly the contract-3 text pairs at 4.5:1, paint and toc pairs skippable', async () => {
  const pairs = JSON.parse(await readFile(CONTRAST_PAIRS_PATH, 'utf8'));
  assert.deepEqual(
    pairs.map((pair) => [pair.foreground, pair.background]),
    EXPECTED_PAIRS,
  );
  for (const pair of pairs) {
    assert.equal(pair.minimum, 4.5, pair.label);
    assert.equal(
      pair.skipWhenNotPlainColor === true,
      pair.background.startsWith('paint-') ||
        pair.background === 'color-toc-active',
      `${pair.label}: skipWhenNotPlainColor must be set exactly on paint and toc-active pairs`,
    );
  }
});

/**
 * @param {{label: string, foreground: string, background: string, minimum: number}} pair
 * @param {{key: string, light: string, dark: string}} tokenOverride the
 *   single token row to overwrite in the scratch theme (both palettes)
 * @returns {Promise<{passed: boolean, output: string}>} check-contrast.mjs's outcome
 */
async function checkSinglePairFixture(pair, tokenOverride) {
  return withScratchTheme((scratchRoot) =>
    withScratchDir('contrast-pairs-', async (pairsDirectory) => {
      const pairsPath = path.join(pairsDirectory, 'contrast-pairs.json');
      await writeFile(pairsPath, JSON.stringify([pair]), 'utf8');

      const theme = await readThemeJson(scratchRoot);
      const index = theme.tokens.findIndex(
        (token) => token.key === tokenOverride.key,
      );
      assert.ok(
        index !== -1,
        `fixture assumption: ${tokenOverride.key} must exist`,
      );
      theme.tokens[index] = { ...theme.tokens[index], ...tokenOverride };
      await writeThemeJson(scratchRoot, theme);

      return runCheckScript('check-contrast.mjs', {
        env: {
          THEME_ROOT: scratchRoot,
          GALA_CONTRAST_PAIRS_PATH: pairsPath,
        },
      });
    }),
  );
}

test('fails when color-text-muted is too close to color-surface (< 4.5:1)', async () => {
  const theme = await readThemeJson(resolveThemeRoot());
  const surface = theme.tokens.find((token) => token.key === 'color-surface');
  const { passed, output } = await checkSinglePairFixture(
    {
      label: 'color-text-muted on color-surface',
      foreground: 'color-text-muted',
      background: 'color-surface',
      minimum: 4.5,
    },
    { key: 'color-text-muted', light: surface.light, dark: surface.dark },
  );
  assert.ok(!passed, output);
  assert.match(output, /FAIL/);
});

test('fails when a plain-colour paint-chip is too close to color-chip-text, and skips a gradient one', async () => {
  const pair = {
    label: 'color-chip-text on paint-chip',
    foreground: 'color-chip-text',
    background: 'paint-chip',
    minimum: 4.5,
    skipWhenNotPlainColor: true,
  };
  const theme = await readThemeJson(resolveThemeRoot());
  const text = theme.tokens.find((token) => token.key === 'color-chip-text');
  const failing = await checkSinglePairFixture(pair, {
    key: 'paint-chip',
    light: text.light,
    dark: text.dark,
  });
  assert.ok(!failing.passed, failing.output);
  assert.match(failing.output, /FAIL/);

  const gradient = 'linear-gradient(135deg, #ffffff, #000000)';
  const skipped = await checkSinglePairFixture(pair, {
    key: 'paint-chip',
    light: gradient,
    dark: gradient,
  });
  assert.ok(skipped.passed, skipped.output);
  assert.match(skipped.output, /SKIPPED \(a gradient\)/);
});

test('a pair that is not skippable fails when a side is not a plain opaque colour', async () => {
  const { passed, output } = await checkSinglePairFixture(
    {
      label: 'color-text on color-canvas',
      foreground: 'color-text',
      background: 'color-canvas',
      minimum: 4.5,
    },
    { key: 'color-canvas', light: '#ffffff80', dark: '#00000080' },
  );
  assert.ok(!passed, output);
  assert.match(output, /plain opaque colour is required/);
});

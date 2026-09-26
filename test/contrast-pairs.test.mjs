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
 * Coordinator addendum item C: the contrast pair list is now externalized
 * to `contrast-pairs.json` (`GALA_CONTRAST_PAIRS_PATH` overrides it) and
 * carries three new pairs: `color-surface-raised` on `color-surface`
 * (>=1.3:1), `color-accent` on `color-text` (>=3:1), and `color-accent` on
 * `color-surface` (>=3:1). Each gets its own failing fixture, isolated to
 * exactly that one pair (via a scratch `contrast-pairs.json` of one entry)
 * with token values deliberately set below its floor, independent of
 * whatever the theme under test's own real tokens happen to be.
 */

const CONTRAST_PAIRS_PATH = path.join(
  import.meta.dirname,
  '..',
  'scripts',
  'contrast-pairs.json',
);

test('scripts/contrast-pairs.json carries the four new adjacency pairs alongside the original seventeen', async () => {
  const pairs = JSON.parse(await readFile(CONTRAST_PAIRS_PATH, 'utf8'));
  assert.equal(pairs.length, 21);
  const byLabel = new Map(pairs.map((pair) => [pair.label, pair]));
  assert.equal(
    byLabel.get('color-surface-raised on color-surface (surface adjacency)')
      ?.minimum,
    1.3,
  );
  assert.equal(
    byLabel.get(
      'color-accent on color-text (accent as a non-text UI element near body text)',
    )?.minimum,
    3,
  );
  assert.equal(
    byLabel.get(
      'color-accent on color-surface (accent as a non-text UI element on a raised surface)',
    )?.minimum,
    3,
  );
  assert.equal(
    byLabel.get(
      'color-accent on color-code-canvas (accent as a non-text UI element, e.g. the pre border)',
    )?.minimum,
    3,
  );
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

test('fails when color-surface-raised is nearly identical to color-surface (< 1.3:1)', async () => {
  const { passed, output } = await checkSinglePairFixture(
    {
      label: 'color-surface-raised on color-surface (surface adjacency)',
      foreground: 'color-surface-raised',
      background: 'color-surface',
      minimum: 1.3,
    },
    { key: 'color-surface-raised', light: '#ffffff', dark: '#000000' },
  );
  // color-surface is #ffffff in light / #000000-ish in dark for the
  // reference theme; setting color-surface-raised to the exact same value
  // in both palettes forces a 1:1 ratio, below the 1.3:1 floor.
  assert.ok(!passed, output);
  assert.match(output, /FAIL/);
});

test('fails when color-accent is too close to color-text (< 3:1)', async () => {
  const theme = await readThemeJson(resolveThemeRoot());
  const text = theme.tokens.find((token) => token.key === 'color-text');
  const { passed, output } = await checkSinglePairFixture(
    {
      label: 'color-accent on color-text',
      foreground: 'color-accent',
      background: 'color-text',
      minimum: 3,
    },
    { key: 'color-accent', light: text.light, dark: text.dark },
  );
  // color-accent set to byte-identical to color-text forces a 1:1 ratio.
  assert.ok(!passed, output);
  assert.match(output, /FAIL/);
});

test('fails when color-accent is too close to color-surface (< 3:1)', async () => {
  const theme = await readThemeJson(resolveThemeRoot());
  const surface = theme.tokens.find((token) => token.key === 'color-surface');
  const { passed, output } = await checkSinglePairFixture(
    {
      label: 'color-accent on color-surface',
      foreground: 'color-accent',
      background: 'color-surface',
      minimum: 3,
    },
    { key: 'color-accent', light: surface.light, dark: surface.dark },
  );
  assert.ok(!passed, output);
  assert.match(output, /FAIL/);
});

test('fails when color-accent is too close to color-code-canvas (< 3:1)', async () => {
  const theme = await readThemeJson(resolveThemeRoot());
  const codeCanvas = theme.tokens.find(
    (token) => token.key === 'color-code-canvas',
  );
  const { passed, output } = await checkSinglePairFixture(
    {
      label: 'color-accent on color-code-canvas',
      foreground: 'color-accent',
      background: 'color-code-canvas',
      minimum: 3,
    },
    { key: 'color-accent', light: codeCanvas.light, dark: codeCanvas.dark },
  );
  assert.ok(!passed, output);
  assert.match(output, /FAIL/);
});

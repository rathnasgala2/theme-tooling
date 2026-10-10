import { strict as assert } from 'node:assert';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { buildScratchThemeCopy } from '../scripts/scratch-theme.mjs';

import { runCheckScript } from './helpers/run-check.mjs';
import { withScratchDir } from './helpers/scratch-dir.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';

test('every named token pair clears WCAG 2.2 AA contrast in both the light and dark palette independently', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
});

// These labels (a text pair, a paint pair measured over a plain colour, a
// code pair) must stay in the gate: locking them in the check's own output
// keeps a future edit from quietly dropping them. A pair over a gradient is
// measured against every colour stop (see the gradient tests below); only a
// fill that cannot be read, or a fully transparent one, is SKIPPED.
const PASSING_PAIR_LABELS = [
  'color-text on color-surface',
  'color-text-muted on color-surface',
  'color-chip-text on paint-chip',
  'color-btn-text on paint-button',
  'color-syntax-string on color-code-canvas',
  'color-on-accent on color-accent',
];

test('the contract-3 text pairs remain in the gate, and pass in both palettes', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
  for (const label of PASSING_PAIR_LABELS) {
    for (const palette of ['light', 'dark']) {
      const line = output
        .split('\n')
        .find((row) => row.startsWith(palette) && row.includes(label));
      assert.ok(
        line,
        `expected a ${palette} row for "${label}" in check-contrast output`,
      );
      assert.match(line, /PASS/);
    }
  }
});

// The cases below are built from this package's own fixture theme, never
// from whichever theme repository hosts the run (THEME_ROOT), so they hold
// in every host.
const FIXTURE_ROOT = path.join(
  import.meta.dirname,
  'fixtures',
  'theme-default-contract-3',
);

/**
 * Run check-contrast.mjs over a scratch copy of the fixture theme with the
 * given token rows overwritten (both palettes), against the shipped pair
 * list or, when `pair` is given, a pair file of that one entry.
 *
 * @param {{key: string, light: string, dark: string}[]} overrides token rows
 * @param {object} [pair] a single contrast pair to check instead of the list
 * @returns {Promise<{passed: boolean, output: string}>} the outcome
 */
async function checkFixture(overrides, pair) {
  const scratchRoot = await buildScratchThemeCopy(FIXTURE_ROOT);
  try {
    return await withScratchDir('tokens-contrast-', async (directory) => {
      const theme = await readThemeJson(scratchRoot);
      for (const override of overrides) {
        const index = theme.tokens.findIndex((t) => t.key === override.key);
        assert.ok(index !== -1, `fixture token ${override.key} must exist`);
        theme.tokens[index] = { ...theme.tokens[index], ...override };
      }
      await writeThemeJson(scratchRoot, theme);
      const env = { THEME_ROOT: scratchRoot };
      if (pair) {
        const pairsPath = path.join(directory, 'pairs.json');
        await writeFile(pairsPath, JSON.stringify([pair]), 'utf8');
        env.GALA_CONTRAST_PAIRS_PATH = pairsPath;
      }
      return runCheckScript('check-contrast.mjs', { env });
    });
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

const BUTTON_PAIR = {
  label: 'color-btn-text on paint-button',
  foreground: 'color-btn-text',
  background: 'paint-button',
  minimum: 4.5,
  skipWhenNotPlainColor: true,
};

/**
 * @param {string} fill the paint-button value (both palettes)
 * @param {object} [pair] the pair to check
 * @returns {Promise<{passed: boolean, output: string}>} the outcome
 */
function checkButtonFill(fill, pair = BUTTON_PAIR) {
  return checkFixture(
    [
      { key: 'color-btn-text', light: '#ffffff', dark: '#ffffff' },
      { key: 'paint-button', light: fill, dark: fill },
    ],
    pair,
  );
}

test("the fixture theme's gradient panel is measured over its stops, and its transparent toc fill is skipped", async () => {
  const { passed, output } = await checkFixture([]);
  assert.ok(passed, output);
  assert.match(
    output,
    /color-panel-text on paint-panel\s+\d+\.\d+ \(>= 4\.5\) PASS \(worst stop #[0-9a-f]{6}\)/,
  );
  assert.match(
    output,
    /color-toc-active-text on color-toc-active\s+SKIPPED \(fully transparent\)/,
  );
});

test('a gradient whose worst stop clears the floor passes and names that stop', async () => {
  const { passed, output } = await checkButtonFill(
    'linear-gradient(135deg, #000000, #1d3fc4 50%, #2b59ff)',
  );
  assert.ok(passed, output);
  assert.match(output, /PASS \(worst stop #2b59ff\)/);
});

test('a gradient with one failing stop fails, naming the worst stop', async () => {
  const { passed, output } = await checkButtonFill(
    'linear-gradient(135deg, #000000, #ffff00)',
  );
  assert.ok(!passed, output);
  assert.match(output, /FAIL \(worst stop #ffff00\)/);
});

test('radial gradients, layered gradients and rgb()/hsl() stops are all read', async () => {
  const radial = await checkButtonFill(
    'radial-gradient(60px 40px at 10% 20%, rgb(0 0 0) 0%, hsl(0 0% 20%) 80%)',
  );
  assert.ok(radial.passed, radial.output);
  assert.match(radial.output, /PASS \(worst stop #333333\)/);

  const layered = await checkButtonFill(
    'linear-gradient(90deg, #000000, #111111), linear-gradient(90deg, #000000, rgba(255, 255, 0, 1))',
  );
  assert.ok(!layered.passed, layered.output);
  assert.match(layered.output, /FAIL \(worst stop #ffff00\)/);
});

test('a fill the parser cannot read is SKIPPED with the reason, never passed', async () => {
  const fills = [
    ['none', /SKIPPED \(none\)/],
    [
      'conic-gradient(#000000, #ffffff)',
      /SKIPPED \(unreadable fill: an unsupported fill function\)/,
    ],
    ['url(x.png)', /SKIPPED \(unreadable fill: an unsupported fill function\)/],
    [
      'linear-gradient(135deg, color-mix(in srgb, #000000, #ffffff), #000000)',
      /SKIPPED \(unreadable fill: an unsupported colour \(color-mix\)\)/,
    ],
    [
      'linear-gradient(135deg, #000000, #ffffff80)',
      /SKIPPED \(unreadable fill: a translucent stop\)/,
    ],
    [
      'radial-gradient(60px 40px at 10% 20%, #000000 0%, transparent 62%)',
      /SKIPPED \(unreadable fill: a transparent stop\)/,
    ],
  ];
  for (const [fill, expected] of fills) {
    const { passed, output } = await checkButtonFill(fill);
    assert.ok(passed, output);
    assert.match(output, expected, fill);
    assert.doesNotMatch(output, /PASS/, fill);
  }
});

test('a required pair over an unreadable gradient fails instead of being skipped', async () => {
  const { passed, output } = await checkButtonFill(
    'conic-gradient(#000000, #ffffff)',
    { ...BUTTON_PAIR, skipWhenNotPlainColor: false },
  );
  assert.ok(!passed, output);
  assert.match(output, /FAIL \(unreadable fill/);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('every named token pair clears WCAG 2.2 AA contrast in both the light and dark palette independently', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
});

// THD-M2: these four pairs were added because the CSS actually renders
// them and the original thirteen did not cover them (footer/header text
// and links on `surface`, selected text, `accent` used as a non-text
// border). Locking their labels in the check's own PASS output keeps a
// future edit from quietly dropping them back out of the gate.
const ADDED_PAIR_LABELS = [
  'color-text-muted on color-surface (footer/header)',
  'color-link on color-surface (header/footer links)',
  'color-text on color-selection (::selection)',
  'color-accent on color-canvas (non-text UI, e.g. a border)',
];

test('the four THD-M2 pairs the reference CSS actually renders remain in the gate, and pass in both palettes', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
  for (const label of ADDED_PAIR_LABELS) {
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

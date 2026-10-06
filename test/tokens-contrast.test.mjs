import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('every named token pair clears WCAG 2.2 AA contrast in both the light and dark palette independently', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
});

// These labels (a text pair, a paint pair measured over a plain colour, a
// code pair) must stay in the gate: locking them in the check's own output
// keeps a future edit from quietly dropping them. Pairs over a gradient or a
// fully transparent fill are reported as SKIPPED rows instead.
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

test('pairs over a gradient or fully transparent fill are reported as skipped, with the reason', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
  assert.match(
    output,
    /color-panel-text on paint-panel\s+SKIPPED \(a gradient\)/,
  );
  assert.match(
    output,
    /color-toc-active-text on color-toc-active\s+SKIPPED \(fully transparent\)/,
  );
});

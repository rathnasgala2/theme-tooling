import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';
import { withScratchTheme } from './helpers/with-scratch-theme.mjs';

/**
 * THM-M3: `check-css-hooks.mjs` must assert set-equality between the hook
 * IDs the CSS actually uses and `theme.json.slotHooks`, in both
 * directions. Each test mutates only `theme.json.slotHooks` in a scratch
 * copy of the real theme, leaving the CSS untouched, so the two sets
 * disagree in exactly one direction.
 */

/**
 * Write the (already-mutated) `theme` back to the scratch copy, run
 * `check-css-hooks.mjs` against it, and assert it fails.
 *
 * @param {string} scratchRoot the scratch theme root to write into
 * @param {Record<string, unknown>} theme the mutated `theme.json` value
 * @returns {Promise<string>} the check's combined output, for the
 *   caller's own `assert.match` on the specific diagnostic
 */
async function expectCssHooksFailure(scratchRoot, theme) {
  await writeThemeJson(scratchRoot, theme);
  const { passed, output } = await runCheckScript('check-css-hooks.mjs', {
    env: { THEME_ROOT: scratchRoot },
  });
  assert.ok(!passed, 'expected check-css-hooks.mjs to fail');
  return output;
}

test('check-css-hooks.mjs fails when theme.json.slotHooks declares a hook the CSS never uses', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    assert.ok(
      !theme.slotHooks.includes('slot-newsletter'),
      'fixture assumption: slot-newsletter must not already be declared',
    );
    theme.slotHooks = [...theme.slotHooks, 'slot-newsletter'].sort();
    const output = await expectCssHooksFailure(scratchRoot, theme);
    assert.match(
      output,
      /declares hook\(s\) the CSS never uses:.*slot-newsletter/,
      output,
    );
  });
});

test('check-css-hooks.mjs fails when the CSS uses a hook theme.json.slotHooks does not declare', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    assert.ok(
      theme.slotHooks.includes('prose-strong'),
      'fixture assumption: prose-strong must already be declared and used',
    );
    theme.slotHooks = theme.slotHooks.filter((id) => id !== 'prose-strong');
    const output = await expectCssHooksFailure(scratchRoot, theme);
    assert.match(output, /does not declare:.*prose-strong/, output);
  });
});

import { strict as assert } from 'node:assert';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../scripts/scratch-theme.mjs';
import { runCheckScript } from './helpers/run-check.mjs';

/**
 * THM-M3: `check-css-hooks.mjs` must assert set-equality between the hook
 * IDs the CSS actually uses and `theme.json.slotHooks`, in both
 * directions. Each test mutates only `theme.json.slotHooks` in a scratch
 * copy of the real theme, leaving the CSS untouched, so the two sets
 * disagree in exactly one direction.
 */

test('check-css-hooks.mjs fails when theme.json.slotHooks declares a hook the CSS never uses', async () => {
  const themeRoot = resolveThemeRoot();
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
    const themePath = path.join(scratchRoot, 'theme.json');
    const theme = JSON.parse(await readFile(themePath, 'utf8'));
    assert.ok(
      !theme.slotHooks.includes('slot-newsletter'),
      'fixture assumption: slot-newsletter must not already be declared',
    );
    theme.slotHooks = [...theme.slotHooks, 'slot-newsletter'].sort();
    await writeFile(themePath, JSON.stringify(theme, null, 2), 'utf8');

    const { passed, output } = await runCheckScript('check-css-hooks.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.ok(!passed, 'expected check-css-hooks.mjs to fail');
    assert.match(
      output,
      /declares hook\(s\) the CSS never uses:.*slot-newsletter/,
      output,
    );
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

test('check-css-hooks.mjs fails when the CSS uses a hook theme.json.slotHooks does not declare', async () => {
  const themeRoot = resolveThemeRoot();
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
    const themePath = path.join(scratchRoot, 'theme.json');
    const theme = JSON.parse(await readFile(themePath, 'utf8'));
    assert.ok(
      theme.slotHooks.includes('prose-strong'),
      'fixture assumption: prose-strong must already be declared and used',
    );
    theme.slotHooks = theme.slotHooks.filter((id) => id !== 'prose-strong');
    await writeFile(themePath, JSON.stringify(theme, null, 2), 'utf8');

    const { passed, output } = await runCheckScript('check-css-hooks.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.ok(!passed, 'expected check-css-hooks.mjs to fail');
    assert.match(output, /does not declare:.*prose-strong/, output);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

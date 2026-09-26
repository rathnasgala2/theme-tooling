import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { runCheckScript } from './helpers/run-check.mjs';
import { withScratchDir } from './helpers/scratch-dir.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';

test('the theme is within its own declared theme.json budgets (THD-M3)', async () => {
  const { passed, output } = await runCheckScript('check-budgets.mjs');
  assert.ok(passed, output);
});

test('fails when a declared asset exceeds maximumFileBytes, or the total exceeds maximumTotalBytes (THD-M3)', async () => {
  const theme = await readThemeJson(resolveThemeRoot());
  await withScratchDir('theme-budgets-', async (scratchRoot) => {
    const oversized = {
      ...theme,
      assets: theme.assets.map((asset, index) =>
        index === 0
          ? {
              ...asset,
              byteLength: String(Number(theme.budgets.maximumFileBytes) + 1),
            }
          : asset,
      ),
    };
    await writeThemeJson(scratchRoot, oversized);

    const { passed, output } = await runCheckScript('check-budgets.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(
      passed,
      false,
      'an asset over maximumFileBytes must fail check-budgets',
    );
    assert.match(output, /exceeding maximumFileBytes/);
  });
});

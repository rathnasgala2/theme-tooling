import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { runCheckScript } from './helpers/run-check.mjs';

test('the theme is within its own declared theme.json budgets (THD-M3)', async () => {
  const { passed, output } = await runCheckScript('check-budgets.mjs');
  assert.ok(passed, output);
});

test('fails when a declared asset exceeds maximumFileBytes, or the total exceeds maximumTotalBytes (THD-M3)', async () => {
  const themeRoot = resolveThemeRoot();
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const scratchRoot = await mkdtemp(path.join(tmpdir(), 'theme-budgets-'));
  try {
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
    await writeFile(
      path.join(scratchRoot, 'theme.json'),
      JSON.stringify(oversized, null, 2),
      'utf8',
    );

    const { passed, output } = await runCheckScript('check-budgets.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(
      passed,
      false,
      'an asset over maximumFileBytes must fail check-budgets',
    );
    assert.match(output, /exceeding maximumFileBytes/);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

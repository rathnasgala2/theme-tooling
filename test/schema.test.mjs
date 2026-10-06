import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('theme.json validates against urn:gala:schema:theme-contract:2.0.0 (all 116 contract-3 tokens, both palettes, exact order)', async () => {
  const { passed, output } = await runCheckScript('check-theme-schema.mjs');
  assert.ok(passed, output);
});

test('check-theme-schema.mjs rejects a theme declaring an earlier contract (no dual support)', async () => {
  const { withScratchTheme } = await import('./helpers/with-scratch-theme.mjs');
  const { readThemeJson, writeThemeJson } =
    await import('./helpers/theme-json.mjs');
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    theme.contractVersion = '2.1.0';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /theme contract 3\.x only/);
  });
});

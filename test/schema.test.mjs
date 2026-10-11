import { strict as assert } from 'node:assert';
import path from 'node:path';
import { test } from 'node:test';

import { GENERATION_4_THEMES } from './fixtures/generation-4-themes.mjs';
import { runCheckScript } from './helpers/run-check.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';
import { withScratchTheme } from './helpers/with-scratch-theme.mjs';

const CONTRACT_3_FIXTURE_ROOT = path.join(
  import.meta.dirname,
  'fixtures',
  'theme-default-contract-3',
);

test('theme.json validates against urn:gala:schema:theme-contract:2.0.0 (all 116 contract-3 tokens, both palettes, exact order)', async () => {
  const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
    env: { THEME_ROOT: CONTRACT_3_FIXTURE_ROOT },
  });
  assert.ok(passed, output);
});

test('check-theme-schema.mjs rejects a theme declaring an unsupported contract', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    theme.contractVersion = '2.1.0';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /unsupported contractVersion/);
  });
});

/**
 * Convert the closed contract-3 test package to one generation-4 package.
 * Its 116-token payload and digest-shaped evidence fields are intentionally
 * reused: these tests isolate schema dispatch and composition closure from
 * design-value concerns.
 *
 * @param {Record<string, any>} theme fixture document
 * @param {{themeId: string, composition: Record<string, string>}} definition
 */
function makeContract4(theme, definition) {
  theme.schemaId = 'urn:gala:schema:theme-contract:2.0.0';
  theme.schemaVersion = '2.0.0';
  theme.themeId = definition.themeId;
  theme.package = `@rathnasgala2/theme-${definition.themeId}@4.0.0`;
  theme.contractVersion = '4.0.0';
  theme.templateRange = '^4.0.0';
  theme.composition = {
    schemaId: 'urn:gala:schema:template-composition:2.0.0',
    schemaVersion: '2.0.0',
    ...definition.composition,
  };
}

for (const definition of GENERATION_4_THEMES) {
  test(`theme.json validates the closed generation-4 ${definition.themeId} composition`, async () => {
    await withScratchTheme(async (scratchRoot) => {
      const theme = await readThemeJson(scratchRoot);
      makeContract4(theme, definition);
      await writeThemeJson(scratchRoot, theme);
      const { passed, output } = await runCheckScript(
        'check-theme-schema.mjs',
        { env: { THEME_ROOT: scratchRoot } },
      );
      assert.ok(passed, output);
    });
  });
}

test('contract 4 fails closed when its required composition is absent', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    makeContract4(theme, GENERATION_4_THEMES[0]);
    delete theme.composition;
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /theme\.json failed/);
  });
});

test('contract 4 rejects a value outside its closed profile', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    makeContract4(theme, GENERATION_4_THEMES[2]);
    theme.composition.homeLayout = 'magazine';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /theme\.json failed/);
  });
});

test('contract 4 rejects a cross-profile composition assembled from valid literals', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    makeContract4(theme, GENERATION_4_THEMES[4]);
    theme.composition.homeLayout = 'gallery';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /theme\.json failed/);
  });
});

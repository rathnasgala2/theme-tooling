import { strict as assert } from 'node:assert';
import path from 'node:path';
import { test } from 'node:test';

import { GENERATION_4_THEMES } from './fixtures/generation-4-themes.mjs';
import { runCheckScript } from './helpers/run-check.mjs';
import { readTemplateStylingContract } from './helpers/template-contract.mjs';
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
 * Convert the closed contract-3 test package to one generation-4 package
 * (contract 4.1.0, template range ^4.4.0, theme 4.2.0, the installed
 * Template's own styling-contract digest by default). Its 116-token payload
 * and digest-shaped evidence fields are intentionally reused: these tests
 * isolate schema dispatch and composition closure from design-value concerns.
 *
 * @param {Record<string, any>} theme fixture document
 * @param {{themeId: string, composition: Record<string, string>}} definition
 * @param {{contractVersion?: string, templateRange?: string, version?: string}} [generation]
 *   override the contract generation (4.0.0 / ^4.1.0 / 4.1.0 package)
 */
async function makeContract4(
  theme,
  definition,
  {
    contractVersion = '4.1.0',
    templateRange = '^4.4.0',
    version = '4.2.0',
  } = {},
) {
  theme.schemaId = 'urn:gala:schema:theme-contract:2.0.0';
  theme.schemaVersion = '2.0.0';
  theme.themeId = definition.themeId;
  theme.package = `@rathnasgala2/theme-${definition.themeId}@${version}`;
  theme.contractVersion = contractVersion;
  theme.templateRange = templateRange;
  theme.stylingContractDigest = (
    await readTemplateStylingContract()
  ).catalogDigest;
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
      await makeContract4(theme, definition);
      await writeThemeJson(scratchRoot, theme);
      const { passed, output } = await runCheckScript(
        'check-theme-schema.mjs',
        { env: { THEME_ROOT: scratchRoot } },
      );
      assert.ok(passed, output);
    });
  });
}

for (const definition of GENERATION_4_THEMES) {
  test(`theme.json still admits the ${definition.themeId} contract-4.0.0 package (template range ^4.1.0)`, async () => {
    await withScratchTheme(async (scratchRoot) => {
      const theme = await readThemeJson(scratchRoot);
      await makeContract4(theme, definition, {
        contractVersion: '4.0.0',
        templateRange: '^4.1.0',
        version: '4.1.0',
      });
      await writeThemeJson(scratchRoot, theme);
      const { passed, output } = await runCheckScript(
        'check-theme-schema.mjs',
        { env: { THEME_ROOT: scratchRoot } },
      );
      assert.ok(passed, output);
    });
  });
}

test('contract 4.1.0 requires template range ^4.4.0', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    await makeContract4(theme, GENERATION_4_THEMES[0]);
    theme.templateRange = '^4.1.0';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /theme\.json failed/);
  });
});

test('check-theme-schema.mjs rejects a contract version beyond 4.1.0 and names the supported ones', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    await makeContract4(theme, GENERATION_4_THEMES[0]);
    theme.contractVersion = '4.2.0';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /unsupported contractVersion "4\.2\.0"/);
    assert.match(output, /3\.x, 4\.0\.0 and 4\.1\.0/);
  });
});

test('contract 4 fails closed when its required composition is absent', async () => {
  await withScratchTheme(async (scratchRoot) => {
    const theme = await readThemeJson(scratchRoot);
    await makeContract4(theme, GENERATION_4_THEMES[0]);
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
    await makeContract4(theme, GENERATION_4_THEMES[2]);
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
    await makeContract4(theme, GENERATION_4_THEMES[4]);
    theme.composition.homeLayout = 'gallery';
    await writeThemeJson(scratchRoot, theme);
    const { passed, output } = await runCheckScript('check-theme-schema.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    assert.equal(passed, false);
    assert.match(output, /theme\.json failed/);
  });
});

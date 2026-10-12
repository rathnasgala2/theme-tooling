import { strict as assert } from 'node:assert';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { boundKeysOf } from '../scripts/lib/palette-binding.mjs';
import {
  readPaletteFixture,
  rewriteTokensCss,
  withPaletteTheme,
} from './helpers/palette-theme.mjs';
import { runCheckScript } from './helpers/run-check.mjs';
import { readThemeJson, writeThemeJson } from './helpers/theme-json.mjs';

/**
 * @param {string} script check script
 * @param {string} root scratch theme root
 * @returns {Promise<{passed: boolean, output: string}>} the outcome
 */
function run(script, root) {
  return runCheckScript(script, { env: { THEME_ROOT: root } });
}

/**
 * @param {(theme: any) => void} mutate edits the parsed theme.json
 * @returns {Promise<{passed: boolean, output: string}>} palette:check outcome
 */
function paletteCheckMutated(mutate) {
  return withPaletteTheme(async (root) => {
    const theme = await readThemeJson(root);
    mutate(theme);
    await writeThemeJson(root, theme);
    return run('check-theme-palette.mjs', root);
  });
}

test('a conformant palette theme passes, and the corpus smoke runs', async () => {
  const { passed, output } = await withPaletteTheme((root) =>
    run('check-theme-palette.mjs', root),
  );
  assert.ok(passed, output);
  assert.match(output, /default palette passes every pair in both modes/);
});

test('fails when theme.json has no palette', async () => {
  const { passed, output } = await paletteCheckMutated((theme) => {
    delete theme.palette;
  });
  assert.equal(passed, false);
  assert.match(output, /THEME_PALETTE_MISSING/);
});

test('fails when a seed token is not bound', async () => {
  const { passed, output } = await paletteCheckMutated((theme) => {
    theme.palette.follow = theme.palette.follow.filter(
      (entry) => entry.key !== 'color-accent',
    );
  });
  assert.equal(passed, false);
  assert.match(output, /seed token color-accent is not bound/);
});

test('fails when a follow list length differs from the value colour count', async () => {
  const { passed, output } = await paletteCheckMutated((theme) => {
    theme.palette.follow
      .find((entry) => entry.key === 'color-link')
      .light.push('accent');
  });
  assert.equal(passed, false);
  assert.match(output, /THEME_PALETTE_INVALID/);
});

test('fails when a bound key is not palette-drivable', async () => {
  const { passed, output } = await paletteCheckMutated((theme) => {
    theme.palette.follow.push({
      key: 'color-danger',
      light: ['accent'],
      dark: ['accent'],
    });
  });
  assert.equal(passed, false);
  assert.match(output, /THEME_PALETTE_INVALID/);
});

test('names the pair and mode when the default palette fails a pair', async () => {
  const { passed, output } = await paletteCheckMutated((theme) => {
    const canvas = theme.tokens.find((row) => row.key === 'color-canvas');
    const text = theme.tokens.find((row) => row.key === 'color-text');
    text.light = canvas.light;
  });
  assert.equal(passed, false);
  assert.match(output, /default palette fails .* in light: .* of 4\.5/);
});

test('fails when components.css or print.css sets a bound token', async () => {
  const { passed, output } = await withPaletteTheme(async (root) => {
    await appendFile(
      path.join(root, 'components.css'),
      '[data-gala-publication-root] .x { --gala-color-link: #000000; }\n',
    );
    await appendFile(
      path.join(root, 'print.css'),
      '@media print { [data-gala-publication-root] .y { --gala-paint-panel: none; } }\n',
    );
    return run('check-theme-palette.mjs', root);
  });
  assert.equal(passed, false);
  assert.match(output, /components\.css sets --gala-color-link/);
  assert.match(output, /print\.css sets --gala-paint-panel/);
});

test('a stylesheet may set a token the palette does not bind', async () => {
  const { passed, output } = await withPaletteTheme(async (root) => {
    await appendFile(
      path.join(root, 'components.css'),
      '[data-gala-publication-root] .x { --gala-color-danger: #000000; }\n',
    );
    return run('check-theme-palette.mjs', root);
  });
  assert.ok(passed, output);
});

test('fails when tokens.css declares a bound token, in palette:check and tokens:check', async () => {
  await withPaletteTheme(async (root) => {
    await rewriteTokensCss(root, false);
    const palette = await run('check-theme-palette.mjs', root);
    assert.equal(palette.passed, false);
    assert.match(palette.output, /tokens\.css declares --gala-color-link/);
    const tokens = await run('check-token-values.mjs', root);
    assert.equal(tokens.passed, false);
    assert.match(
      tokens.output,
      /"bare root" declares --gala-color-link, which palette\.follow binds/,
    );
  });
});

test('tokens:generate omits every bound key and the result passes tokens:check', async () => {
  await withPaletteTheme(async (root) => {
    await rewriteTokensCss(root, false);
    const generated = await run('emit-tokens-css.mjs', root);
    assert.ok(generated.passed, generated.output);
    const css = await readFile(path.join(root, 'tokens.css'), 'utf8');
    const theme = await readThemeJson(root);
    const bound = boundKeysOf(theme);
    assert.ok(bound.size > 0);
    for (const key of bound) {
      assert.ok(!css.includes(`--gala-${key}:`), `${key} left in tokens.css`);
    }
    const kept = theme.tokens.filter((row) => !bound.has(row.key));
    assert.ok(kept.length > 0);
    for (const row of kept) {
      assert.ok(css.includes(`--gala-${row.key}:`), `${row.key} dropped`);
    }
    const checked = await run('check-token-values.mjs', root);
    assert.ok(checked.passed, checked.output);
    assert.match(checked.output, /palette-bound tokens absent as expected/);
  });
});

test('tokens:check still requires every unbound token in tokens.css', async () => {
  const { passed, output } = await withPaletteTheme(async (root) => {
    const theme = await readThemeJson(root);
    theme.palette.follow = theme.palette.follow.filter(
      (entry) => entry.key !== 'color-link',
    );
    await writeThemeJson(root, theme);
    return run('check-token-values.mjs', root);
  });
  assert.equal(passed, false);
  assert.match(output, /is missing --gala-color-link/);
});

test('the fixture binds the same keys the schema module drives', async () => {
  const { palette } = await readPaletteFixture();
  assert.equal(boundKeysOf({ palette }).size, palette.follow.length);
  assert.equal(boundKeysOf({}).size, 0);
});

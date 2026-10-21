import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderTokensCss } from '../../scripts/emit-tokens-css.mjs';
import { boundKeysOf } from '../../scripts/lib/palette-binding.mjs';
import { readThemeJson, writeThemeJson } from './theme-json.mjs';
import { withScratchDir } from './scratch-dir.mjs';

const COMPONENTS_CSS =
  '[data-gala-publication-root] .fixture { color: red; }\n';

/**
 * The schema package's read-only theme-default copy: 116 tokens plus the
 * palette bindings its contract tests use.
 *
 * @returns {Promise<{tokens: any[], palette: any}>} fixture tokens and palette
 */
export async function readPaletteFixture() {
  const fixture = JSON.parse(
    await readFile(
      fileURLToPath(
        import.meta
          .resolve('@rathnasgala2/schemas/palette/theme-default.fixture.json'),
      ),
      'utf8',
    ),
  );
  return { tokens: fixture.tokens, palette: fixture.palette };
}

/**
 * Build a theme.json / tokens.css / components.css / print.css set from the
 * schema fixture in a scratch directory, with tokens.css generated the way
 * `tokens:generate` writes it, then run `fn(root)`.
 *
 * @param {(root: string) => Promise<T>} fn run against the scratch theme
 * @returns {Promise<T>} `fn`'s resolved value
 * @template T
 */
export function withPaletteTheme(fn) {
  return withScratchDir('palette-theme-', async (root) => {
    const { tokens, palette } = await readPaletteFixture();
    await writeThemeJson(root, { contractVersion: '4.1.0', tokens, palette });
    await rewriteTokensCss(root);
    await writeFile(path.join(root, 'components.css'), COMPONENTS_CSS, 'utf8');
    await writeFile(path.join(root, 'print.css'), COMPONENTS_CSS, 'utf8');
    return fn(root);
  });
}

/**
 * @param {string} root scratch theme root
 * @param {boolean} [dropBound] whether to omit palette-bound tokens
 * @returns {Promise<void>} resolves once tokens.css is written
 */
export async function rewriteTokensCss(root, dropBound = true) {
  const theme = await readThemeJson(root);
  await writeFile(
    path.join(root, 'tokens.css'),
    await renderTokensCss(
      theme.tokens,
      dropBound ? boundKeysOf(theme) : new Set(),
    ),
    'utf8',
  );
}

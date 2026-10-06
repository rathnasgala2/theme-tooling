/**
 * Emit a theme's `tokens.css` from the `tokens` array of its `theme.json`
 * (contract 3). `theme.json` stays the single hand-edited source of token
 * values; `tokens.css` is derived, so the two can never drift (and
 * `check-token-values.mjs` proves they have not).
 *
 * Block order is the one `tokens-fallback.test.mjs` locks: a bare
 * `[data-gala-publication-root]` block with the light values, its
 * `prefers-color-scheme: dark` override, then the two resolved-mode blocks
 * (higher specificity, so they win once the template's bootstrap sets
 * `data-gala-resolved-color-mode`). Without script only the first two ever
 * match, which is what makes a no-JS page fully themed.
 *
 * Usage: `node emit-tokens-css.mjs` rewrites `<THEME_ROOT>/tokens.css`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as prettier from 'prettier';

import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { runIfMain } from './run-if-main.mjs';

const ROOT = '[data-gala-publication-root]';
const RESOLVED_LIGHT = `${ROOT}[data-gala-resolved-color-mode="light"]`;
const RESOLVED_DARK = `${ROOT}[data-gala-resolved-color-mode="dark"]`;

const PRETTIER_CONFIG_PATH = path.join(
  import.meta.dirname,
  '..',
  '.prettierrc.json',
);

/**
 * @param {{key: string, light: string, dark: string}[]} tokens theme tokens
 * @param {'light'|'dark'} mode which palette to declare
 * @returns {string} one declaration per token, in token order
 */
function declarations(tokens, mode) {
  return tokens.map((token) => `--gala-${token.key}: ${token[mode]};`).join('');
}

/**
 * @param {{key: string, light: string, dark: string}[]} tokens theme tokens
 * @returns {Promise<string>} the Prettier-formatted `tokens.css` text
 */
export async function renderTokensCss(tokens) {
  const light = declarations(tokens, 'light');
  const dark = declarations(tokens, 'dark');
  const source =
    `@layer gala-tokens {` +
    `/* Bare-root light values and their prefers-color-scheme dark override\n` +
    `   style a page the browser script never reaches; the resolved-mode\n` +
    `   blocks below win once data-gala-resolved-color-mode is set. */` +
    `${ROOT}{${light}}` +
    `@media (prefers-color-scheme: dark){${ROOT}{${dark}}}` +
    `${RESOLVED_LIGHT}{${light}}` +
    `${RESOLVED_DARK}{${dark}}` +
    `}`;
  const config = JSON.parse(await readFile(PRETTIER_CONFIG_PATH, 'utf8'));
  return prettier.format(source, {
    ...config,
    // `format()` ignores the config file's `*.css` override, so apply it.
    singleQuote: false,
    parser: 'css',
  });
}

async function main() {
  const themeRoot = resolveThemeRoot();
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  await writeFile(
    path.join(themeRoot, 'tokens.css'),
    await renderTokensCss(theme.tokens),
    'utf8',
  );
  console.log('tokens.css written from theme.json tokens.');
}

await runIfMain(import.meta.url, main);

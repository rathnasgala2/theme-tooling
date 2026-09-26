import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveThemeRoot } from './resolve-theme-root.mjs';

/**
 * WCAG relative luminance (sRGB-linearized), per the standard formula.
 *
 * @param {string} hex a `#rrggbb` color
 * @returns {number} relative luminance in [0, 1]
 */
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(
    (index) => parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a a `#rrggbb` color
 * @param {string} b a `#rrggbb` color
 * @returns {number} the WCAG contrast ratio, >= 1
 */
function contrastRatio(a, b) {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (high + 0.05) / (low + 0.05);
}

/**
 * @param {{key: string, light: string, dark: string}[]} tokens the parsed
 *   `theme.json.tokens` array
 * @param {string} key a token key
 * @param {'light'|'dark'} palette which palette's value to read
 * @returns {string} the token's `#rrggbb` value for that palette
 */
function colorOf(tokens, key, palette) {
  const token = tokens.find((candidate) => candidate.key === key);
  if (!token) throw new Error(`no token named ${key}`);
  return token[palette];
}

/**
 * The default pair list (coordinator addendum item C): externalized to
 * `contrast-pairs.json` so the checked adjacencies are a configurable
 * list rather than a literal only readable by editing this script.
 * `THD-M2`'s reasoning for hand-maintaining rather than deriving the list
 * from the parsed stylesheet still applies (see the file's own header
 * comment) — deriving pairs by walking the CSS for rules that set both
 * `color` and `background-color` was judged not worth the added parser
 * surface for five small, hand-reviewed files, but is the natural next
 * step if the theme set grows.
 *
 * `GALA_CONTRAST_PAIRS_PATH` overrides the default file (used by this
 * package's own tests, which need failing fixtures the shipped default
 * list would never produce against a conformant reference theme).
 *
 * @returns {Promise<{label: string, foreground: string, background: string, minimum: number}[]>}
 *   the pair list to enforce
 */
async function loadPairs() {
  const pairsPath =
    process.env.GALA_CONTRAST_PAIRS_PATH ||
    path.join(import.meta.dirname, 'contrast-pairs.json');
  return JSON.parse(await readFile(pairsPath, 'utf8'));
}

async function main() {
  const theme = JSON.parse(
    await readFile(path.join(resolveThemeRoot(), 'theme.json'), 'utf8'),
  );
  const tokens = theme.tokens;
  const pairs = await loadPairs();
  let failed = false;
  for (const palette of ['light', 'dark']) {
    for (const pair of pairs) {
      const foreground = colorOf(tokens, pair.foreground, palette);
      const background = colorOf(tokens, pair.background, palette);
      const ratio = contrastRatio(foreground, background);
      const ok = ratio >= pair.minimum;
      if (!ok) failed = true;
      console.log(
        `${palette.padEnd(5)} ${pair.label.padEnd(50)} ${ratio.toFixed(2)} ` +
          `(>= ${pair.minimum}) ${ok ? 'PASS' : 'FAIL'}`,
      );
    }
  }
  if (failed) {
    console.error('one or more token pairs failed WCAG 2.2 AA contrast.');
    process.exitCode = 1;
    return;
  }
  console.log(
    'every named token pair clears WCAG 2.2 AA contrast in both palettes.',
  );
}

await main();

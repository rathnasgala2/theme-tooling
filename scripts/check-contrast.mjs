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
 * The hand-maintained floor (THD-M2): every pair listed here is either a
 * token combination the contract requires regardless of whether a given
 * theme's CSS currently renders it (`color-link-visited`,
 * `color-warning`, `color-success`, `color-on-accent` on their paired
 * surfaces), or a combination this reference theme's own `components.css`
 * is known to render (the four pairs added below: the footer/header text
 * on `surface`, links on `surface`, selected text, and `accent` used as a
 * non-text border/UI color) — reviewed and kept in sync with the CSS by
 * hand rather than derived from it; deriving pairs by walking the parsed
 * stylesheet for rules that set both `color` and `background-color` was
 * judged not worth the added parser surface for five small, hand-reviewed
 * files, but is the natural next step if the theme set grows.
 *
 * @type {readonly {label: string, foreground: string, background: string, minimum: number}[]}
 */
const PAIRS = [
  {
    label: 'color-text on color-canvas',
    foreground: 'color-text',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-text-muted on color-canvas',
    foreground: 'color-text-muted',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-link on color-canvas',
    foreground: 'color-link',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-link-visited on color-canvas',
    foreground: 'color-link-visited',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-danger on color-canvas',
    foreground: 'color-danger',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-warning on color-canvas',
    foreground: 'color-warning',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-success on color-canvas',
    foreground: 'color-success',
    background: 'color-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-code-text on color-code-canvas',
    foreground: 'color-code-text',
    background: 'color-code-canvas',
    minimum: 4.5,
  },
  {
    label: 'color-on-accent on color-accent',
    foreground: 'color-on-accent',
    background: 'color-accent',
    minimum: 4.5,
  },
  {
    label: 'color-text on color-surface',
    foreground: 'color-text',
    background: 'color-surface',
    minimum: 4.5,
  },
  {
    label: 'color-text on color-surface-raised',
    foreground: 'color-text',
    background: 'color-surface-raised',
    minimum: 4.5,
  },
  {
    label: 'color-border on color-canvas (non-text UI)',
    foreground: 'color-border',
    background: 'color-canvas',
    minimum: 3,
  },
  {
    label: 'color-focus on color-canvas (non-text UI)',
    foreground: 'color-focus',
    background: 'color-canvas',
    minimum: 3,
  },
  // The four pairs below close THD-M2: the CSS actually renders these,
  // and the original thirteen did not cover them.
  {
    label: 'color-text-muted on color-surface (footer/header)',
    foreground: 'color-text-muted',
    background: 'color-surface',
    minimum: 4.5,
  },
  {
    label: 'color-link on color-surface (header/footer links)',
    foreground: 'color-link',
    background: 'color-surface',
    minimum: 4.5,
  },
  {
    label: 'color-text on color-selection (::selection)',
    foreground: 'color-text',
    background: 'color-selection',
    minimum: 4.5,
  },
  {
    label: 'color-accent on color-canvas (non-text UI, e.g. a border)',
    foreground: 'color-accent',
    background: 'color-canvas',
    minimum: 3,
  },
];

async function main() {
  const theme = JSON.parse(
    await readFile(path.join(resolveThemeRoot(), 'theme.json'), 'utf8'),
  );
  const tokens = theme.tokens;
  let failed = false;
  for (const palette of ['light', 'dark']) {
    for (const pair of PAIRS) {
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

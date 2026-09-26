/**
 * THD-C1: without script, `data-gala-resolved-color-mode` is never set, so
 * a stylesheet that only carries the two resolved-mode blocks renders
 * unstyled. The fix is a bare `[data-gala-publication-root]` block (plus a
 * `prefers-color-scheme: dark` override of the same compound) declared
 * *before* the two resolved-mode blocks, so specificity — not source
 * order — is what lets the resolved blocks win once the template sets the
 * attribute. This test locks both halves of that fix: the block order,
 * and that the fallback palette itself clears the same contrast floor the
 * resolved palettes are held to.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import postcss from 'postcss';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';

const BARE_ROOT_SELECTOR = '[data-gala-publication-root]';
const DARK_OVERRIDE_SELECTOR = '[data-gala-publication-root]';
const RESOLVED_LIGHT_SELECTOR =
  '[data-gala-publication-root][data-gala-resolved-color-mode="light"]';
const RESOLVED_DARK_SELECTOR =
  '[data-gala-publication-root][data-gala-resolved-color-mode="dark"]';

/**
 * @param {number} hex a `#rrggbb` color
 * @returns {number} relative luminance in [0, 1] (WCAG formula)
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
 * @returns {Promise<{root: import('postcss').Root, css: string}>}
 */
async function loadTokensCss() {
  const themeRoot = resolveThemeRoot();
  const css = await readFile(path.join(themeRoot, 'tokens.css'), 'utf8');
  return { root: postcss.parse(css, { from: 'tokens.css' }), css };
}

/**
 * Collect a top-level rule's own custom-property declarations into a plain
 * object, keyed by property name without the leading `--gala-`.
 *
 * @param {import('postcss').Rule} rule
 * @returns {Record<string, string>}
 */
function declarationsOf(rule) {
  /** @type {Record<string, string>} */
  const result = {};
  for (const node of rule.nodes ?? []) {
    if (node.type === 'decl' && node.prop.startsWith('--gala-')) {
      result[node.prop.slice('--gala-'.length)] = node.value;
    }
  }
  return result;
}

test('tokens.css declares the bare-root fallback block, and its prefers-color-scheme override, before both resolved-mode blocks', async () => {
  const { root } = await loadTokensCss();
  /** @type {{selector: string, isMediaDark: boolean}[]} */
  const order = [];
  root.walk((node) => {
    if (node.type === 'rule' && node.selector === BARE_ROOT_SELECTOR) {
      const insideMedia =
        node.parent?.type === 'atrule' && node.parent.name === 'media';
      order.push({ selector: node.selector, isMediaDark: insideMedia });
    }
    if (
      node.type === 'rule' &&
      (node.selector === RESOLVED_LIGHT_SELECTOR ||
        node.selector === RESOLVED_DARK_SELECTOR)
    ) {
      order.push({ selector: node.selector, isMediaDark: false });
    }
  });

  assert.equal(
    order.length,
    4,
    `expected 4 root-compound blocks, found ${order.length}`,
  );
  assert.equal(order[0].selector, BARE_ROOT_SELECTOR);
  assert.equal(
    order[0].isMediaDark,
    false,
    'the plain bare-root block must come first',
  );
  assert.equal(order[1].selector, DARK_OVERRIDE_SELECTOR);
  assert.equal(
    order[1].isMediaDark,
    true,
    'the prefers-color-scheme override must come second',
  );
  assert.equal(order[2].selector, RESOLVED_LIGHT_SELECTOR);
  assert.equal(order[3].selector, RESOLVED_DARK_SELECTOR);
});

test('the no-JS fallback palette (bare-root and its dark media override) clears WCAG 2.2 AA, same as the resolved palettes', async () => {
  const { root } = await loadTokensCss();
  /** @type {Record<string, string> | undefined} */
  let bareRoot;
  /** @type {Record<string, string> | undefined} */
  let mediaDark;
  root.walk((node) => {
    if (node.type === 'rule' && node.selector === BARE_ROOT_SELECTOR) {
      const insideMedia =
        node.parent?.type === 'atrule' && node.parent.name === 'media';
      if (insideMedia) mediaDark = declarationsOf(node);
      else bareRoot = declarationsOf(node);
    }
  });
  assert.ok(bareRoot, 'expected a bare-root fallback block');
  assert.ok(
    mediaDark,
    'expected a prefers-color-scheme: dark override of the bare root',
  );

  for (const [label, tokens] of [
    ['fallback light (bare root)', bareRoot],
    ['fallback dark (prefers-color-scheme)', mediaDark],
  ]) {
    const ratio = contrastRatio(tokens['color-text'], tokens['color-canvas']);
    assert.ok(
      ratio >= 4.5,
      `${label}: color-text on color-canvas is ${ratio.toFixed(2)}, below WCAG AA 4.5`,
    );
  }
});

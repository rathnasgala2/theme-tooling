/**
 * Token conformance runner (theme contract 3): `theme.json.tokens` and
 * `tokens.css` must both carry exactly the closed 116-token catalog, in
 * catalog order, with every value admitted by its type's allow-list
 * grammar, and `tokens.css` must repeat `theme.json`'s values faithfully in
 * the four scopes the template expects (bare root light, its
 * `prefers-color-scheme: dark` override, resolved light, resolved dark).
 * Mode-invariant types (everything except colour, paint, border and shadow)
 * must have byte-equal light and dark values. `tokens:generate`
 * (`emit-tokens-css.mjs`) derives `tokens.css` from `theme.json`, so a
 * failure here means one of them was edited by hand.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import postcss from 'postcss';

import { normalizeCssValue } from './lib/css-value.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';
import {
  MODE_VARIANT_TYPES,
  THEME_TOKEN_CATALOG,
  isAdmittedTokenValue,
} from './theme-token-catalog.mjs';

const ROOT = '[data-gala-publication-root]';
const SCOPES = [
  { label: 'bare root', selector: ROOT, media: false, mode: 'light' },
  { label: 'bare root dark', selector: ROOT, media: true, mode: 'dark' },
  {
    label: 'resolved light',
    selector: `${ROOT}[data-gala-resolved-color-mode="light"]`,
    media: false,
    mode: 'light',
  },
  {
    label: 'resolved dark',
    selector: `${ROOT}[data-gala-resolved-color-mode="dark"]`,
    media: false,
    mode: 'dark',
  },
];

/** @type {string[]} */
const problems = [];

/**
 * @param {import('postcss').Root} root parsed `tokens.css`
 * @returns {Map<string, Record<string, string>>} declarations per scope label
 */
function collectScopes(root) {
  /** @type {Map<string, Record<string, string>>} */
  const found = new Map();
  root.walkRules((rule) => {
    const inMedia =
      rule.parent?.type === 'atrule' &&
      /** @type {import('postcss').AtRule} */ (rule.parent).name === 'media';
    const scope = SCOPES.find(
      (candidate) =>
        candidate.selector === rule.selector && candidate.media === inMedia,
    );
    if (!scope) {
      problems.push(
        `tokens.css: unexpected rule "${rule.selector}"${inMedia ? ' inside @media' : ''}`,
      );
      return;
    }
    if (found.has(scope.label)) {
      problems.push(`tokens.css: scope "${scope.label}" is declared twice`);
      return;
    }
    /** @type {Record<string, string>} */
    const declarations = {};
    for (const node of rule.nodes ?? []) {
      if (node.type !== 'decl') continue;
      if (!node.prop.startsWith('--gala-')) {
        problems.push(
          `tokens.css: "${node.prop}" in "${scope.label}" is not a --gala-* token`,
        );
        continue;
      }
      declarations[node.prop.slice('--gala-'.length)] = normalizeCssValue(
        node.value,
      );
    }
    found.set(scope.label, declarations);
  });
  return found;
}

async function main() {
  const themeRoot = resolveThemeRoot();
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const tokens = Array.isArray(theme.tokens) ? theme.tokens : [];

  if (tokens.length !== THEME_TOKEN_CATALOG.length) {
    problems.push(
      `theme.json declares ${tokens.length} tokens, expected ${THEME_TOKEN_CATALOG.length}`,
    );
  }
  /** @type {Map<string, {key: string, type: string, light: string, dark: string}>} */
  const byKey = new Map(tokens.map((token) => [token.key, token]));
  THEME_TOKEN_CATALOG.forEach(([key, type], index) => {
    const token = byKey.get(key);
    if (!token) {
      problems.push(`theme.json is missing token ${key}`);
      return;
    }
    if (tokens[index]?.key !== key) {
      problems.push(`theme.json token ${key} is out of catalog order`);
    }
    if (token.type !== type) {
      problems.push(`${key}: type is "${token.type}", expected "${type}"`);
    }
    for (const mode of ['light', 'dark']) {
      if (!isAdmittedTokenValue(key, type, token[mode])) {
        problems.push(
          `${key}: ${mode} value "${token[mode]}" is not a valid ${type}`,
        );
      }
    }
    if (!MODE_VARIANT_TYPES.includes(type) && token.light !== token.dark) {
      problems.push(`${key}: ${type} tokens must not differ between modes`);
    }
  });

  const tokensCss = await readFile(path.join(themeRoot, 'tokens.css'), 'utf8');
  const scopes = collectScopes(
    postcss.parse(tokensCss, { from: 'tokens.css' }),
  );
  for (const scope of SCOPES) {
    const declared = scopes.get(scope.label);
    if (!declared) {
      problems.push(`tokens.css has no "${scope.label}" block`);
      continue;
    }
    for (const [key] of THEME_TOKEN_CATALOG) {
      const expected = byKey.get(key)?.[scope.mode];
      if (!(key in declared)) {
        problems.push(`tokens.css "${scope.label}" is missing --gala-${key}`);
      } else if (declared[key] !== expected) {
        problems.push(
          `tokens.css "${scope.label}" --gala-${key} is "${declared[key]}", theme.json says "${expected}"`,
        );
      }
    }
    for (const key of Object.keys(declared)) {
      if (!byKey.has(key)) {
        problems.push(
          `tokens.css "${scope.label}" declares unknown --gala-${key}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }
  console.log(
    `all ${THEME_TOKEN_CATALOG.length} tokens are catalog-conformant and tokens.css matches theme.json in all four scopes.`,
  );
}

await main();

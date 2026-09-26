/**
 * Property/at-rule/volume conformance runner (THD-M4): `check-css-hooks.mjs`
 * validates selectors only. The governing rule it quotes (closed property
 * and at-rule catalogs, byte/rule ceilings) had no enforcement anywhere —
 * `position: fixed`, `@keyframes`, an unbounded rule count all passed. This
 * runner closes that gap: a property allowlist (derived from every
 * property the five reference themes actually use, plus any `--gala-*`
 * custom property), an at-rule allowlist, and a per-file rule-count
 * ceiling generous enough for real design work but well short of "no
 * limit".
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import postcss from 'postcss';

import { loadPackedFileSet } from './packed-files.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';

/** @type {ReadonlySet<string>} every non-custom property observed across
 * the five reference themes' shipped stylesheets, reviewed and accepted as
 * the closed authoring vocabulary. */
const ALLOWED_PROPERTIES = new Set([
  'animation-duration',
  'background-color',
  'background-image',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-color',
  'border-inline-start',
  'border-inline-start-color',
  'border-radius',
  'border-top',
  'border-top-color',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'height',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-top',
  'max-width',
  'outline-color',
  'outline-width',
  'padding',
  'padding-inline-start',
  'padding-top',
  'text-decoration-line',
  'text-decoration-thickness',
  'text-transform',
  'text-underline-offset',
  'transition-duration',
]);

/** @type {ReadonlySet<string>} the closed at-rule vocabulary. */
const ALLOWED_AT_RULES = new Set(['layer', 'media']);

/** @type {number} generous headroom over the largest current file (64
 * rules in `theme-amaze/components.css`). */
const MAXIMUM_RULES_PER_FILE = 160;

async function main() {
  const { stylesheets } = await loadPackedFileSet();
  const themeRoot = resolveThemeRoot();
  let failed = false;

  for (const stylesheet of stylesheets) {
    const css = await readFile(path.join(themeRoot, stylesheet), 'utf8');
    const root = postcss.parse(css, { from: stylesheet });
    let ruleCount = 0;

    root.walkAtRules((atRule) => {
      if (!ALLOWED_AT_RULES.has(atRule.name)) {
        console.error(
          `${stylesheet}: at-rule "@${atRule.name}" is not in the closed catalog`,
        );
        failed = true;
      }
    });

    root.walkRules((rule) => {
      ruleCount += 1;
      for (const decl of rule.nodes ?? []) {
        if (decl.type !== 'decl') continue;
        if (decl.prop.startsWith('--')) continue; // custom properties
        if (!ALLOWED_PROPERTIES.has(decl.prop)) {
          console.error(
            `${stylesheet}: property "${decl.prop}" is not in the closed catalog (${rule.selector})`,
          );
          failed = true;
        }
      }
    });

    if (ruleCount > MAXIMUM_RULES_PER_FILE) {
      console.error(
        `${stylesheet}: ${ruleCount} rules exceeds the ${MAXIMUM_RULES_PER_FILE}-rule ceiling`,
      );
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log(
    'every declaration and at-rule is in the closed catalog, within the rule-count ceiling.',
  );
}

await main();

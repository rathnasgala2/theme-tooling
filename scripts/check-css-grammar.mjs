/**
 * Property/at-rule/volume conformance runner (THD-M4): `check-css-hooks.mjs`
 * validates selectors only. The governing rule it quotes (closed property
 * and at-rule catalogs, byte/rule ceilings) had no enforcement anywhere —
 * `position: fixed`, `@keyframes`, an unbounded rule count all passed. This
 * runner closes that gap: a property allowlist (derived from every
 * property the five reference themes actually use, plus any `--gala-*`
 * custom property), an at-rule allowlist, a per-file rule-count ceiling
 * generous enough for real design work but well short of "no limit", and
 * a grammar rule that a rule setting `outline-color` or `outline-width`
 * must also set `outline-style` (or `outline`) in the same rule, since
 * the longhands paint nothing on their own (THD-H1).
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
  // Coordinator addendum item B: a sanitised passive SVG asset (TPL-C2)
  // can only be rendered as an icon through `background-image`/
  // `mask-image` on `::before`/`::after` — these six properties are the
  // minimum needed to size and position it there.
  'background-position',
  'background-repeat',
  'background-size',
  'block-size',
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
  // `content` is admitted only for the empty string (see the dedicated
  // check below): a pseudo-element needs `content: ""` to exist at all
  // before it can carry an icon image.
  'content',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'height',
  'inline-size',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-top',
  'mask-image',
  'mask-repeat',
  'mask-size',
  'max-width',
  'outline-color',
  'outline-width',
  'padding',
  'padding-inline-start',
  'padding-top',
  'text-decoration-line',
  // Admitted only for its closed `auto|none|all` value set (see the
  // dedicated check below) — it never accepts an arbitrary length or
  // color the way most other admitted properties can.
  'text-decoration-skip-ink',
  'text-decoration-thickness',
  'text-transform',
  'text-underline-offset',
  'transition-duration',
  'width',
]);

/** @type {RegExp} an empty CSS string literal, either quote style. */
const EMPTY_STRING_LITERAL = /^(?:""|'')$/;

/** @type {ReadonlySet<string>} `text-decoration-skip-ink`'s closed value
 * set — its only admitted keywords. */
const ALLOWED_TEXT_DECORATION_SKIP_INK_VALUES = new Set([
  'auto',
  'none',
  'all',
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
      let hasOutlineColorOrWidth = false;
      let hasOutlineStyle = false;
      for (const decl of rule.nodes ?? []) {
        if (decl.type !== 'decl') continue;
        if (decl.prop.startsWith('--')) continue; // custom properties
        if (!ALLOWED_PROPERTIES.has(decl.prop)) {
          console.error(
            `${stylesheet}: property "${decl.prop}" is not in the closed catalog (${rule.selector})`,
          );
          failed = true;
        }
        if (decl.prop === 'outline-color' || decl.prop === 'outline-width') {
          hasOutlineColorOrWidth = true;
        }
        if (decl.prop === 'outline-style' || decl.prop === 'outline') {
          hasOutlineStyle = true;
        }
        // Coordinator addendum item B: `content` is admitted into the
        // property catalog only to create an icon-carrying pseudo-element
        // (`content: ""`, styled with `background-image`/`mask-image`),
        // never to inject author-controlled text through CSS.
        if (
          decl.prop === 'content' &&
          !EMPTY_STRING_LITERAL.test(decl.value.trim())
        ) {
          console.error(
            `${stylesheet}: "${rule.selector}" sets content to "${decl.value}", but only content: "" is admitted`,
          );
          failed = true;
        }
        if (
          decl.prop === 'text-decoration-skip-ink' &&
          !ALLOWED_TEXT_DECORATION_SKIP_INK_VALUES.has(
            decl.value.trim().toLowerCase(),
          )
        ) {
          console.error(
            `${stylesheet}: "${rule.selector}" sets text-decoration-skip-ink to ` +
              `"${decl.value}", but only auto|none|all is admitted`,
          );
          failed = true;
        }
      }
      // THD-H1: `outline-color`/`outline-width` paint nothing without
      // `outline-style` (its initial value is `none`), so a rule setting
      // one of the two longhands without also setting `outline-style` (or
      // the `outline` shorthand) is an inert declaration that a themed
      // focus ring must never regress into again.
      if (hasOutlineColorOrWidth && !hasOutlineStyle) {
        console.error(
          `${stylesheet}: "${rule.selector}" sets outline-color/outline-width without outline-style, which paints nothing (THD-H1)`,
        );
        failed = true;
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

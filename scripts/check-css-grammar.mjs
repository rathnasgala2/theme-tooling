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
 *
 * Theme contract 3: themes mostly set tokens, so every custom property must
 * be a `--gala-<token key>` of the closed 116-token catalog and its value
 * must satisfy that token type's allow-list grammar (no `url()`, `var()`,
 * `calc()`, `attr()`, expressions, quotes or braces can pass it). The
 * property allow-list below stays narrow; each contract-3 addition is
 * justified at its entry.
 */

import { normalizeCssValue } from './lib/css-value.mjs';
import { loadParsedStylesheets } from './lib/parsed-stylesheets.mjs';
import {
  THEME_TOKEN_CATALOG,
  isAdmittedTokenValue,
} from './theme-token-catalog.mjs';

/** @type {ReadonlyMap<string, string>} theme contract 3 token key -> type */
const TOKEN_TYPES_BY_KEY = new Map(THEME_TOKEN_CATALOG);

/** @type {ReadonlySet<string>} every non-custom property observed across
 * the five reference themes' shipped stylesheets, reviewed and accepted as
 * the closed authoring vocabulary. */
const ALLOWED_PROPERTIES = new Set([
  'animation-duration',
  // Contract 3 additions (every one is a paint or geometry property a
  // theme needs to skin the hooks): `aspect-ratio` and `object-fit` frame
  // card covers and avatars.
  'aspect-ratio',
  // `background` shorthand lets a skin rule paint a token (which may be a
  // gradient) in one declaration; external url() is still rejected by
  // `check-forbidden-constructs.mjs`.
  'background',
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
  // Per-corner radii: tabs, joined button groups and hero media round
  // only some corners, which the shorthand cannot express alone.
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-radius',
  'border-top',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
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
  // `display` and `gap` were already admitted; contract 3 skins use them
  // to switch a hook between block and grid/flex presentation.
  'gap',
  // `grid-template-columns` lets a skin change the column rhythm of the
  // grid hooks (`ui-grid`, `ui-footer-grid`) without new layout rules.
  'grid-template-columns',
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
  // `object-fit` frames media inside the aspect-ratio box above.
  'object-fit',
  // `opacity` dims secondary chrome and fades hover states.
  'opacity',
  'outline-color',
  'outline-width',
  'padding',
  'padding-inline-start',
  'padding-top',
  // `text-align` and `text-shadow` align and lift display text; a
  // text-shadow cannot reference an external resource.
  'text-align',
  'text-decoration-line',
  // Admitted only for its closed `auto|none|all` value set (see the
  // dedicated check below) — it never accepts an arbitrary length or
  // color the way most other admitted properties can.
  'text-decoration-skip-ink',
  'text-decoration-thickness',
  'text-shadow',
  'text-transform',
  'text-underline-offset',
  // `box-shadow`, `filter` and `transform` carry the card elevation, the
  // media filter and the hover lift tokens; `filter` additionally may not
  // contain `url()` (an SVG-filter fragment reference), see the dedicated
  // check below.
  'box-shadow',
  'filter',
  'transform',
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
  const parsedStylesheets = await loadParsedStylesheets();
  let failed = false;

  for (const { stylesheet, root } of parsedStylesheets) {
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
        if (decl.prop.startsWith('--')) {
          const key = decl.prop.startsWith('--gala-')
            ? decl.prop.slice('--gala-'.length)
            : undefined;
          const type =
            key === undefined ? undefined : TOKEN_TYPES_BY_KEY.get(key);
          if (type === undefined) {
            console.error(
              `${stylesheet}: custom property "${decl.prop}" is not a --gala-<key> of the closed token catalog (${rule.selector})`,
            );
            failed = true;
          } else if (
            !isAdmittedTokenValue(key, type, normalizeCssValue(decl.value))
          ) {
            console.error(
              `${stylesheet}: "${decl.prop}: ${decl.value}" is not a valid ${type} value for that token (${rule.selector})`,
            );
            failed = true;
          }
          continue;
        }
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
        if (decl.prop === 'filter' && /url\s*\(/i.test(decl.value)) {
          console.error(
            `${stylesheet}: "${rule.selector}" sets filter to "${decl.value}", but url() filter references are not admitted`,
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

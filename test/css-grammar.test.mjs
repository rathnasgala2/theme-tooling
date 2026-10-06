import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';
import { withAppendedStylesheetCss } from './helpers/scratch-stylesheet.mjs';

test('every declaration and at-rule is in the closed property/at-rule catalog, within the rule-count ceiling (THD-M4)', async () => {
  const { passed, output } = await runCheckScript('check-css-grammar.mjs');
  assert.ok(passed, output);
});

test('accepts the icon-rendering property set on a pseudo-element (content: "" plus background-image/mask-image sizing)', async () => {
  const { passed, output } = await withAppendedStylesheetCss(
    `@layer gala-test {\n[data-gala-publication-root] a::before {\n` +
      `  content: "";\n  display: inline-block;\n  width: 1em;\n  height: 1em;\n` +
      `  background-image: url("icon.svg");\n  background-size: contain;\n` +
      `  background-position: center;\n  background-repeat: no-repeat;\n` +
      `  mask-image: url("icon.svg");\n  mask-size: contain;\n  mask-repeat: no-repeat;\n` +
      `  inline-size: 1em;\n  block-size: 1em;\n}\n}\n`,
    (scratchRoot) =>
      runCheckScript('check-css-grammar.mjs', {
        env: { THEME_ROOT: scratchRoot },
      }),
  );
  assert.ok(passed, output);
});

test('rejects content set to a non-empty string (no text injection via CSS)', async () => {
  const { passed, output } = await withAppendedStylesheetCss(
    `@layer gala-test {\n[data-gala-publication-root] a::before {\n  content: "surprise";\n}\n}\n`,
    (scratchRoot) =>
      runCheckScript('check-css-grammar.mjs', {
        env: { THEME_ROOT: scratchRoot },
      }),
  );
  assert.equal(passed, false, 'a non-empty content value must be rejected');
  assert.match(output, /only content: "" is admitted/);
});

test('rejects a rule that sets outline-color/outline-width without outline-style (THD-H1: the longhands alone paint nothing)', async () => {
  const { passed, output } = await withAppendedStylesheetCss(
    `@layer gala-test {\n[data-gala-publication-root] a {\n  outline-color: red;\n  outline-width: 2px;\n}\n}\n`,
    (scratchRoot) =>
      runCheckScript('check-css-grammar.mjs', {
        env: { THEME_ROOT: scratchRoot },
      }),
  );
  assert.equal(
    passed,
    false,
    'an inert outline-color/outline-width pair with no outline-style must fail check-css-grammar',
  );
  assert.match(output, /outline-color.*outline-width.*without outline-style/i);
});

test('accepts text-decoration-skip-ink set to one of its closed auto|none|all values', async () => {
  const { passed, output } = await withAppendedStylesheetCss(
    `@layer gala-test {\n[data-gala-publication-root] a {\n  text-decoration-skip-ink: none;\n}\n}\n`,
    (scratchRoot) =>
      runCheckScript('check-css-grammar.mjs', {
        env: { THEME_ROOT: scratchRoot },
      }),
  );
  assert.ok(passed, output);
});

test('rejects text-decoration-skip-ink set to a value outside auto|none|all', async () => {
  const { passed, output } = await withAppendedStylesheetCss(
    `@layer gala-test {\n[data-gala-publication-root] a {\n  text-decoration-skip-ink: objects;\n}\n}\n`,
    (scratchRoot) =>
      runCheckScript('check-css-grammar.mjs', {
        env: { THEME_ROOT: scratchRoot },
      }),
  );
  assert.equal(
    passed,
    false,
    'text-decoration-skip-ink: objects must fail check-css-grammar',
  );
  assert.match(output, /text-decoration-skip-ink.*only auto\|none\|all/i);
});

/**
 * @param {string} body declarations for one rule appended to the theme
 * @returns {Promise<{passed: boolean, output: string}>} the check's outcome
 */
function checkAppendedDeclarations(body) {
  return withAppendedStylesheetCss(
    `@layer gala-test {\n[data-gala-publication-root] .g-card {\n${body}\n}\n}\n`,
    (scratchRoot) =>
      runCheckScript('check-css-grammar.mjs', {
        env: { THEME_ROOT: scratchRoot },
      }),
  );
}

test('accepts the contract-3 skin properties (shadow, opacity, transform, filter, aspect-ratio, object-fit, background, per-corner radii, text-shadow, text-align, grid columns)', async () => {
  const { passed, output } = await checkAppendedDeclarations(
    [
      'box-shadow: var(--gala-shadow-card);',
      'opacity: 0.9;',
      'transform: translate(0, -2px);',
      'filter: grayscale(1);',
      'aspect-ratio: 16 / 9;',
      'object-fit: cover;',
      'background: var(--gala-paint-chip);',
      'border-top-left-radius: 4px;',
      'border-top-right-radius: 4px;',
      'border-bottom-left-radius: 4px;',
      'border-bottom-right-radius: 4px;',
      'text-shadow: none;',
      'text-align: center;',
      'font-style: italic;',
      'gap: 1rem;',
      'display: grid;',
      'grid-template-columns: 1fr 1fr;',
    ].join('\n'),
  );
  assert.ok(passed, output);
});

test('rejects a property outside the closed catalog (position)', async () => {
  const { passed, output } =
    await checkAppendedDeclarations('position: fixed;');
  assert.equal(passed, false);
  assert.match(output, /property "position" is not in the closed catalog/);
});

test('rejects filter: url(...) (an SVG filter reference)', async () => {
  const { passed, output } =
    await checkAppendedDeclarations('filter: url(#f);');
  assert.equal(passed, false);
  assert.match(output, /url\(\) filter references are not admitted/);
});

test('accepts a token override with a valid value of its type', async () => {
  const { passed, output } = await checkAppendedDeclarations(
    '--gala-card-pad: 1rem 2rem;',
  );
  assert.ok(passed, output);
});

test('rejects a token value that breaks its type grammar (var(), url(), calc(), wrong type)', async () => {
  for (const declaration of [
    '--gala-card-pad: var(--gala-space-4);',
    '--gala-paint-chip: url(x.png);',
    '--gala-space-1: calc(1px + 2px);',
    '--gala-color-text: red;',
    '--gala-media-filter: blur(2px);',
  ]) {
    const { passed, output } = await checkAppendedDeclarations(declaration);
    assert.equal(passed, false, declaration);
    assert.match(output, /is not a valid/, declaration);
  }
});

test('rejects a custom property that is not a --gala-<token key> of the catalog', async () => {
  for (const declaration of [
    '--local: 1px;',
    '--gala-color-heading: #000000;',
  ]) {
    const { passed, output } = await checkAppendedDeclarations(declaration);
    assert.equal(passed, false, declaration);
    assert.match(output, /not a --gala-<key> of the closed token catalog/);
  }
});

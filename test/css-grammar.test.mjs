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

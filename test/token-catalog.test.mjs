import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  MODE_VARIANT_TYPES,
  THEME_TOKEN_CATALOG,
  isAdmittedTokenValue,
} from '../scripts/theme-token-catalog.mjs';

/**
 * `scripts/theme-token-catalog.mjs` mirrors the schema repository's grammar
 * module (not exported by the published package). These tests pin the
 * mirror to the one artifact the package does ship, its contract-3 example.
 */

const FIXTURE_URL = import.meta
  .resolve('@rathnasgala2/schemas/examples/valid/theme-contract/default-3.0.json');
const fixture = JSON.parse(await readFile(new URL(FIXTURE_URL), 'utf8'));

test('the mirrored catalog equals the schema fixture: 116 keys, same order, same types', () => {
  assert.equal(THEME_TOKEN_CATALOG.length, 116);
  assert.deepEqual(
    fixture.tokens.map((token) => [token.key, token.type]),
    THEME_TOKEN_CATALOG.map(([key, type]) => [key, type]),
  );
});

test('every schema fixture value (light and dark) is admitted by the mirrored grammar', () => {
  for (const token of fixture.tokens) {
    for (const mode of ['light', 'dark']) {
      assert.ok(
        isAdmittedTokenValue(token.key, token.type, token[mode]),
        `${token.key} ${mode}: ${token[mode]}`,
      );
    }
    if (!MODE_VARIANT_TYPES.includes(token.type)) {
      assert.equal(token.light, token.dark, `${token.key} is mode-invariant`);
    }
  }
});

test('the grammars are allow-lists: url(), var(), calc(), quotes, braces and unknown keywords are refused', () => {
  const cases = [
    ['paint-chip', 'paint', 'url(x.png)'],
    ['paint-chip', 'paint', 'linear-gradient(90deg, var(--a), #ffffff)'],
    ['space-1', 'length', 'calc(1px + 2px)'],
    ['space-1', 'length', '1pt'],
    ['card-pad', 'box', '1rem 1rem 1rem 1rem 1rem'],
    ['color-text', 'color', '#FFF'],
    ['color-text', 'color', 'red'],
    ['shadow-card', 'shadow', '0 0 0 0 #000000; color: red'],
    ['border-card', 'border', '1px dotted #000000'],
    ['duration-base', 'duration', '2001ms'],
    ['ease-standard', 'easing', 'ease-in'],
    ['quote-mark', 'keyword', 'close-quote'],
    ['font-body', 'font-family', '"Inter"'],
  ];
  for (const [key, type, value] of cases) {
    assert.equal(isAdmittedTokenValue(key, type, value), false, value);
  }
});

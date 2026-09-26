import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('every declaration and at-rule is in the closed property/at-rule catalog, within the rule-count ceiling (THD-M4)', async () => {
  const { passed, output } = await runCheckScript('check-css-grammar.mjs');
  assert.ok(passed, output);
});

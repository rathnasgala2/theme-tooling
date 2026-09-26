import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('the theme is within its own declared theme.json budgets (THD-M3)', async () => {
  const { passed, output } = await runCheckScript('check-budgets.mjs');
  assert.ok(passed, output);
});

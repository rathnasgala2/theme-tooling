import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('every selector in tokens.css/components.css/print.css resolves only to the template published styling contract hook catalog', async () => {
  const { passed, output } = await runCheckScript('check-css-hooks.mjs');
  assert.ok(passed, output);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('every named token pair clears WCAG 2.2 AA contrast in both the light and dark palette independently', async () => {
  const { passed, output } = await runCheckScript('check-contrast.mjs');
  assert.ok(passed, output);
});

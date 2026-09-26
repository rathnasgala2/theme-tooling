import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('theme.json validates against urn:gala:schema:theme-contract:2.0.0 (all 35 tokens, both palettes, exact order)', async () => {
  const { passed, output } = await runCheckScript('check-theme-schema.mjs');
  assert.ok(passed, output);
});

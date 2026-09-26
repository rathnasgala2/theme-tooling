import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('npm pack produces exactly the closed regular 0644 file set, and package.json is the closed 4-key shape', async () => {
  const { passed, output } = await runCheckScript('check-package-file-set.mjs');
  assert.ok(passed, output);
});

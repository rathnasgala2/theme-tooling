import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('the packed file set contains no JavaScript/TypeScript/executable/remote-reference construct', async () => {
  const { passed, output } = await runCheckScript(
    'check-forbidden-constructs.mjs',
  );
  assert.ok(passed, output);
});

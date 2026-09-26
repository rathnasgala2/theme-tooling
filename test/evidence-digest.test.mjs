/**
 * THD-M5: `evidenceDigest` must bind a runner's actual captured output,
 * not only its `disposition` — the original implementation hashed
 * `{fixtureId, runnerId, disposition: 'accepted'}` alone, so it reduced to
 * "did the child process exit zero" no matter what it printed. This is a
 * direct unit test of the exported digest primitive, independent of
 * spawning real child processes (see digest-cycle.test.mjs for the
 * end-to-end idempotency/currency coverage of the whole chain).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { computeObservedEvidenceDigest } from '../scripts/generate-theme-digests.mjs';

const BASE = {
  fixtureId: 'fixture-x',
  runnerId: 'runner-x',
  disposition: 'accepted',
};

test('computeObservedEvidenceDigest changes when the runner output changes, holding disposition fixed', () => {
  const a = computeObservedEvidenceDigest({
    ...BASE,
    output: 'PASS: 3/3 checks\n',
  });
  const b = computeObservedEvidenceDigest({
    ...BASE,
    output: 'PASS: 3/3 checks (extra line)\n',
  });
  assert.notEqual(
    a,
    b,
    'two different outputs with the same disposition must not collapse to the same digest',
  );
});

test('computeObservedEvidenceDigest is stable for the same fixtureId/runnerId/disposition/output', () => {
  const inputs = { ...BASE, output: 'PASS: 3/3 checks\n' };
  assert.equal(
    computeObservedEvidenceDigest(inputs),
    computeObservedEvidenceDigest(inputs),
  );
});

test('computeObservedEvidenceDigest does not reduce to a hash of disposition alone (the pre-THD-M5 defect)', () => {
  const withOutput = computeObservedEvidenceDigest({
    ...BASE,
    output: 'some real diagnostic text',
  });
  const tautological = computeObservedEvidenceDigest({ ...BASE, output: '' });
  assert.notEqual(
    withOutput,
    tautological,
    'a runner that prints diagnostics must not produce the same evidence digest as one that prints nothing',
  );
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { advisoriesIn, evaluateAudit } from '../scripts/npm-audit.mjs';

const ADVISORY = {
  source: 1,
  url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
  severity: 'high',
  title: 'fixture advisory',
};

test('audit evaluation rejects an advisory absent from the allowlist', () => {
  const advisories = advisoriesIn({
    vulnerabilities: { fixture: { via: [ADVISORY] } },
  });
  const result = evaluateAudit(advisories, [], '2026-10-11');
  assert.equal(result.blocking.length, 1);
  assert.equal(result.accepted.length, 0);
});

test('audit evaluation accepts a scoped, unexpired advisory', () => {
  const advisories = advisoriesIn({
    vulnerabilities: { fixture: { via: [ADVISORY] } },
  });
  const result = evaluateAudit(
    advisories,
    [
      {
        advisory: 'GHSA-aaaa-bbbb-cccc',
        packages: ['fixture'],
        reason: 'The fixture demonstrates a sufficiently documented exception.',
        expires: '2026-10-12',
      },
    ],
    '2026-10-11',
  );
  assert.deepEqual(result.blocking, []);
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.problems, []);
});

test('audit evaluation rejects expired and unused exceptions', () => {
  const result = evaluateAudit(
    [],
    [
      {
        advisory: 'GHSA-aaaa-bbbb-cccc',
        packages: ['fixture'],
        reason: 'The fixture demonstrates a sufficiently documented exception.',
        expires: '2026-10-10',
      },
    ],
    '2026-10-11',
  );
  assert.equal(result.problems.length, 2);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { findUnpinnedActionReferences } from '../scripts/check-workflow-pins.mjs';

const CHECKOUT_SHA = 'd23441a48e516b6c34aea4fa41551a30e30af803';
const DEPENDENCY_SHA = '0123456789abcdef0123456789abcdef01234567';

function checkoutWorkflow(refLine = `          ref: ${DEPENDENCY_SHA}`) {
  return [
    'jobs:',
    '  verify:',
    '    steps:',
    '      - name: Check out this repository',
    `        uses: actions/checkout@${CHECKOUT_SHA}`,
    '      - name: Check out the shared repository',
    `        uses: actions/checkout@${CHECKOUT_SHA}`,
    '        with:',
    '          repository: rathnasgala2/theme-tooling',
    refLine,
    '          path: theme-tooling',
  ].join('\n');
}

test('external checkout repository accepts a full immutable commit ref', () => {
  assert.deepEqual(
    findUnpinnedActionReferences(checkoutWorkflow(), 'ci.yml'),
    [],
  );
});

test('external checkout repository rejects a missing ref', () => {
  assert.deepEqual(
    findUnpinnedActionReferences(checkoutWorkflow(''), 'ci.yml'),
    [
      'ci.yml: rathnasgala2/theme-tooling checkout is missing a full commit SHA ref',
    ],
  );
});

test('external checkout repository rejects a mutable branch ref', () => {
  assert.deepEqual(
    findUnpinnedActionReferences(
      checkoutWorkflow('          ref: main'),
      'ci.yml',
    ),
    [
      'ci.yml: rathnasgala2/theme-tooling checkout ref main is not a full commit SHA',
    ],
  );
});

test('external checkout rejects a mutable ref when with precedes uses', () => {
  const source = [
    'jobs:',
    '  verify:',
    '    steps:',
    '      - name: Check out the shared repository',
    '        with:',
    '          repository: rathnasgala2/theme-tooling',
    '          ref: main',
    `        uses: actions/checkout@${CHECKOUT_SHA}`,
  ].join('\n');

  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), [
    'ci.yml: rathnasgala2/theme-tooling checkout ref main is not a full commit SHA',
  ]);
});

test('checkout fails closed for a flow-form with mapping', () => {
  const source = [
    'jobs:',
    '  verify:',
    '    steps:',
    `      - uses: actions/checkout@${CHECKOUT_SHA}`,
    '        with: { repository: rathnasgala2/theme-tooling, ref: main }',
  ].join('\n');

  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), [
    'ci.yml: actions/checkout uses an unsupported non-block with mapping; immutable repository ref cannot be verified',
  ]);
});

test('checkout fails closed for quoted flow-form keys', () => {
  const source = [
    'jobs:',
    '  verify:',
    '    steps:',
    `      - "uses": actions/checkout@${CHECKOUT_SHA}`,
    '        "with": { repository: rathnasgala2/theme-tooling, ref: main }',
  ].join('\n');

  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), [
    'ci.yml: actions/checkout uses an unsupported non-block with mapping; immutable repository ref cannot be verified',
  ]);
});

test('action references fail closed in a flow-form step mapping', () => {
  const source = [
    'jobs:',
    '  verify:',
    '    steps:',
    '      - { uses: actions/checkout@main }',
  ].join('\n');

  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), [
    'ci.yml: flow-form step containing uses is unsupported; immutable action reference cannot be verified',
  ]);
});

test('one checkout cannot borrow a later checkout ref', () => {
  const source = `${checkoutWorkflow('')}\n${checkoutWorkflow()}`;
  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), [
    'ci.yml: rathnasgala2/theme-tooling checkout is missing a full commit SHA ref',
  ]);
});

test('external checkout cannot borrow a ref from a later env block', () => {
  const source = `${checkoutWorkflow('')}\n        env:\n          ref: ${DEPENDENCY_SHA}`;
  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), [
    'ci.yml: rathnasgala2/theme-tooling checkout is missing a full commit SHA ref',
  ]);
});

test('self checkout ignores repository and ref keys outside with', () => {
  const source = [
    `- uses: actions/checkout@${CHECKOUT_SHA}`,
    '  env:',
    '    repository: rathnasgala2/theme-tooling',
    '    ref: main',
  ].join('\n');
  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), []);
});

test('self checkout without an explicit repository needs no ref', () => {
  const source = `- uses: actions/checkout@${CHECKOUT_SHA}`;
  assert.deepEqual(findUnpinnedActionReferences(source, 'ci.yml'), []);
});

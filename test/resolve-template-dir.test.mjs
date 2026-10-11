/**
 * Unit tests for `resolve-template-dir.mjs`: the exact installed package
 * default and the explicit `GALA_TEMPLATE_DIR` development override.
 */

import { strict as assert } from 'node:assert';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveTemplateDir } from '../scripts/resolve-template-dir.mjs';

const EXPECTED_INSTALLED_TEMPLATE_DIR = path.dirname(
  fileURLToPath(import.meta.resolve('@rathnasgala2/template/package.json')),
);

/**
 * Run `fn` with `GALA_TEMPLATE_DIR` set to `env`'s value (or unset when
 * absent), restoring it afterward regardless of outcome.
 *
 * @param {{GALA_TEMPLATE_DIR?: string}} env
 * @param {() => void} fn
 */
function withEnv(env, fn) {
  const previous = process.env.GALA_TEMPLATE_DIR;
  try {
    if (env.GALA_TEMPLATE_DIR === undefined) {
      delete process.env.GALA_TEMPLATE_DIR;
    } else {
      process.env.GALA_TEMPLATE_DIR = env.GALA_TEMPLATE_DIR;
    }
    fn();
  } finally {
    if (previous === undefined) delete process.env.GALA_TEMPLATE_DIR;
    else process.env.GALA_TEMPLATE_DIR = previous;
  }
}

test('resolveTemplateDir: resolves the installed vendored package by default', () => {
  withEnv({}, () => {
    assert.equal(resolveTemplateDir(), EXPECTED_INSTALLED_TEMPLATE_DIR);
  });
});

test('resolveTemplateDir: GALA_TEMPLATE_DIR overrides the installed package', () => {
  withEnv({ GALA_TEMPLATE_DIR: '/tmp/explicit-template-dir' }, () => {
    assert.equal(
      resolveTemplateDir(),
      path.resolve('/tmp/explicit-template-dir'),
    );
  });
});

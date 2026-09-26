/**
 * Unit tests for `resolve-template-dir.mjs`: the fixed relative default,
 * the `GALA_TEMPLATE_DIR` override, and the `WORKSPACE_ROOT` (DEC-015
 * name) override, plus their precedence.
 */

import { strict as assert } from 'node:assert';
import path from 'node:path';
import { test } from 'node:test';

import { resolveTemplateDir } from '../scripts/resolve-template-dir.mjs';

// resolveTemplateDir()'s fixed relative default resolves against the
// process's current working directory (the calling theme's `tooling/`
// directory), not this test file's own location — this package is shared
// across five theme repositories (see `bin/cli.mjs`).
const EXPECTED_DEFAULT_TEMPLATE_DIR = path.resolve(
  process.cwd(),
  '../../template',
);

/**
 * Run `fn` with `GALA_TEMPLATE_DIR`/`WORKSPACE_ROOT` set to `env`'s values
 * (or unset when a key is absent from `env`), restoring both to their
 * prior values afterward regardless of outcome.
 *
 * @param {{GALA_TEMPLATE_DIR?: string, WORKSPACE_ROOT?: string}} env
 * @param {() => void} fn
 */
function withEnv(env, fn) {
  const previous = {
    GALA_TEMPLATE_DIR: process.env.GALA_TEMPLATE_DIR,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT,
  };
  try {
    for (const key of /** @type {const} */ ([
      'GALA_TEMPLATE_DIR',
      'WORKSPACE_ROOT',
    ])) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    fn();
  } finally {
    for (const key of /** @type {const} */ ([
      'GALA_TEMPLATE_DIR',
      'WORKSPACE_ROOT',
    ])) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('resolveTemplateDir: falls back to the fixed relative default when neither override is set', () => {
  withEnv({}, () => {
    assert.equal(resolveTemplateDir(), EXPECTED_DEFAULT_TEMPLATE_DIR);
  });
});

test('resolveTemplateDir: WORKSPACE_ROOT resolves <WORKSPACE_ROOT>/template', () => {
  withEnv({ WORKSPACE_ROOT: '/tmp/some-workspace' }, () => {
    assert.equal(
      resolveTemplateDir(),
      path.resolve('/tmp/some-workspace', 'template'),
    );
  });
});

test('resolveTemplateDir: GALA_TEMPLATE_DIR takes precedence over WORKSPACE_ROOT when both are set', () => {
  withEnv(
    {
      GALA_TEMPLATE_DIR: '/tmp/explicit-template-dir',
      WORKSPACE_ROOT: '/tmp/some-workspace',
    },
    () => {
      assert.equal(
        resolveTemplateDir(),
        path.resolve('/tmp/explicit-template-dir'),
      );
    },
  );
});

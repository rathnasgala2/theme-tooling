import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runCheckScript } from './helpers/run-check.mjs';

test('npm pack produces exactly the closed regular 0644 file set, and package.json is the closed 5-key shape (THD-H6)', async () => {
  const { passed, output } = await runCheckScript('check-package-file-set.mjs');
  assert.ok(passed, output);
});

/**
 * @param {Record<string, unknown>} packageJson written as the fixture's own
 *   `package.json`
 * @returns {Promise<string>} a scratch npm-packable directory
 */
async function buildFixturePackage(packageJson) {
  const scratchRoot = await mkdtemp(path.join(tmpdir(), 'theme-shape-'));
  await writeFile(
    path.join(scratchRoot, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf8',
  );
  await writeFile(path.join(scratchRoot, 'README.md'), '# fixture\n', 'utf8');
  await writeFile(
    path.join(scratchRoot, 'LICENSE'),
    'fixture license\n',
    'utf8',
  );
  await writeFile(path.join(scratchRoot, 'a.css'), '@layer x {}\n', 'utf8');
  return scratchRoot;
}

const VALID_SHAPE = {
  name: '@rathnasgala2/fixture',
  version: '1.0.0',
  license: 'Apache-2.0',
  repository: {
    type: 'git',
    url: 'https://github.com/rathnasgala2/fixture.git',
  },
  files: ['a.css'],
};

test('rejects a package.json with an extra key beyond {files,license,name,repository,version}', async () => {
  const scratchRoot = await buildFixturePackage({
    ...VALID_SHAPE,
    description: 'not part of the closed shape',
  });
  try {
    const { passed, output } = await runCheckScript(
      'check-package-file-set.mjs',
      {
        env: { THEME_ROOT: scratchRoot },
      },
    );
    assert.equal(
      passed,
      false,
      'an extra top-level key must fail the shape gate',
    );
    assert.match(output, /not the closed shape/);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

test('rejects a package.json missing repository (THD-H6: exactly five keys, none optional)', async () => {
  const withoutRepository = { ...VALID_SHAPE };
  delete withoutRepository.repository;
  const scratchRoot = await buildFixturePackage(withoutRepository);
  try {
    const { passed, output } = await runCheckScript(
      'check-package-file-set.mjs',
      {
        env: { THEME_ROOT: scratchRoot },
      },
    );
    assert.equal(
      passed,
      false,
      'a missing repository key must fail the shape gate',
    );
    assert.match(output, /not the closed shape/);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

test('rejects a repository value that is not {type: "git", url: "https://github.com/..."}', async () => {
  const scratchRoot = await buildFixturePackage({
    ...VALID_SHAPE,
    repository: 'github:rathnasgala2/fixture',
  });
  try {
    const { passed, output } = await runCheckScript(
      'check-package-file-set.mjs',
      {
        env: { THEME_ROOT: scratchRoot },
      },
    );
    assert.equal(passed, false, 'a non-object repository must fail the gate');
    assert.match(output, /package.json.repository must be/);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

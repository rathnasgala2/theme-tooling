import { execFile } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { chmod, cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { loadPackedFileSet } from '../scripts/packed-files.mjs';
import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { runCheckScript } from './helpers/run-check.mjs';

const execFileAsync = promisify(execFile);
const GENERATE_SCRIPT = path.join(
  import.meta.dirname,
  '..',
  'scripts',
  'generate-theme-digests.mjs',
);

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

test('the theme.json digest cycle (fixtureDigest, evidenceDigest, integrity) is idempotent across two consecutive generator runs', async () => {
  // `node --test` runs suites concurrently, and `generate-theme-digests.mjs`
  // rewrites `theme.json` in place when run without `--check`. Running it
  // against the real checkout here would race `template-conformance.test.mjs`,
  // which loads `theme.json` through the theme package it points
  // `renderPublication` at, sometimes reading it mid-write. Instead, copy
  // the packed file set into a scratch directory and point every script at
  // it via `THEME_ROOT` (DEC-015 name) so the committed `theme.json` is
  // never mutated by this test.
  const themeRoot = resolveThemeRoot();
  const { packedFiles } = await loadPackedFileSet(themeRoot);
  const scratchRoot = await mkdtemp(path.join(tmpdir(), 'theme-digest-test-'));
  try {
    for (const relativePath of packedFiles) {
      const destination = path.join(scratchRoot, relativePath);
      await cp(path.join(themeRoot, relativePath), destination);
      // The packed-file-set/absence runners assert every packed member is
      // mode 0644; `cp` does not guarantee that survives a copy, so pin it.
      await chmod(destination, 0o644);
    }
    // The local runners spawned inside generate-theme-digests.mjs use
    // `<THEME_ROOT>/tooling` as their cwd (matching every real theme's
    // layout); it only needs to exist.
    await mkdir(path.join(scratchRoot, 'tooling'), { recursive: true });

    const env = { THEME_ROOT: scratchRoot };
    const generate = await runCheckScript('generate-theme-digests.mjs', {
      env,
    });
    assert.ok(generate.passed, generate.output);

    const check = await runCheckScript('generate-theme-digests.mjs', { env });
    assert.ok(check.passed, check.output);

    const themePath = path.join(scratchRoot, 'theme.json');
    const theme = JSON.parse(await readFile(themePath, 'utf8'));
    for (const field of [
      'fixtureDigest',
      'evidenceDigest',
      'integrity',
      'stylingContractDigest',
    ]) {
      assert.match(
        theme[field],
        DIGEST_PATTERN,
        `${field} must be a tagged sha256 digest`,
      );
    }
    // No digest appears in its own preimage (DEC-097 §4): the three
    // package-content-dependent digests must be pairwise distinct.
    assert.notEqual(theme.fixtureDigest, theme.evidenceDigest);
    assert.notEqual(theme.evidenceDigest, theme.integrity);
    assert.notEqual(theme.fixtureDigest, theme.integrity);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

test('digest:check passes against the real committed theme.json without mutating it (THD-H2)', async () => {
  const themeRoot = resolveThemeRoot();
  const themePath = path.join(themeRoot, 'theme.json');
  const before = await readFile(themePath, 'utf8');
  await execFileAsync(process.execPath, [GENERATE_SCRIPT, '--check'], {
    cwd: process.cwd(),
    env: process.env,
  });
  const after = await readFile(themePath, 'utf8');
  assert.equal(before, after, 'digest:check must never mutate the committed theme.json');
});

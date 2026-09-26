import { execFile } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../scripts/scratch-theme.mjs';
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
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
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
  assert.equal(
    before,
    after,
    'digest:check must never mutate the committed theme.json',
  );
});

test('digest:check fails on a committed theme.json with a stale asset digest, and still does not mutate the working tree (THD-H2)', async () => {
  // Regenerating from the packed CSS in a scratch copy must disagree with
  // a committed theme.json whose digest chain does not match those bytes
  // — the exact defect THD-H2 reports: a stale `sha256`/`integrity` that
  // slipped past `--check` because the un-flagged generator step rewrote
  // the file before the comparison ran.
  const themeRoot = resolveThemeRoot();
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
    const themePath = path.join(scratchRoot, 'theme.json');
    const theme = JSON.parse(await readFile(themePath, 'utf8'));
    // Mutate one committed asset digest so it disagrees with the packed
    // CSS bytes, without touching the CSS itself.
    theme.assets[0].sha256 =
      'sha256:0000000000000000000000000000000000000000000000000000000000000';
    await writeFile(themePath, JSON.stringify(theme, null, 2), 'utf8');
    const staleBytes = await readFile(themePath, 'utf8');

    let checkFailed = false;
    try {
      await execFileAsync(process.execPath, [GENERATE_SCRIPT, '--check'], {
        cwd: process.cwd(),
        env: { ...process.env, THEME_ROOT: scratchRoot },
      });
    } catch {
      checkFailed = true;
    }
    assert.ok(
      checkFailed,
      'digest:check must fail when the committed theme.json disagrees with a regeneration from the packed CSS',
    );

    const afterBytes = await readFile(themePath, 'utf8');
    assert.equal(
      afterBytes,
      staleBytes,
      'digest:check must never rewrite the committed theme.json, even when it fails',
    );
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
});

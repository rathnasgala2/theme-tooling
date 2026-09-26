import { execFile } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

test('generate-theme-digests.mjs produces byte-identical theme.json for the same theme copied to two different absolute paths (path independence)', async () => {
  // Every digest in the cycle must be a function of the packed file
  // *bytes*, never of the absolute path they happen to be read from — a
  // path-dependent digest would make theme.json non-reproducible across
  // machines/CI runners/worktrees. Copy the same packed file set into two
  // scratch roots of deliberately different absolute-path shape (one
  // nested under an extra, longer-named subdirectory) and assert the two
  // regenerated theme.json files are byte-for-byte identical.
  const themeRoot = resolveThemeRoot();
  const scratchRootA = await buildScratchThemeCopy(themeRoot);
  const scratchRootBParent = await buildScratchThemeCopy(themeRoot);
  const scratchRootB = path.join(
    path.dirname(scratchRootBParent),
    'a-differently-shaped-and-much-longer-absolute-path-segment',
    'nested',
  );
  try {
    await mkdir(scratchRootB, { recursive: true });
    await execFileAsync('cp', ['-R', `${scratchRootBParent}/.`, scratchRootB]);
    assert.notEqual(
      scratchRootA,
      scratchRootB,
      'fixture assumption: the two scratch roots must be different absolute paths',
    );

    // Both generator runs are expected to fail closed on the same
    // theme-content findings (if any) that the real committed theme
    // carries; only the exact bytes of what got written before that
    // failure need to agree between the two paths, so failures are
    // tolerated identically via runCheckScript rather than asserted away.
    const generateA = await runCheckScript('generate-theme-digests.mjs', {
      env: { THEME_ROOT: scratchRootA },
    });
    const generateB = await runCheckScript('generate-theme-digests.mjs', {
      env: { THEME_ROOT: scratchRootB },
    });
    assert.equal(
      generateA.passed,
      generateB.passed,
      'the same theme content must produce the same pass/fail disposition regardless of absolute path',
    );

    const themeA = await readFile(
      path.join(scratchRootA, 'theme.json'),
      'utf8',
    );
    const themeB = await readFile(
      path.join(scratchRootB, 'theme.json'),
      'utf8',
    );
    assert.equal(
      themeA,
      themeB,
      'theme.json bytes must be identical regardless of the absolute path the theme was generated from',
    );
  } finally {
    await rm(scratchRootA, { recursive: true, force: true });
    await rm(scratchRootBParent, { recursive: true, force: true });
    await rm(
      path.join(
        path.dirname(scratchRootBParent),
        'a-differently-shaped-and-much-longer-absolute-path-segment',
      ),
      {
        recursive: true,
        force: true,
      },
    );
  }
});

test('generate-theme-digests.mjs binds README.md content: editing it changes evidenceDigest/integrity (THD-M5)', async () => {
  // THD-M5's "path independence" finding was initially reported as
  // digest drift "~1 in 3 runs" at two different absolute paths for
  // "identical content". Investigation (30 consecutive iterations of the
  // path-independence test above, zero failures; a full byte-for-byte
  // read of generate-theme-digests.mjs/packed-files.mjs/buildEntries)
  // found no path-, timestamp-, or process-order-dependent input anywhere
  // in the digest chain. What the report actually observed was content
  // drift, not path drift: `README.md` is part of every theme's packed
  // file set (`packed-files.mjs`; npm always includes it in a published
  // tarball), so it participates in the digest chain exactly like a
  // stylesheet does, and two checkouts that were not diffed byte-for-byte
  // (e.g. two worktrees with different README.md content) legitimately
  // regenerate different digests. This test locks in that this is real,
  // intended behavior — not something a future change should "fix" by
  // excluding README.md from the chain.
  const themeRoot = resolveThemeRoot();
  const scratchRootA = await buildScratchThemeCopy(themeRoot);
  const scratchRootB = await buildScratchThemeCopy(themeRoot);
  try {
    const readmePath = path.join(scratchRootB, 'README.md');
    await writeFile(
      readmePath,
      `${await readFile(readmePath, 'utf8')}\n<!-- THD-M5 regression fixture edit -->\n`,
      'utf8',
    );

    const generateA = await runCheckScript('generate-theme-digests.mjs', {
      env: { THEME_ROOT: scratchRootA },
    });
    const generateB = await runCheckScript('generate-theme-digests.mjs', {
      env: { THEME_ROOT: scratchRootB },
    });
    assert.ok(generateA.passed, generateA.output);
    assert.ok(generateB.passed, generateB.output);

    const themeA = JSON.parse(
      await readFile(path.join(scratchRootA, 'theme.json'), 'utf8'),
    );
    const themeB = JSON.parse(
      await readFile(path.join(scratchRootB, 'theme.json'), 'utf8'),
    );
    assert.notEqual(
      themeA.evidenceDigest,
      themeB.evidenceDigest,
      'a README.md edit must change evidenceDigest',
    );
    assert.notEqual(
      themeA.integrity,
      themeB.integrity,
      'a README.md edit must change integrity',
    );
  } finally {
    await rm(scratchRootA, { recursive: true, force: true });
    await rm(scratchRootB, { recursive: true, force: true });
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

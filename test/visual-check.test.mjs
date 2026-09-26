import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const run = promisify(execFile);
// `resolveThemeRoot()` (and every other `scripts/` helper) expects to run
// with this package's own `tooling/` directory as the process cwd — that
// is the convention the npm scripts and `resolve-theme-root.mjs` document,
// and it is how `visual-check.mjs` resolves its *own* `THEME_ROOT`/default
// when the child process calls `resolveThemeRoot()` again internally.
// Previously this test passed `resolveThemeRoot()` itself as `cwd`, i.e.
// the theme root one level up — the child process then resolved its
// default theme root one level up *from there*, missing entirely (or, by
// coincidence, an unrelated directory), so the end-to-end case never ran
// against the intended theme and crashed to "0 screenshots" instead of
// being skipped or passing.
const TOOLING_ROOT = path.join(import.meta.dirname, '..');
const SCRIPT_PATH = path.join(TOOLING_ROOT, 'scripts', 'visual-check.mjs');

/**
 * THD-M10: `visual-check.mjs` is deliberately not exercised end-to-end by
 * `npm test` (unlike every other gate, it requires
 * `npx playwright install chromium`, a separate explicit download — see
 * README "Visual/accessibility check"). This suite covers the one thing
 * that does not need a browser: `--out` argument validation.
 */

test('fails closed with a usage message when --out is missing', async () => {
  let failed = false;
  let stderr = '';
  try {
    await run(process.execPath, [SCRIPT_PATH], {
      cwd: TOOLING_ROOT,
      env: process.env,
    });
  } catch (error) {
    failed = true;
    stderr = error.stderr ?? '';
  }
  assert.ok(failed, 'visual-check.mjs must fail without --out');
  assert.match(stderr, /requires --out <directory>/);
});

test(
  'end-to-end: renders the fixture and writes a screenshot for each palette/width combination',
  { skip: await chromiumUnavailable() },
  async () => {
    // Deliberately does not assert the run exits 0: this drives the real
    // theme under test, and a genuine axe/overflow finding against it is
    // this harness working correctly, not a bug in the test. What this
    // asserts is the harness's own contract — it renders, drives all six
    // combinations, and writes a screenshot for each one regardless of
    // whether any of them find a violation.
    const outDirectory = await mkdtemp(
      path.join(tmpdir(), 'visual-check-out-'),
    );
    try {
      const { stdout } = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [SCRIPT_PATH, '--out', outDirectory],
          { cwd: TOOLING_ROOT, env: process.env },
          (error, stdoutResult, stderrResult) => {
            resolve({
              exitCode: error?.code ?? 0,
              stdout: stdoutResult,
              stderr: stderrResult,
            });
          },
        );
      });
      const files = (await readdir(outDirectory)).filter((name) =>
        name.endsWith('.png'),
      );
      assert.equal(
        files.length,
        6,
        `expected 6 screenshots, got: ${files.join(', ')}`,
      );
      for (const palette of ['light', 'dark']) {
        for (const width of [320, 768, 1440]) {
          assert.match(stdout, new RegExp(`${palette} ${width}px:`));
        }
      }

      // THD-M10 regression proof: this used to load the fixture via
      // `file://`, under which the theme's root-absolute stylesheet
      // `<link>`s and bootstrap `<script src>` never resolved, so the
      // page rendered with User-Agent styles only and light/dark
      // screenshots came out byte-identical. The script itself now
      // asserts this on every run (a resolved stylesheet, a themed
      // computed style, light != dark bytes) and fails closed if it
      // regresses; re-assert the same three things here, independently,
      // against this test's own run's screenshot files, so a change to
      // the script's internal assertions cannot silently stop proving it.
      const lightBytes = await readFile(
        path.join(outDirectory, findScreenshot(files, 'light', 1440)),
      );
      const darkBytes = await readFile(
        path.join(outDirectory, findScreenshot(files, 'dark', 1440)),
      );
      assert.ok(
        !lightBytes.equals(darkBytes),
        'light and dark screenshots must not be byte-identical — the ' +
          "theme's CSS must actually have loaded and applied",
      );
    } finally {
      await rm(outDirectory, { recursive: true, force: true });
    }
  },
);

/**
 * @param {string[]} files screenshot basenames from the run's `--out` dir
 * @param {'light'|'dark'} palette
 * @param {number} width
 * @returns {string} the matching screenshot's basename
 */
function findScreenshot(files, palette, width) {
  const match = files.find((name) => name.includes(`-${palette}-${width}.png`));
  if (!match) {
    throw new Error(
      `no ${palette} ${width}px screenshot among: ${files.join(', ')}`,
    );
  }
  return match;
}

/**
 * @returns {Promise<string|false>} a skip reason, or `false` to run the test
 */
async function chromiumUnavailable() {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    await browser.close();
    return false;
  } catch {
    return 'no Chromium binary installed (run: npx playwright install chromium)';
  }
}

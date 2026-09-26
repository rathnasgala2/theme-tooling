import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';

const run = promisify(execFile);
const SCRIPT_PATH = path.join(
  import.meta.dirname,
  '..',
  'scripts',
  'visual-check.mjs',
);

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
      cwd: resolveThemeRoot(),
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
          { cwd: resolveThemeRoot(), env: process.env },
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
    } finally {
      await rm(outDirectory, { recursive: true, force: true });
    }
  },
);

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

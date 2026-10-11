import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { resolveTemplateDir } from '../scripts/resolve-template-dir.mjs';
import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import {
  buildVisualScenarios,
  themeCssFailures,
} from '../scripts/visual-check.mjs';

const run = promisify(execFile);
// `SCRIPT_PATH` always lives in *this* checkout's `scripts/` directory —
// that part is safe to resolve from `import.meta.dirname` regardless of
// how this suite is invoked.
//
// The theme and template roots under test are different things entirely,
// and must not be derived from `import.meta.dirname`: when this suite runs as part of
// a theme's own `verify` (THEME_ROOT unset, cwd = the theme's `tooling/`
// directory, this checkout reached only via `GALA_THEME_TOOLING_DIR`),
// `import.meta.dirname` still points at *this* package's own `test/`
// directory, not the calling theme's — deriving a cwd from it would send
// the child process's own `resolveThemeRoot()` looking one level up from
// the wrong place. `resolveThemeRoot()` itself, called here with this
// process's own cwd/env, resolves correctly in every supported
// invocation (standalone with `THEME_ROOT` set, or from a theme's
// `tooling/` with it unset) — so this test resolves it once, up front,
// in the parent process, and hands the child that resolved absolute path
// explicitly via absolute `THEME_ROOT` and `GALA_TEMPLATE_DIR` env vars.
// Their child resolvers then read those overrides rather than recomputing
// cwd-relative values from the tooling checkout.
const TOOLING_ROOT = path.join(import.meta.dirname, '..');
const SCRIPT_PATH = path.join(TOOLING_ROOT, 'scripts', 'visual-check.mjs');
const RESOLVED_THEME_ROOT = resolveThemeRoot();
const RESOLVED_TEMPLATE_DIR = resolveTemplateDir();
const THEME_CONTRACT_VERSION = JSON.parse(
  await readFile(path.join(RESOLVED_THEME_ROOT, 'theme.json'), 'utf8'),
).contractVersion;
const TEMPLATE_CONFORMANCE_SKIP =
  THEME_CONTRACT_VERSION === '4.0.0'
    ? false
    : `template 4 visual conformance requires a contract-4 theme; the standalone fixture is archived contract ${THEME_CONTRACT_VERSION}`;

/**
 * THD-M10: the end-to-end case runs when a Chromium binary is present and
 * skips otherwise (`npx playwright install chromium` is a separate explicit
 * download). Argument validation always runs without a browser.
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

test('scenario plan covers article palettes and widths plus bounded home, author and listing checks', () => {
  const scenarios = buildVisualScenarios({
    home: 'site/index.html',
    article: 'site/article/index.html',
    author: 'site/authors/writer/index.html',
    listing: 'site/tags/topic/index.html',
  });
  assert.equal(scenarios.length, 12);
  assert.deepEqual(
    scenarios.filter((scenario) => scenario.routeKind === 'article'),
    ['light', 'dark'].flatMap((palette) =>
      [320, 768, 1440].map((width) => ({
        routeKind: 'article',
        routePath: 'site/article/index.html',
        palette,
        width,
      })),
    ),
  );
  for (const routeKind of ['home', 'author', 'listing']) {
    assert.deepEqual(
      scenarios
        .filter((scenario) => scenario.routeKind === routeKind)
        .map(({ palette, width }) => ({ palette, width })),
      [
        { palette: 'light', width: 320 },
        { palette: 'light', width: 1440 },
      ],
    );
  }
});

test('theme CSS evidence fails closed when expected theme stylesheets are absent', () => {
  const failures = themeCssFailures({
    expectedStylesheets: ['tokens.css', 'components.css'],
    stylesheetStatuses: new Map(),
    expectedTokenValue: '#123456',
    computedTokenValue: '',
  });
  assert.equal(failures.length, 3);
  assert.match(failures.join('\n'), /tokens\.css.*did not resolve/u);
  assert.match(failures.join('\n'), /components\.css.*did not resolve/u);
  assert.match(failures.join('\n'), /expected theme token #123456/u);
});

test(
  'end-to-end: checks article palettes and widths plus bounded home, author and listing scenarios',
  { skip: TEMPLATE_CONFORMANCE_SKIP || (await chromiumUnavailable()) },
  async () => {
    const outDirectory = await mkdtemp(
      path.join(tmpdir(), 'visual-check-out-'),
    );
    try {
      const { exitCode, stdout, stderr } = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [SCRIPT_PATH, '--out', outDirectory],
          {
            cwd: TOOLING_ROOT,
            // THD-M10: pass the absolute theme and template roots resolved
            // before changing the child cwd; relative caller overrides are
            // otherwise reinterpreted from the tooling checkout.
            env: {
              ...process.env,
              THEME_ROOT: RESOLVED_THEME_ROOT,
              GALA_TEMPLATE_DIR: RESOLVED_TEMPLATE_DIR,
            },
          },
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
        12,
        `expected 12 screenshots, got: ${files.join(', ')}; ` +
          `visual-check exit=${exitCode}, stderr=${stderr}`,
      );
      assert.equal(
        exitCode,
        0,
        `visual-check must pass its own accessibility, overflow and theme-CSS gates: ${stderr}`,
      );
      for (const palette of ['light', 'dark']) {
        for (const width of [320, 768, 1440]) {
          assert.match(stdout, new RegExp(`article ${palette} ${width}px:`));
        }
      }
      for (const routeKind of ['home', 'author', 'listing']) {
        for (const width of [320, 1440]) {
          assert.match(stdout, new RegExp(`${routeKind} light ${width}px:`));
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
        path.join(
          outDirectory,
          findScreenshot(files, 'article', 'light', 1440),
        ),
      );
      const darkBytes = await readFile(
        path.join(outDirectory, findScreenshot(files, 'article', 'dark', 1440)),
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
 * @param {'home'|'article'|'author'|'listing'} routeKind
 * @param {'light'|'dark'} palette
 * @param {number} width
 * @returns {string} the matching screenshot's basename
 */
function findScreenshot(files, routeKind, palette, width) {
  const match = files.find((name) =>
    name.includes(`-${routeKind}-${palette}-${width}.png`),
  );
  if (!match) {
    throw new Error(
      `no ${routeKind} ${palette} ${width}px screenshot among: ${files.join(', ')}`,
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

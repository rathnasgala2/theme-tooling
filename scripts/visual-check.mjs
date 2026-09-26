#!/usr/bin/env node
/**
 * THD-M10: shared Playwright + axe-core visual/accessibility harness.
 *
 * Renders the rich fixture publication (`visual-fixture.mjs`) once through
 * the template's own renderer (`renderPublication`, resolved from
 * `GALA_TEMPLATE_DIR`) with the theme under test, then loads that one
 * rendered page in headless Chromium at three representative viewport
 * widths (320/768/1440px), for each of the two palettes — light and dark
 * selected via Playwright's `colorScheme` context option, which the
 * template's own pre-paint bootstrap script resolves through
 * `prefers-color-scheme` exactly as it would for a real visitor's OS-level
 * preference (the server-rendered markup always carries the same
 * deterministic `light` default; see `visual-fixture.mjs`):
 *
 * - runs an axe-core accessibility scan, failing on any `serious` or
 *   `critical` violation;
 * - asserts the page has no horizontal overflow at that width;
 * - writes a full-page screenshot to the caller-named `--out` directory.
 *
 * Not part of `bin/cli.mjs`'s `verify`/`VERIFY_SEQUENCE`: unlike every
 * other gate, this one requires a browser binary on disk
 * (`npx playwright install chromium`, a one-time, explicit, pinned
 * download — see README "Visual/accessibility check"), so theme CI runs it
 * as its own job (`npm run visual:check -- --out <dir>`) rather than
 * silently imposing that install step on every local `npm run verify`.
 *
 * Usage: `node visual-check.mjs --out <directory>` (screenshots are
 * written there; the directory is created if needed and never committed).
 */

import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { resolveTemplateDir } from './resolve-template-dir.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { buildVisualCheckFixture } from './visual-fixture.mjs';

/** @type {readonly number[]} representative narrow/tablet/desktop widths. */
const VIEWPORT_WIDTHS = [320, 768, 1440];
/** @type {readonly ('light'|'dark')[]} */
const PALETTES = ['light', 'dark'];
/** @type {ReadonlySet<string>} axe-core impact levels this gate fails on. */
const FAILING_IMPACTS = new Set(['serious', 'critical']);
/** @type {number} fixed viewport height; only width varies by breakpoint. */
const VIEWPORT_HEIGHT = 1000;

/**
 * @param {string} n an arbitrary short suffix
 * @returns {string} a schema-shaped placeholder `sha256:` digest
 */
function digest(n) {
  return `sha256:${'0'.repeat(64 - String(n).length)}${n}`;
}

/**
 * A schema-valid, deterministic placeholder `provenance` bundle (the same
 * convention `test/fixtures/test-provenance.mjs` uses; duplicated here so
 * `scripts/` does not depend on `test/` — see `visual-fixture.mjs`).
 *
 * @returns {Record<string, unknown>} a fresh provenance bundle
 */
function visualCheckProvenance() {
  return {
    builder: {
      package: '@rathnasgala2/publish-action',
      version: '2.0.0',
      integrity: digest(1),
      registry: 'https://fixture-1.example.com/',
    },
    repositoryCoordinate: 'fixture-owner/fixture-repository',
    workflowIdentity: digest(1),
    buildToolVersions: [
      { kind: 'runtime', name: 'node', version: '24.18.0', digest: digest(1) },
      { kind: 'runtime', name: 'npm', version: '11.16.0', digest: digest(2) },
      {
        kind: 'package',
        package: '@rathnasgala2/schemas',
        version: '2.0.0',
        digest: digest(3),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/template',
        version: '2.0.0',
        digest: digest(4),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/theme-default',
        version: '2.0.0',
        digest: digest(5),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/publish-action',
        version: '2.0.0',
        digest: digest(6),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/publish-kernel',
        version: '2.0.0',
        digest: digest(7),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/adapter-protocol',
        version: '2.0.0',
        digest: digest(8),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/adapter-local-directory',
        version: '2.0.0',
        digest: digest(9),
      },
    ],
  };
}

/**
 * @param {string[]} argv `process.argv.slice(2)`
 * @returns {{outDirectory: string}} parsed options
 */
function parseArgs(argv) {
  const flagIndex = argv.indexOf('--out');
  if (flagIndex === -1 || !argv[flagIndex + 1]) {
    throw new Error(
      'visual:check requires --out <directory> (screenshots are written ' +
        'there and are never committed): node visual-check.mjs --out <dir>',
    );
  }
  return { outDirectory: path.resolve(argv[flagIndex + 1]) };
}

/**
 * Render the fixture once against the theme under test.
 *
 * @param {string} themeRoot the theme under test's root directory
 * @param {string} templateDir the `@rathnasgala2/template` checkout
 * @param {string} workRoot a scratch directory for this run's render I/O
 * @returns {Promise<string>} the absolute path to the rendered HTML route
 */
async function renderFixture(themeRoot, templateDir, workRoot) {
  const { renderPublication } = await import(
    pathToFileURL(path.join(templateDir, 'src', 'core', 'index.js')).href
  );
  const buildInput = await buildVisualCheckFixture();
  const outputDirectory = path.join(workRoot, 'output');
  const workDirectory = path.join(workRoot, 'work');
  const sourceDirectory = path.join(workRoot, 'source');
  await mkdir(sourceDirectory, { recursive: true });

  const { manifest } = await renderPublication(buildInput, {
    outputDirectory,
    workDirectory,
    sourceDirectory,
    themeDirectory: themeRoot,
    provenance: visualCheckProvenance(),
  });
  // The rendered publication has several `html` routes (the article, its
  // archive/tag/author index pages, the site index, the 404 page). The
  // article carrying this fixture's rich markdown body is reliably the
  // largest of them — every index page is a short list of links to it.
  const htmlRoutes = manifest.routes.filter(
    (route) => route.routeClass === 'html',
  );
  const [articleRoute] = [...htmlRoutes].sort(
    (a, b) => Number(b.byteLength) - Number(a.byteLength),
  );
  if (!articleRoute) {
    throw new Error('no html route rendered for the fixture');
  }
  return path.join(outputDirectory, articleRoute.path);
}

/**
 * @param {import('playwright').Page} page
 * @param {string} axeSource the full `axe.min.js` source
 * @returns {Promise<{violations: {id: string, impact: string|null, help: string, nodes: {target: string[]}[]}[]}>}
 */
async function runAxe(page, axeSource) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run();
  });
}

async function main() {
  const { outDirectory } = parseArgs(process.argv.slice(2));
  await mkdir(outDirectory, { recursive: true });

  const themeRoot = resolveThemeRoot();
  const templateDir = resolveTemplateDir();
  const themeName = JSON.parse(
    await readFile(path.join(themeRoot, 'package.json'), 'utf8'),
  ).name;
  const axeSource = await readFile(
    path.join(
      path.dirname(
        new URL(import.meta.resolve('axe-core/package.json')).pathname,
      ),
      'axe.min.js',
    ),
    'utf8',
  );

  const workRoot = path.join(outDirectory, '.render-work');
  await rm(workRoot, { recursive: true, force: true });

  const browser = await chromium.launch();
  let failed = false;
  try {
    const htmlPath = await renderFixture(themeRoot, templateDir, workRoot);
    const pageUrl = pathToFileURL(htmlPath).href;

    for (const palette of PALETTES) {
      for (const width of VIEWPORT_WIDTHS) {
        const page = await browser.newPage({
          viewport: { width, height: VIEWPORT_HEIGHT },
          // Selects light vs dark the same way a real visitor's OS-level
          // preference would: the template's pre-paint bootstrap script
          // reads `prefers-color-scheme` on a fresh session (see
          // `visual-fixture.mjs`).
          colorScheme: palette,
          // The rendered page carries its own per-artifact CSP baseline
          // (a `script-src 'self'` meta tag), which would otherwise block
          // the inline axe-core `<script>` this harness injects to run
          // the scan. Bypassing CSP only affects this harness's own probe
          // page, not a claim about the theme/template's real policy.
          bypassCSP: true,
        });
        try {
          await page.goto(pageUrl, { waitUntil: 'load' });

          /* eslint-disable no-undef -- runs in the browser via
             page.evaluate, not in this Node process. */
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          /* eslint-enable no-undef */
          if (overflow.scrollWidth > overflow.clientWidth) {
            console.error(
              `${themeName} ${palette} ${width}px: horizontal overflow ` +
                `(scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`,
            );
            failed = true;
          }

          const { violations } = await runAxe(page, axeSource);
          const failingViolations = violations.filter((violation) =>
            FAILING_IMPACTS.has(violation.impact ?? ''),
          );
          for (const violation of failingViolations) {
            console.error(
              `${themeName} ${palette} ${width}px: axe ${violation.impact} ` +
                `"${violation.id}" (${violation.help}) on ` +
                `${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
            );
          }
          if (failingViolations.length > 0) failed = true;

          const screenshotPath = path.join(
            outDirectory,
            `${themeName.replace('/', '_')}-${palette}-${width}.png`,
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(
            `${themeName} ${palette} ${width}px: ${failingViolations.length} ` +
              `failing axe violation(s), overflow=${overflow.scrollWidth > overflow.clientWidth} ` +
              `-> ${screenshotPath}`,
          );
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    await rm(workRoot, { recursive: true, force: true });
  }

  if (failed) {
    console.error('\nvisual:check failed: see violations/overflow above.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `\nvisual:check passed: ${PALETTES.length} palette(s) x ` +
      `${VIEWPORT_WIDTHS.length} viewport(s), no serious/critical axe ` +
      `violations, no horizontal overflow.`,
  );
}

await main();

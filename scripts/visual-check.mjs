#!/usr/bin/env node
/**
 * THD-M10: shared Playwright + axe-core visual/accessibility harness.
 *
 * Renders the rich fixture publication (`visual-fixture.mjs`) once through
 * the template's own renderer (`renderPublication`, resolved from
 * `GALA_TEMPLATE_DIR`) with the theme under test, serves the render
 * output directory over a loopback-only HTTP server
 * (`static-file-server.mjs`) — the template emits root-absolute asset
 * references (`<link href="/assets/...">`, a bootstrap `<script
 * src="/...">`), which only resolve against a real HTTP origin, not
 * `file://` — then loads that one rendered page in headless Chromium at
 * three representative viewport widths (320/768/1440px), for each of the
 * two palettes — light and dark selected via Playwright's `colorScheme`
 * context option, which the template's own pre-paint bootstrap script
 * resolves through `prefers-color-scheme` exactly as it would for a real
 * visitor's OS-level preference (the server-rendered markup always
 * carries the same deterministic `light` default; see
 * `visual-fixture.mjs`):
 *
 * - asserts at least one theme stylesheet `<link>` actually resolved
 *   (HTTP 200), and that a computed style on `[data-gala-publication-root]`
 *   differs from the User-Agent default — proof the theme's CSS loaded
 *   at all, not just that the harness ran without error;
 * - runs an axe-core accessibility scan, failing on any `serious` or
 *   `critical` violation;
 * - asserts the page has no horizontal overflow at that width;
 * - writes a full-page screenshot to the caller-named `--out` directory,
 *   and asserts the light and dark screenshots at a given width differ
 *   (proof the two palettes actually render differently).
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

import { buildFixtureProvenance } from './fixture-provenance.mjs';
import { resolveTemplateDir } from './resolve-template-dir.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { startStaticFileServer } from './static-file-server.mjs';
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
 * @returns {Promise<{outputDirectory: string, routePath: string}>} the
 *   rendered output directory (to be served over HTTP) and the article
 *   route's path relative to it
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
    provenance: buildFixtureProvenance(),
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
  return { outputDirectory, routePath: articleRoute.path };
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
  /** @type {Map<number, Buffer>} width -> light-palette screenshot bytes,
   * used after the loop to prove light and dark actually differ. */
  const lightScreenshotsByWidth = new Map();
  let server;
  try {
    const { outputDirectory, routePath } = await renderFixture(
      themeRoot,
      templateDir,
      workRoot,
    );
    server = await startStaticFileServer(outputDirectory);
    const pageUrl = `${server.origin}/${routePath}`;

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
          // page, not a claim about the theme/template's real policy — it
          // does not affect whether the theme's own stylesheets/scripts
          // load, which now happens over a real HTTP origin instead.
          bypassCSP: true,
        });
        try {
          /** @type {number[]} HTTP status codes for stylesheet responses. */
          const stylesheetStatuses = [];
          page.on('response', (response) => {
            if (response.request().resourceType() === 'stylesheet') {
              stylesheetStatuses.push(response.status());
            }
          });

          await page.goto(pageUrl, { waitUntil: 'load' });

          // The fixture's own page must never link to itself. Chromium
          // applies `:visited` styling to any `<a href>` whose resolved
          // URL is already in the browsing context's history — which,
          // for a self-referencing link, is true the instant `page.goto`
          // above commits, with no click ever needed. Worse, even a
          // genuine `:visited` link would not help this harness catch a
          // contrast regression on it: `getComputedStyle` (what axe-core's
          // color-contrast check reads) is spec-required to always report
          // the *unvisited* style for privacy reasons, no matter what
          // color the browser actually painted — so a self-referencing
          // link's real rendered color is permanently unobservable to
          // this harness. The fixture (`visual-fixture.mjs`) must
          // therefore keep every link (nav, footer nav, breadcrumb, skip
          // link) pointing somewhere other than the page being loaded;
          // this assertion catches a future fixture change that
          // reintroduces one, rather than letting it silently degrade
          // into an unverifiable no-op check.
          /* eslint-disable no-undef -- runs in the browser via
             page.evaluate, not in this Node process. */
          const selfReferencingHrefs = await page.evaluate(() => {
            const current = new URL(location.href);
            current.hash = '';
            return Array.from(document.querySelectorAll('a[href]'))
              .map((a) => a.getAttribute('href'))
              .filter((href) => {
                if (!href || href.startsWith('#')) return false;
                const resolved = new URL(href, location.href);
                resolved.hash = '';
                return resolved.href === current.href;
              });
          });
          /* eslint-enable no-undef */
          if (selfReferencingHrefs.length > 0) {
            console.error(
              `${themeName} ${palette} ${width}px: fixture page links to ` +
                `itself (${selfReferencingHrefs.join(', ')}) — this makes ` +
                'any :visited styling on that link unverifiable by this ' +
                'harness; fix visual-fixture.mjs to point every internal ' +
                'link elsewhere',
            );
            failed = true;
          }

          if (!stylesheetStatuses.some((status) => status === 200)) {
            console.error(
              `${themeName} ${palette} ${width}px: no theme stylesheet ` +
                `resolved with HTTP 200 (statuses seen: ` +
                `${stylesheetStatuses.join(', ') || 'none'}) — the theme's ` +
                'CSS did not load',
            );
            failed = true;
          }

          /* eslint-disable no-undef -- runs in the browser via
             page.evaluate, not in this Node process. */
          const rootStyle = await page.evaluate(() => {
            const root = document.querySelector('[data-gala-publication-root]');
            if (!root) return null;
            const computed = getComputedStyle(root);
            return {
              backgroundColor: computed.backgroundColor,
              fontFamily: computed.fontFamily,
            };
          });
          /* eslint-enable no-undef */
          if (!rootStyle) {
            throw new Error(
              '[data-gala-publication-root] not found in the rendered page',
            );
          }
          // The template's own UA-stylesheet-only default for an
          // unstyled element is a fully transparent background; every
          // theme's `components.css` sets `background-color` on the
          // publication root from a token, so a transparent computed
          // value here proves the theme's CSS never applied.
          if (
            rootStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ||
            rootStyle.backgroundColor === 'transparent'
          ) {
            console.error(
              `${themeName} ${palette} ${width}px: ` +
                '[data-gala-publication-root] computed background-color is ' +
                `the User-Agent default (${rootStyle.backgroundColor}) — ` +
                'the theme CSS did not apply',
            );
            failed = true;
          }

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
          const screenshotBuffer = await page.screenshot({
            path: screenshotPath,
            fullPage: true,
          });
          if (palette === 'light') {
            lightScreenshotsByWidth.set(width, screenshotBuffer);
          } else if (palette === 'dark') {
            const lightBuffer = lightScreenshotsByWidth.get(width);
            if (lightBuffer && lightBuffer.equals(screenshotBuffer)) {
              console.error(
                `${themeName} ${width}px: light and dark screenshots are ` +
                  'byte-identical — the dark palette did not render ' +
                  'differently',
              );
              failed = true;
            }
          }
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
    if (server) await server.close();
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

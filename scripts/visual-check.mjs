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
 * visitor's OS-level preference. The Article receives the full two-palette,
 * three-width matrix. Home, Author and Listing each receive light-palette
 * phone and desktop checks, keeping the gate bounded at twelve scenarios:
 *
 * - asserts every declared non-print theme stylesheet resolved with HTTP
 *   200 and that a computed custom property equals the theme contract's
 *   palette value — proof the theme CSS itself loaded and applied;
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

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { buildFixtureProvenance } from './fixture-provenance.mjs';
import { resolveTemplateDir } from './resolve-template-dir.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { startStaticFileServer } from './static-file-server.mjs';
import {
  buildVisualCheckFixture,
  VISUAL_FIXTURE_HERO_BYTES,
  VISUAL_FIXTURE_HERO_PATH,
} from './visual-fixture.mjs';

/** @type {readonly number[]} representative narrow/tablet/desktop widths. */
const VIEWPORT_WIDTHS = [320, 768, 1440];
/** @type {readonly ('light'|'dark')[]} */
const PALETTES = ['light', 'dark'];
/** @type {ReadonlySet<string>} axe-core impact levels this gate fails on. */
const FAILING_IMPACTS = new Set(['serious', 'critical']);
/** @type {number} fixed viewport height; only width varies by breakpoint. */
const VIEWPORT_HEIGHT = 1000;
const ROUTE_KINDS = ['home', 'article', 'author', 'listing'];

/**
 * Keep the exhaustive palette/width matrix on the content-dense Article and
 * add only phone/desktop light checks for the other composition surfaces.
 *
 * @param {Record<'home'|'article'|'author'|'listing', string>} routePaths
 * @returns {{routeKind: 'home'|'article'|'author'|'listing', routePath: string, palette: 'light'|'dark', width: number}[]}
 */
export function buildVisualScenarios(routePaths) {
  const article = PALETTES.flatMap((palette) =>
    VIEWPORT_WIDTHS.map((width) => ({
      routeKind: /** @type {const} */ ('article'),
      routePath: routePaths.article,
      palette,
      width,
    })),
  );
  const supporting = ['home', 'author', 'listing'].flatMap((routeKind) =>
    [320, 1440].map((width) => ({
      routeKind: /** @type {'home'|'author'|'listing'} */ (routeKind),
      routePath: routePaths[routeKind],
      palette: /** @type {const} */ ('light'),
      width,
    })),
  );
  return [...article, ...supporting];
}

/**
 * Produce concrete failures for missing theme responses or a theme token
 * that did not win the cascade. Kept pure so fail-closed behavior is covered
 * without requiring a browser fault-injection seam.
 *
 * @param {object} evidence
 * @param {readonly string[]} evidence.expectedStylesheets
 * @param {Map<string, number|readonly number[]>} evidence.stylesheetStatuses
 * @param {string} evidence.expectedTokenValue
 * @param {string} evidence.computedTokenValue
 * @returns {string[]}
 */
export function themeCssFailures({
  expectedStylesheets,
  stylesheetStatuses,
  expectedTokenValue,
  computedTokenValue,
}) {
  const failures = [];
  for (const stylesheet of expectedStylesheets) {
    const observed = stylesheetStatuses.get(stylesheet);
    const statuses = Array.isArray(observed)
      ? observed
      : observed === undefined
        ? []
        : [observed];
    if (!statuses.includes(200)) {
      failures.push(
        `${stylesheet} did not resolve with HTTP 200 (statuses: ${statuses.join(', ') || 'none'})`,
      );
    }
  }
  if (
    computedTokenValue.trim().toLowerCase() !==
    expectedTokenValue.trim().toLowerCase()
  ) {
    failures.push(
      `expected theme token ${expectedTokenValue}, got ${computedTokenValue || 'an empty value'}`,
    );
  }
  return failures;
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
 * @returns {Promise<{outputDirectory: string, routePaths: Record<'home'|'article'|'author'|'listing', string>}>}
 *   the rendered output directory and one representative route per
 *   composition surface
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
  const fixtureHeroPath = path.join(sourceDirectory, VISUAL_FIXTURE_HERO_PATH);
  await mkdir(path.dirname(fixtureHeroPath), { recursive: true });
  await writeFile(fixtureHeroPath, VISUAL_FIXTURE_HERO_BYTES);

  const { manifest } = await renderPublication(buildInput, {
    outputDirectory,
    workDirectory,
    sourceDirectory,
    themeDirectory: themeRoot,
    provenance: buildFixtureProvenance(),
  });
  const htmlRoutes = manifest.routes.filter(
    (route) => route.routeClass === 'html',
  );
  /** @type {Partial<Record<'home'|'article'|'author'|'listing', string>>} */
  const routePaths = {};
  for (const route of [...htmlRoutes].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    const html = await readFile(path.join(outputDirectory, route.path), 'utf8');
    const pageKind = /<body\s+data-gala-page-kind="([^"]+)"/u.exec(html)?.[1];
    if (pageKind === 'index' && !routePaths.home) routePaths.home = route.path;
    if (pageKind === 'article' && !routePaths.article) {
      routePaths.article = route.path;
    }
    if (pageKind === 'author' && !routePaths.author) {
      routePaths.author = route.path;
    }
    if (pageKind === 'tag' && !routePaths.listing) {
      routePaths.listing = route.path;
    }
  }
  for (const routeKind of ROUTE_KINDS) {
    if (!routePaths[routeKind]) {
      throw new Error(`no ${routeKind} route rendered for the visual fixture`);
    }
  }
  return {
    outputDirectory,
    routePaths:
      /** @type {Record<'home'|'article'|'author'|'listing', string>} */ (
        routePaths
      ),
  };
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
  const themeDocument = JSON.parse(
    await readFile(path.join(themeRoot, 'package.json'), 'utf8'),
  );
  const themeName = themeDocument.name;
  const themeContract = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const expectedThemeStylesheets = themeContract.stylesheets.filter(
    (stylesheet) => stylesheet !== 'print.css',
  );
  const canvasToken = themeContract.tokens.find(
    (token) => token.key === 'color-canvas',
  );
  if (!canvasToken) {
    throw new Error('theme contract has no color-canvas token');
  }
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
    const { outputDirectory, routePaths } = await renderFixture(
      themeRoot,
      templateDir,
      workRoot,
    );
    server = await startStaticFileServer(outputDirectory);

    const scenarios = buildVisualScenarios(routePaths);
    for (const { routeKind, routePath, palette, width } of scenarios) {
      const pageUrl = `${server.origin}/${routePath}`;
      const page = await browser.newPage({
        viewport: { width, height: VIEWPORT_HEIGHT },
        // Selects light vs dark the same way a real visitor's OS-level
        // preference would: the template's pre-paint bootstrap script
        // reads `prefers-color-scheme` on a fresh session (see
        // `visual-fixture.mjs`).
        colorScheme: palette,
        // Freeze the page at its stable, fully-visible state. The base
        // layer's scroll-driven reveal intentionally starts cards, code
        // blocks and quotes at 15% opacity; scanning a full-page screenshot
        // before those offscreen timelines advance measures that transient
        // frame instead of the rendered theme's final contrast.
        reducedMotion: 'reduce',
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
        /** @type {Map<string, number[]>} declared theme stylesheet -> statuses */
        const stylesheetStatuses = new Map();
        page.on('response', (response) => {
          if (response.request().resourceType() === 'stylesheet') {
            const pathname = new URL(response.url()).pathname;
            for (const stylesheet of expectedThemeStylesheets) {
              if (pathname.endsWith(`/assets/theme/${stylesheet}`)) {
                const statuses = stylesheetStatuses.get(stylesheet) ?? [];
                statuses.push(response.status());
                stylesheetStatuses.set(stylesheet, statuses);
              }
            }
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
        const selfReferencingHrefs =
          routeKind === 'article'
            ? await page.evaluate(() => {
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
              })
            : [];
        /* eslint-enable no-undef */
        if (selfReferencingHrefs.length > 0) {
          console.error(
            `${themeName} ${routeKind} ${palette} ${width}px: fixture page links to ` +
              `itself (${selfReferencingHrefs.join(', ')}) — this makes ` +
              'any :visited styling on that link unverifiable by this ' +
              'harness; fix visual-fixture.mjs to point every internal ' +
              'link elsewhere',
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
            canvasToken: computed.getPropertyValue('--gala-color-canvas'),
          };
        });
        /* eslint-enable no-undef */
        if (!rootStyle) {
          throw new Error(
            '[data-gala-publication-root] not found in the rendered page',
          );
        }
        const cssFailures = themeCssFailures({
          expectedStylesheets: expectedThemeStylesheets,
          stylesheetStatuses,
          expectedTokenValue: canvasToken[palette],
          computedTokenValue: rootStyle.canvasToken,
        });
        for (const cssFailure of cssFailures) {
          console.error(
            `${themeName} ${routeKind} ${palette} ${width}px: ${cssFailure}`,
          );
        }
        if (cssFailures.length > 0) failed = true;

        /* eslint-disable no-undef -- runs in the browser via
             page.evaluate, not in this Node process. */
        const compositionGeometry = await page.evaluate(() => {
          const body = document.body;
          const cover = document.querySelector('.g-article-cover-full-bleed');
          const rect = cover?.getBoundingClientRect();
          const aspectRatio = (selector) => {
            const element = document.querySelector(selector);
            return element ? getComputedStyle(element).aspectRatio : null;
          };
          return {
            articleLayout: body.dataset.galaArticleLayout,
            listingLayout: body.dataset.galaListingLayout,
            mediaRatio: body.dataset.galaMediaRatio,
            cover: rect
              ? {
                  left: rect.left,
                  right: rect.right,
                  viewportWidth: document.documentElement.clientWidth,
                }
              : null,
            coverRatio: aspectRatio('.g-article-cover-full-bleed img'),
            heroRatio: aspectRatio('.g-hero-media'),
            listingRatio: aspectRatio(
              '.g-grid > .g-card:nth-child(3n + 1) .g-card-media',
            ),
            datedRowDates: Array.from(
              document.querySelectorAll('.g-dated-row time'),
            ).map((element) => ({
              className: element.className,
              visible: getComputedStyle(element).display !== 'none',
            })),
          };
        });
        /* eslint-enable no-undef */
        if (
          routeKind === 'article' &&
          compositionGeometry.articleLayout === 'full-bleed'
        ) {
          const cover = compositionGeometry.cover;
          if (
            !cover ||
            cover.left > 1 ||
            cover.right < cover.viewportWidth - 1
          ) {
            console.error(
              `${themeName} article ${palette} ${width}px: full-bleed ` +
                `cover did not span the viewport (${JSON.stringify(cover)})`,
            );
            failed = true;
          }
          if (width > 640 && compositionGeometry.coverRatio !== '16 / 9') {
            console.error(
              `${themeName} article ${palette} ${width}px: full-bleed ` +
                `cover ratio is ${compositionGeometry.coverRatio}, expected 16 / 9`,
            );
            failed = true;
          }
        }
        if (compositionGeometry.mediaRatio === 'mixed') {
          const expectedRatio =
            routeKind === 'home'
              ? '3 / 2'
              : routeKind === 'listing'
                ? '4 / 5'
                : null;
          const actualRatio =
            routeKind === 'home'
              ? compositionGeometry.heroRatio
              : routeKind === 'listing'
                ? compositionGeometry.listingRatio
                : null;
          if (expectedRatio && actualRatio !== expectedRatio) {
            console.error(
              `${themeName} ${routeKind} ${palette} ${width}px: mixed ` +
                `media ratio is ${actualRatio}, expected ${expectedRatio}`,
            );
            failed = true;
          }
        }
        if (
          routeKind === 'listing' &&
          compositionGeometry.listingLayout === 'dated-rows'
        ) {
          const visibleDates = compositionGeometry.datedRowDates.filter(
            (date) => date.visible,
          );
          if (
            visibleDates.length !== 1 ||
            visibleDates[0].className !== 'g-date-stamp'
          ) {
            console.error(
              `${themeName} listing ${palette} ${width}px: dated rows ` +
                `must expose one visible date stamp (${JSON.stringify(compositionGeometry.datedRowDates)})`,
            );
            failed = true;
          }
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
            `${themeName} ${routeKind} ${palette} ${width}px: horizontal overflow ` +
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
            `${themeName} ${routeKind} ${palette} ${width}px: axe ${violation.impact} ` +
              `"${violation.id}" (${violation.help}) on ` +
              `${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
          );
        }
        if (failingViolations.length > 0) failed = true;

        const screenshotPath = path.join(
          outDirectory,
          `${themeName.replace('/', '_')}-${routeKind}-${palette}-${width}.png`,
        );
        const screenshotBuffer = await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        if (routeKind === 'article' && palette === 'light') {
          lightScreenshotsByWidth.set(width, screenshotBuffer);
        } else if (routeKind === 'article' && palette === 'dark') {
          const lightBuffer = lightScreenshotsByWidth.get(width);
          if (lightBuffer && lightBuffer.equals(screenshotBuffer)) {
            console.error(
              `${themeName} article ${width}px: light and dark screenshots are ` +
                'byte-identical — the dark palette did not render ' +
                'differently',
            );
            failed = true;
          }
        }
        console.log(
          `${themeName} ${routeKind} ${palette} ${width}px: ${failingViolations.length} ` +
            `failing axe violation(s), overflow=${overflow.scrollWidth > overflow.clientWidth} ` +
            `-> ${screenshotPath}`,
        );
      } finally {
        await page.close();
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
    '\nvisual:check passed: 12 bounded Home/Article/Author/Listing ' +
      'scenario(s), no serious/critical axe violations, no horizontal overflow.',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}

/**
 * Rich build-input fixture for `visual-check.mjs` (THD-M10): the same
 * `@rathnasgala2/schemas` canonical `build-input:2.0.0` example
 * `test/fixtures/rich-build-input.mjs` uses (deliberately not imported
 * from there — this is a runtime script theme CI invokes directly, not a
 * test-only helper, and `scripts/` does not depend on `test/`), with its
 * one article's body replaced by markdown that exercises most of the
 * template's public slot-hook surface (headings 1-6, a paragraph with
 * emphasis/strong/a link, ordered and unordered lists, a blockquote,
 * inline and fenced code, a divider).
 *
 * Rendered once (`appearance.colorMode` allows `light`, `dark` and `system`);
 * `visual-check.mjs` selects the palette per page load through Playwright's
 * `colorScheme` context option instead of a second render. The
 * server-rendered `<html>` always carries `data-gala-resolved-color-mode=
 * "light"` (TPL-C1's deterministic pre-paint default); the template's own
 * bootstrap script — a blocking, synchronous `<head>` script that runs
 * before first paint — reads `prefers-color-scheme` on a fresh session
 * (no stored selection) and corrects the attribute before anything is
 * painted, which is exactly what a real visitor's OS-level preference
 * would do. The fixture's `colorMode.default` is `system` so that the
 * bootstrap follows the OS preference (template 4.1.0 and later honour an
 * author's `light` or `dark` default over `prefers-color-scheme`).
 */

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { loadCanonicalBuildInput } from './canonical-build-input.mjs';
import { computeRenderPolicyIdentity } from './render-policy-identity.mjs';
import { resolveTemplateDir } from './resolve-template-dir.mjs';

const RICH_BODY = `# Visual check fixture

A paragraph with **strong text**, *emphasis*, and a
[link](https://example.com/) to follow.

## Lists

- an unordered item
- another unordered item

1. a first ordered item
2. a second ordered item

## Quoting and code

> A blockquote, for good measure.

Some \`inline code\`, and a fenced block:

\`\`\`javascript
const answer = 42;
\`\`\`

---

### Smaller headings

#### Heading four

##### Heading five

###### Heading six
`;

export const VISUAL_FIXTURE_HERO_PATH = 'assets/visual-check-cover.png';
export const VISUAL_FIXTURE_HERO_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const VISUAL_FIXTURE_HERO_DIGEST = `sha256:${createHash('sha256')
  .update(VISUAL_FIXTURE_HERO_BYTES)
  .digest('hex')}`;

/** @type {number} extra articles: enough for a home grid, related cards and a series. */
const FIXTURE_EXTRA_ARTICLE_COUNT = 6;
const FIXTURE_SERIES_NAME = 'Fixture series';

/**
 * Add articles to the canonical example so every card surface renders: the
 * home page needs a featured post plus a latest grid, an article needs
 * related cards, and three articles share a series so the series card and
 * series box appear. Cards that never render cannot be checked, which is how
 * a card defect once passed this harness (the single-article fixture had no
 * grid card at all). The extra titles are long enough to wrap on a phone.
 *
 * @param {{content: Record<string, any>[]}} buildInput mutated in place
 */
function addFixtureArticles(buildInput) {
  const base = buildInput.content.find(
    (record) => record.frontmatter.kind === 'article',
  );
  if (!base) throw new Error('canonical build input has no article');
  base.frontmatter.series = FIXTURE_SERIES_NAME;
  base.frontmatter.seriesOrder = 1;
  for (let n = 1; n <= FIXTURE_EXTRA_ARTICLE_COUNT; n += 1) {
    const record = structuredClone(base);
    const day = String(13 - n).padStart(2, '0');
    record.frontmatter.id = `019c0000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;
    record.frontmatter.slug = `fixture-article-${n}`;
    record.frontmatter.title =
      `Fixture article ${n}: a deliberately long title that wraps onto ` +
      'several lines on a narrow phone screen';
    record.frontmatter.publishedAt = `2026-09-${day}T12:00:00.000Z`;
    record.frontmatter.createdAt = record.frontmatter.publishedAt;
    record.frontmatter.redirects = [];
    if (n <= 2) {
      record.frontmatter.series = FIXTURE_SERIES_NAME;
      record.frontmatter.seriesOrder = n + 1;
    } else {
      delete record.frontmatter.series;
      delete record.frontmatter.seriesOrder;
    }
    record.sourcePath = `content/fixture-article-${n}.md`;
    record.sourceDigest = `sha256:${createHash('sha256')
      .update(record.sourcePath)
      .digest('hex')}`;
    buildInput.content.push(record);
  }
}

/**
 * @returns {Promise<Record<string, unknown>>} a fresh, render-ready
 *   `build-input:2.0.0` instance
 */
export async function buildVisualCheckFixture() {
  const templateRoot = resolveTemplateDir();
  // `record.body` is not raw author markdown: `renderPublication` asserts
  // it is idempotent under the render policy's sanitizer allowlist (it
  // must be exactly what `normalizeAuthoredMarkdown` itself would
  // produce), so the rich markdown above is run through that same
  // function rather than assigned as source text.
  const { normalizeAuthoredMarkdown } = await import(
    pathToFileURL(path.join(templateRoot, 'src', 'core', 'index.js')).href
  );
  const { html: normalizedBody, bodyDigest } =
    normalizeAuthoredMarkdown(RICH_BODY);

  const buildInput = await loadCanonicalBuildInput();

  const identity = await computeRenderPolicyIdentity(templateRoot);
  for (const record of buildInput.content) {
    record.frontmatter.redirects = [];
    record.frontmatter.title = 'Visual check fixture';
    record.renderPolicy = { ...identity };
    record.body = normalizedBody;
    record.bodyDigest = bodyDigest;
    if (record.frontmatter.kind === 'article') {
      record.frontmatter.hero = {
        file: {
          path: VISUAL_FIXTURE_HERO_PATH,
          sourceDigest: VISUAL_FIXTURE_HERO_DIGEST,
        },
        alt: 'A black visual-check fixture image',
        role: 'informative',
      };
    }
  }
  addFixtureArticles(buildInput);
  buildInput.appearance.fontAssets = [];
  buildInput.appearance.colorMode = {
    allowed: ['light', 'dark', 'system'],
    default: 'system',
  };

  return buildInput;
}

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
 * bootstrap follows the OS preference (template 4.1.0 honours an author's
 * `light` or `dark` default over `prefers-color-scheme`).
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
  buildInput.appearance.fontAssets = [];
  buildInput.appearance.colorMode = {
    allowed: ['light', 'dark', 'system'],
    default: 'system',
  };

  return buildInput;
}

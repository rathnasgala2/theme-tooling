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
 * Rendered once (`appearance.colorMode` allows both `light` and `dark`);
 * `visual-check.mjs` selects the palette per page load through Playwright's
 * `colorScheme` context option instead of a second render. The
 * server-rendered `<html>` always carries `data-gala-resolved-color-mode=
 * "light"` (TPL-C1's deterministic pre-paint default); the template's own
 * bootstrap script — a blocking, synchronous `<head>` script that runs
 * before first paint — reads `prefers-color-scheme` on a fresh session
 * (no stored selection) and corrects the attribute before anything is
 * painted, which is exactly what a real visitor's OS-level preference
 * would do. Forcing the resolved mode at build time cannot be done at all:
 * the renderer computes it unconditionally, independent of
 * `appearance.colorMode.default`.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { resolveTemplateDir } from './resolve-template-dir.mjs';

const RENDER_POLICY_DIGEST_DOMAIN = 'GALA-RENDER-POLICY-V2\0';
const RENDER_POLICY_NAME = 'gala-render-policy';
const RENDER_POLICY_VERSION = '2.0.0';

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

/**
 * @param {string} templateRoot the template checkout to read
 *   `contracts/render-policy.jcs` from
 * @returns {Promise<{name: string, version: string, digest: string}>} the
 *   current render-policy identity (reproduces the template's own
 *   unexported `computeRenderPolicyIdentity()`)
 */
async function computeRenderPolicyIdentity(templateRoot) {
  const contractBytes = await readFile(
    path.join(templateRoot, 'contracts', 'render-policy.jcs'),
  );
  const hash = createHash('sha256');
  hash.update(RENDER_POLICY_DIGEST_DOMAIN, 'utf8');
  hash.update(contractBytes);
  return {
    name: RENDER_POLICY_NAME,
    version: RENDER_POLICY_VERSION,
    digest: `sha256:${hash.digest('hex')}`,
  };
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

  const schemasPackageJsonUrl = import.meta
    .resolve('@rathnasgala2/schemas/package.json');
  const schemasRoot = path.dirname(fileURLToPath(schemasPackageJsonUrl));
  const buildInput = JSON.parse(
    await readFile(
      path.join(
        schemasRoot,
        'examples',
        'valid',
        'build-input',
        'canonical.json',
      ),
      'utf8',
    ),
  );

  const identity = await computeRenderPolicyIdentity(templateRoot);
  for (const record of buildInput.content) {
    record.frontmatter.redirects = [];
    record.frontmatter.title = 'Visual check fixture';
    record.renderPolicy = { ...identity };
    record.body = normalizedBody;
    record.bodyDigest = bodyDigest;
  }
  buildInput.appearance.fontAssets = [];
  buildInput.appearance.colorMode = {
    allowed: ['light', 'dark'],
    default: 'light',
  };

  return buildInput;
}

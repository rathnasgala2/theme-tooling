/**
 * This package's own conformance fixture (task packet S2-T13's "renders the
 * template's rich fixture with `options.themeDirectory` pointing at this
 * package" requirement). No S2-T10 golden/rich fixture repository exists
 * yet in the consumed `@rathnasgala2/template` snapshot (S2-T09/T10 are
 * template tasks, not yet done as of this package's authoring) to consume
 * directly, so this fixture is built from `@rathnasgala2/schemas`' own
 * published, structurally-valid `examples/valid/build-input/canonical.json`
 * — whose `appearance.theme` already names
 * `@rathnasgala2/theme-default@2.0.0` — with the two upstream placeholder
 * fields `@rathnasgala2/template`'s own test helpers document and clear
 * (`content[].frontmatter.redirects` self-collision,
 * `appearance.fontAssets` unresolvable placeholder digest) cleared the same
 * way, and a real `renderPolicy` identity / `bodyDigest` computed against
 * the consumed template's own published `contracts/render-policy.jcs`
 * (S2-T04) so `renderPublication` accepts it (DEC-097 §5).
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { loadCanonicalBuildInput } from '../../scripts/canonical-build-input.mjs';
import { computeRenderPolicyIdentity as computeRenderPolicyIdentityFor } from '../../scripts/render-policy-identity.mjs';
import { resolveTemplateDir } from '../../scripts/resolve-template-dir.mjs';

// `@rathnasgala2/template` is consumed *by path*, not as an npm
// dependency (independent-review finding on S2-T13: a `file:` dependency
// on a temporary git worktree is not durable evidence). Its public entry
// point (`src/core/index.js`, what the package's own `exports["."]`
// resolves to) is imported directly by file URL.
const { computeBodyDigest } = await import(
  pathToFileURL(path.join(resolveTemplateDir(), 'src', 'core', 'index.js')).href
);

/**
 * @returns {Promise<{name: string, version: string, digest: string}>} the
 *   current render-policy identity, for this fixture's template checkout
 */
async function computeRenderPolicyIdentity() {
  return computeRenderPolicyIdentityFor(resolveTemplateDir());
}

/**
 * @returns {Promise<Record<string, unknown>>} a fresh, render-ready
 *   `build-input:2.0.0` instance naming this package as its theme
 */
export async function buildFixture() {
  const buildInput = await loadCanonicalBuildInput();

  const identity = await computeRenderPolicyIdentity();
  for (const record of buildInput.content) {
    record.frontmatter.redirects = [];
    record.renderPolicy = { ...identity };
    record.bodyDigest = computeBodyDigest(record.body);
  }
  buildInput.appearance.fontAssets = [];

  return buildInput;
}

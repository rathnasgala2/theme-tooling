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

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { resolveTemplateDir } from '../../scripts/resolve-template-dir.mjs';

// `@rathnasgala2/template` is consumed *by path*, not as an npm
// dependency (independent-review finding on S2-T13: a `file:` dependency
// on a temporary git worktree is not durable evidence). Its public entry
// point (`src/core/index.js`, what the package's own `exports["."]`
// resolves to) is imported directly by file URL.
const { computeBodyDigest } = await import(
  pathToFileURL(path.join(resolveTemplateDir(), 'src', 'core', 'index.js')).href
);

const RENDER_POLICY_DIGEST_DOMAIN = 'GALA-RENDER-POLICY-V2\0';
const RENDER_POLICY_NAME = 'gala-render-policy';
const RENDER_POLICY_VERSION = '2.0.0';

/**
 * Reproduce `@rathnasgala2/template`'s own (unexported)
 * `computeRenderPolicyIdentity()`: `sha256("GALA-RENDER-POLICY-V2\0" +
 * <the published contracts/render-policy.jcs bytes>)`. Not part of the
 * template's public `exports` map, so its documented algorithm is
 * reproduced here directly against the same published contract file,
 * rather than importing a template-internal module.
 *
 * @returns {Promise<{name: string, version: string, digest: string}>} the
 *   current render-policy identity
 */
async function computeRenderPolicyIdentity() {
  const templateRoot = resolveTemplateDir();
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
 *   `build-input:2.0.0` instance naming this package as its theme
 */
export async function buildFixture() {
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

  const identity = await computeRenderPolicyIdentity();
  for (const record of buildInput.content) {
    record.frontmatter.redirects = [];
    record.renderPolicy = { ...identity };
    record.bodyDigest = computeBodyDigest(record.body);
  }
  buildInput.appearance.fontAssets = [];

  return buildInput;
}

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RENDER_POLICY_DIGEST_DOMAIN = 'GALA-RENDER-POLICY-V2\0';
const RENDER_POLICY_NAME = 'gala-render-policy';
const RENDER_POLICY_VERSION = '2.0.0';

/**
 * Reproduce `@rathnasgala2/template`'s own (unexported)
 * `computeRenderPolicyIdentity()`: `sha256("GALA-RENDER-POLICY-V2\0" + <the
 * published contracts/render-policy.jcs bytes>)`. Not part of the
 * template's public `exports` map, so its documented algorithm is
 * reproduced here directly against the same published contract file,
 * rather than importing a template-internal module. Shared by every
 * fixture builder (`visual-fixture.mjs`, `test/fixtures/rich-build-
 * input.mjs`) that needs a real `renderPolicy` identity the template's
 * `renderPublication` will accept.
 *
 * @param {string} templateRoot the `@rathnasgala2/template` checkout to
 *   read `contracts/render-policy.jcs` from
 * @returns {Promise<{name: string, version: string, digest: string}>} the
 *   current render-policy identity
 */
export async function computeRenderPolicyIdentity(templateRoot) {
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

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveTemplateDir } from '../../scripts/resolve-template-dir.mjs';

/**
 * The generation-4 theme contract versions the conformance and visual tests
 * run for. A theme declaring one of them is never skipped (Template 4.4.0
 * itself refuses 4.0.0, which then fails the render instead of passing
 * silently).
 */
export const CONTRACT_4_VERSIONS = ['4.0.0', '4.1.0'];

/**
 * The styling contract the installed Template publishes. Its `catalogDigest`
 * is the value every contract-4.1.0 `theme.json.stylingContractDigest` must
 * equal, so tests derive it from the package rather than typing it.
 *
 * @returns {Promise<{contractVersion: string, templateVersion: string, catalogDigest: string}>}
 *   the contract's version, the Template version that built it and its digest
 */
export async function readTemplateStylingContract() {
  const contract = JSON.parse(
    await readFile(
      path.join(
        resolveTemplateDir(),
        'contracts',
        'theme-styling-contract.jcs',
      ),
      'utf8',
    ),
  );
  return {
    contractVersion: contract.contractVersion,
    templateVersion: contract.templateVersion,
    catalogDigest: contract.catalogDigest,
  };
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the exact Schema package used for contract-4 validation.
 * `GALA_SCHEMA_DIR` remains an explicit development override. Otherwise the
 * package comes from the integrity-checked archive installed from `vendor/`;
 * no sibling checkout or registry resolution participates in the result.
 *
 * @returns {string} absolute schema checkout path
 */
export function resolveSchemaDir() {
  const schemaDirOverride = process.env.GALA_SCHEMA_DIR;
  if (schemaDirOverride && schemaDirOverride.length > 0) {
    return path.resolve(schemaDirOverride);
  }
  return path.dirname(
    fileURLToPath(import.meta.resolve('@rathnasgala2/schemas/package.json')),
  );
}

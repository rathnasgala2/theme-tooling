import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the exact installed `@rathnasgala2/template` package this
 * repository vendors for source-only CI. Consumers may still provide an
 * explicit checkout while developing Template itself, but no implicit
 * sibling path or mutable workspace fallback is accepted.
 *
 * `GALA_TEMPLATE_DIR` is an absolute or cwd-relative path directly to a
 * Template checkout. With no override, Node resolves the package installed
 * from the integrity-checked archive declared in `vendor/manifest.json`.
 *
 * @returns {string} the absolute, resolved template checkout directory
 */
export function resolveTemplateDir() {
  const templateDirOverride = process.env.GALA_TEMPLATE_DIR;
  if (templateDirOverride && templateDirOverride.length > 0) {
    return path.resolve(templateDirOverride);
  }
  return path.dirname(
    fileURLToPath(import.meta.resolve('@rathnasgala2/template/package.json')),
  );
}

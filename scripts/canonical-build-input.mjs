import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Load `@rathnasgala2/schemas`' own published, structurally-valid
 * `examples/valid/build-input/canonical.json` — whose `appearance.theme`
 * already names `@rathnasgala2/theme-default@2.0.0` — as a fresh, mutable
 * object. Shared by every fixture builder that starts from this canonical
 * instance and then clears/overrides a handful of upstream placeholder
 * fields before handing it to `renderPublication`.
 *
 * @returns {Promise<Record<string, unknown>>} a fresh parse of the
 *   canonical `build-input:2.0.0` example (safe to mutate; each call
 *   re-reads and re-parses, so callers never share state)
 */
export async function loadCanonicalBuildInput() {
  const schemasPackageJsonUrl = import.meta
    .resolve('@rathnasgala2/schemas/package.json');
  const schemasRoot = path.dirname(fileURLToPath(schemasPackageJsonUrl));
  return JSON.parse(
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
}

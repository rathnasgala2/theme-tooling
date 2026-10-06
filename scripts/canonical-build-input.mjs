import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveThemeRoot } from './resolve-theme-root.mjs';

/**
 * Load `@rathnasgala2/schemas`' own published, structurally-valid
 * `examples/valid/build-input/canonical.json` as a fresh, mutable object.
 * Shared by every fixture builder that starts from this canonical instance
 * and then clears/overrides a handful of upstream placeholder fields before
 * handing it to `renderPublication`. Contract 3: the instance is re-pointed
 * at the theme under test (`THEME_ROOT`'s own `package.json` name and
 * version, so the build input names the contract-3 theme it renders with).
 *
 * @returns {Promise<Record<string, unknown>>} a fresh parse of the
 *   canonical `build-input:2.0.0` example (safe to mutate; each call
 *   re-reads and re-parses, so callers never share state)
 */
export async function loadCanonicalBuildInput() {
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
  const themePackage = JSON.parse(
    await readFile(path.join(resolveThemeRoot(), 'package.json'), 'utf8'),
  );
  buildInput.packages.theme.package = themePackage.name;
  buildInput.packages.theme.version = themePackage.version;
  buildInput.appearance.theme = `${themePackage.name}@${themePackage.version}`;
  return buildInput;
}

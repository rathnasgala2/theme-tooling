import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveThemeRoot } from './resolve-theme-root.mjs';

/**
 * Derive the theme's closed packed file set and stylesheet list from its
 * own `package.json`, once, instead of five independent hardcoded copies
 * (THD-M6): npm always includes `package.json`, `README.md` and `LICENSE`
 * in a tarball regardless of the `files` array, so the packed set is
 * exactly those three plus `package.json.files`.
 *
 * @param {string} [themeRoot] repository root; defaults to
 *   {@link resolveThemeRoot}
 * @returns {Promise<{packageJson: Record<string, unknown>, packedFiles: string[], stylesheets: string[]}>}
 *   the theme's own `package.json`, its full packed file list (sorted),
 *   and the `.css` subset of `package.json.files`
 */
export async function loadPackedFileSet(themeRoot = resolveThemeRoot()) {
  const packageJson = JSON.parse(
    await readFile(path.join(themeRoot, 'package.json'), 'utf8'),
  );
  const declaredFiles = Array.isArray(packageJson.files)
    ? packageJson.files
    : [];
  const packedFiles = [
    'package.json',
    'README.md',
    'LICENSE',
    ...declaredFiles,
  ].sort();
  const stylesheets = declaredFiles.filter((file) => file.endsWith('.css'));
  return { packageJson, packedFiles, stylesheets };
}

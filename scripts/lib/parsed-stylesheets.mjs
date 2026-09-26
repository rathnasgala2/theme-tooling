import { readFile } from 'node:fs/promises';
import path from 'node:path';

import postcss from 'postcss';

import { loadPackedFileSet } from '../packed-files.mjs';
import { resolveThemeRoot } from '../resolve-theme-root.mjs';

/**
 * Load and postcss-parse every packed stylesheet for the theme under test.
 *
 * @returns {Promise<{stylesheet: string, root: import('postcss').Root}[]>}
 *   one parsed root per packed stylesheet, in packed order
 */
export async function loadParsedStylesheets() {
  const { stylesheets } = await loadPackedFileSet();
  const themeRoot = resolveThemeRoot();
  const parsed = [];
  for (const stylesheet of stylesheets) {
    const css = await readFile(path.join(themeRoot, stylesheet), 'utf8');
    parsed.push({
      stylesheet,
      root: postcss.parse(css, { from: stylesheet }),
    });
  }
  return parsed;
}

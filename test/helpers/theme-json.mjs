import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} themeRoot a theme root directory (real or scratch)
 * @returns {Promise<Record<string, unknown>>} its parsed `theme.json`
 */
export async function readThemeJson(themeRoot) {
  return JSON.parse(await readFile(path.join(themeRoot, 'theme.json'), 'utf8'));
}

/**
 * @param {string} themeRoot a theme root directory (real or scratch)
 * @param {Record<string, unknown>} theme the value to serialize
 * @returns {Promise<void>} resolves once `theme.json` is written
 */
export async function writeThemeJson(themeRoot, theme) {
  await writeFile(
    path.join(themeRoot, 'theme.json'),
    JSON.stringify(theme, null, 2),
    'utf8',
  );
}

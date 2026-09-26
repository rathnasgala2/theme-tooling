import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadPackedFileSet } from '../../scripts/packed-files.mjs';
import { resolveThemeRoot } from '../../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../../scripts/scratch-theme.mjs';

/**
 * Build a scratch copy of the theme under test, append `additionalCss` to
 * its first packed stylesheet, run `fn(scratchRoot)` against it, and clean
 * up the scratch copy afterward regardless of outcome.
 *
 * This is the shared shape behind every `check-css-grammar.mjs` grammar
 * test: append one hand-crafted rule that should (or should not) pass the
 * closed property/at-rule catalog, then run the check against the
 * mutated copy.
 *
 * @param {string} additionalCss raw CSS appended (on its own line) to the
 *   end of the first packed stylesheet
 * @param {(scratchRoot: string) => Promise<T>} fn run against the mutated
 *   scratch theme; typically `runCheckScript('check-css-grammar.mjs', {
 *   env: { THEME_ROOT: scratchRoot } })`
 * @returns {Promise<T>} `fn`'s resolved value
 * @template T
 */
export async function withAppendedStylesheetCss(additionalCss, fn) {
  const themeRoot = resolveThemeRoot();
  const { stylesheets } = await loadPackedFileSet(themeRoot);
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
    const [firstStylesheet] = stylesheets;
    const cssPath = path.join(scratchRoot, firstStylesheet);
    const css = await readFile(cssPath, 'utf8');
    await writeFile(cssPath, `${css}\n${additionalCss}`, 'utf8');
    return await fn(scratchRoot);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

import { rm } from 'node:fs/promises';

import { resolveThemeRoot } from '../../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../../scripts/scratch-theme.mjs';

/**
 * Build a scratch copy of the theme under test, run `fn(scratchRoot)`
 * against it, and remove the copy afterward regardless of outcome.
 * Centralizes the `buildScratchThemeCopy`/try/finally/`rm` scaffolding
 * repeated across this package's tests.
 *
 * @param {(scratchRoot: string) => Promise<T>} fn run against the scratch
 *   theme copy
 * @returns {Promise<T>} `fn`'s resolved value
 * @template T
 */
export async function withScratchTheme(fn) {
  const scratchRoot = await buildScratchThemeCopy(resolveThemeRoot());
  try {
    return await fn(scratchRoot);
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

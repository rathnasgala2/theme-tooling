/**
 * CI guard: refuse any `file:`/`local-packages` reference to
 * `@rathnasgala2/schemas` reappearing in this package's dependency
 * manifest or lockfile. The LOCAL-1 local-tarball convention
 * (`file:../../../local-packages/rathnasgala2-schemas-<version>.tgz`) is
 * retired now that `@rathnasgala2/schemas` is published to the public npm
 * registry (contract re-pin packet, 2026-09-19, section 8); this script is
 * the guard against it silently coming back.
 */

import { readFile } from 'node:fs/promises';

/** @type {readonly {pattern: RegExp, label: string}[]} */
const FORBIDDEN_PATTERNS = [
  { pattern: /file:.*local-packages/, label: 'file: local-packages specifier' },
  {
    pattern: /local-packages\/rathnasgala2-schemas-/,
    label: 'local-packages tarball reference',
  },
];

const FILES_TO_CHECK = ['package.json', 'package-lock.json'];

/**
 * @param {string} relativePath file to check, relative to this package's
 *   own directory (the npm-scripts cwd)
 * @returns {Promise<boolean>} true when the file is clean (or absent)
 */
async function checkFile(relativePath) {
  let text;
  try {
    text = await readFile(relativePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
  let ok = true;
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      console.error(
        `${relativePath}: found a local-tarball schema reference (${label}). ` +
          '@rathnasgala2/schemas must be pinned to a registry version now that ' +
          'it is published; the file:../local-packages/... convention ' +
          '(LOCAL-1) is retired after the repin.',
      );
      ok = false;
    }
  }
  return ok;
}

async function main() {
  const results = await Promise.all(FILES_TO_CHECK.map(checkFile));
  if (results.some((ok) => !ok)) {
    process.exitCode = 1;
    return;
  }
  console.log('no local-tarball @rathnasgala2/schemas reference found.');
}

await main();

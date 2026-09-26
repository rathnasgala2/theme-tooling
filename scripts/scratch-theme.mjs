import { chmod, cp, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadPackedFileSet } from './packed-files.mjs';

/**
 * Copy a theme's packed file set into a fresh scratch directory, mode
 * 0644 (the packed-file-set/absence runners assert every packed member is
 * mode 0644, which `cp` does not guarantee survives a copy), plus an empty
 * `tooling/` directory (the local runners' cwd convention: `runLocalCheck`
 * uses `<themeRoot>/tooling`, matching every real theme's layout — it only
 * needs to exist, not to hold any files). Shared by `digest:check`'s
 * scratch regeneration and by every test fixture that needs an isolated,
 * mutable copy of a theme's packed bytes.
 *
 * @param {string} themeRoot the real repository root to copy from
 * @returns {Promise<string>} the scratch directory's path (caller removes it)
 */
export async function buildScratchThemeCopy(themeRoot) {
  const { packedFiles } = await loadPackedFileSet(themeRoot);
  const scratchRoot = await mkdtemp(path.join(tmpdir(), 'theme-scratch-'));
  for (const relativePath of packedFiles) {
    const destination = path.join(scratchRoot, relativePath);
    await cp(path.join(themeRoot, relativePath), destination);
    await chmod(destination, 0o644);
  }
  await mkdir(path.join(scratchRoot, 'tooling'), { recursive: true });
  return scratchRoot;
}

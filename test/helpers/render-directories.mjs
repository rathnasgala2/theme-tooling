import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Build a fresh, empty `output`/`work`/`source` directory triple under a
 * new scratch root, ready to pass as `renderPublication`'s
 * `outputDirectory`/`workDirectory`/`sourceDirectory` options.
 *
 * @param {string} prefix passed through to `mkdtemp`
 * @returns {Promise<{outputDirectory: string, workDirectory: string, sourceDirectory: string, cleanup: () => Promise<void>}>}
 *   the directory triple, plus a `cleanup()` that removes the scratch root
 */
export async function createRenderDirectories(prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const outputDirectory = path.join(root, 'output');
  const workDirectory = path.join(root, 'work');
  const sourceDirectory = path.join(root, 'source');
  await mkdir(sourceDirectory, { recursive: true });
  return {
    outputDirectory,
    workDirectory,
    sourceDirectory,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

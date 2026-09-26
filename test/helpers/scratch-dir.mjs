import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Create a fresh `mkdtemp` scratch directory, run `fn(dir)` against it, and
 * remove it afterward regardless of outcome. Centralizes the
 * mkdtemp/try/finally/rm scaffolding repeated across this package's tests.
 *
 * @param {string} prefix passed through to `mkdtemp` (e.g. `'theme-
 *   budgets-'`)
 * @param {(dir: string) => Promise<T>} fn run against the scratch
 *   directory
 * @returns {Promise<T>} `fn`'s resolved value
 * @template T
 */
export async function withScratchDir(prefix, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

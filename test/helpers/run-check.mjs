import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Run one `scripts/check-*.mjs` conformance script against whichever
 * theme is being tested and return whether it passed, along with its
 * combined output (for assertion messages on failure).
 *
 * The theme under test is identified by `process.cwd()`, not by this test
 * file's own location: this package is shared across five theme
 * repositories, invoked with the calling theme's `tooling/` directory as
 * cwd (see `theme-tooling/bin/cli.mjs`), so `resolveThemeRoot()`'s
 * cwd-relative default resolves correctly without every call site having
 * to pass `THEME_ROOT` explicitly.
 *
 * @param {string} script script basename under `scripts/`
 * @param {{env?: Record<string, string>}} [options] `env` merges
 *   additional environment variables (e.g. `THEME_ROOT`, DEC-015 name) into
 *   the child process's inherited `process.env`
 * @returns {Promise<{passed: boolean, output: string}>} the outcome
 */
export async function runCheckScript(script, options = {}) {
  // import.meta.dirname is theme-tooling/test/helpers/; two levels up is
  // theme-tooling/, the sibling of theme-tooling/scripts/.
  const toolingPackageDir = path.join(import.meta.dirname, '..', '..');
  const scriptPath = path.join(toolingPackageDir, 'scripts', script);
  try {
    const { stdout, stderr } = await run(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });
    return { passed: true, output: `${stdout}${stderr}` };
  } catch (error) {
    return {
      passed: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

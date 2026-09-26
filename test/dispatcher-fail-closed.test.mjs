/**
 * Each theme repository's own `tooling/run.mjs` (identical across all
 * five, THD-M6) is the one file that is *not* shared: it resolves
 * `GALA_THEME_TOOLING_DIR` and dispatches into this package's `bin/cli.mjs`,
 * or fails closed with the exact fix when the variable is unset. This test
 * spawns each sibling theme's real `run.mjs` with that one variable
 * stripped from its environment and asserts it exits non-zero with a
 * message naming the fix, rather than falling back to a relative default
 * or `node_modules` (there is nothing reliable to fall back to before this
 * package is published). It never prints the child's environment or argv,
 * only asserts on its own captured stdout/stderr.
 */

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const THEME_NAMES = [
  'theme-default',
  'theme-minimal',
  'theme-amaze',
  'theme-flashy',
  'theme-zebra',
];

/**
 * @param {string} themeName
 * @returns {string} the resolved dispatcher path (existence is not guaranteed)
 */
function dispatcherPath(themeName) {
  const workspaceRoot =
    process.env.WORKSPACE_ROOT ?? path.resolve(import.meta.dirname, '..', '..');
  return path.join(workspaceRoot, themeName, 'tooling', 'run.mjs');
}

/**
 * @param {string} scriptPath
 * @param {Record<string, string>} env the exact child environment (never
 *   logged)
 * @returns {Promise<{status: number | null, stdout: string, stderr: string}>}
 */
function run(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, 'verify'], {
      cwd: path.dirname(scriptPath),
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

for (const themeName of THEME_NAMES) {
  test(`${themeName}/tooling/run.mjs fails closed with a fix-it message when GALA_THEME_TOOLING_DIR is unset`, async (t) => {
    const scriptPath = dispatcherPath(themeName);
    try {
      await access(scriptPath);
    } catch {
      t.skip(`${scriptPath} not present on disk`);
      return;
    }
    const strippedEnv = { ...process.env };
    delete strippedEnv.GALA_THEME_TOOLING_DIR;

    const { status, stderr } = await run(scriptPath, strippedEnv);
    assert.notEqual(
      status,
      0,
      'run.mjs must exit non-zero when GALA_THEME_TOOLING_DIR is unset',
    );
    assert.match(
      stderr,
      /GALA_THEME_TOOLING_DIR is not set/,
      'the failure must name the exact variable to set, not fail silently or fall back',
    );
  });

  test(`${themeName}/tooling/run.mjs fails closed when GALA_THEME_TOOLING_DIR points at a nonexistent directory`, async (t) => {
    const scriptPath = dispatcherPath(themeName);
    try {
      await access(scriptPath);
    } catch {
      t.skip(`${scriptPath} not present on disk`);
      return;
    }
    const brokenEnv = {
      ...process.env,
      GALA_THEME_TOOLING_DIR: path.join(
        path.dirname(scriptPath),
        'does-not-exist-anywhere',
      ),
    };

    const { status } = await run(scriptPath, brokenEnv);
    assert.notEqual(
      status,
      0,
      'run.mjs must exit non-zero when GALA_THEME_TOOLING_DIR does not resolve to a real checkout',
    );
  });
}

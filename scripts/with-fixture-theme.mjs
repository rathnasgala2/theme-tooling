/**
 * Run a command with `THEME_ROOT` defaulted to this repository's own
 * contract-3 theme fixture (`test/fixtures/theme-default-contract-3`) and
 * `GALA_TEMPLATE_DIR` defaulted to the sibling `template` checkout, so the
 * suite verifies itself without a theme repository checkout. Either variable
 * already set (CI, or a developer pointing at a real theme) wins.
 *
 * Usage: `node scripts/with-fixture-theme.mjs <command> [args...]`.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const packageDir = path.resolve(import.meta.dirname, '..');
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: with-fixture-theme.mjs <command> [args...]');
  process.exit(1);
}
const env = { ...process.env };
if (!env.THEME_ROOT) {
  env.THEME_ROOT = path.join(
    packageDir,
    'test',
    'fixtures',
    'theme-default-contract-3',
  );
}
if (!env.GALA_TEMPLATE_DIR && !env.WORKSPACE_ROOT) {
  env.GALA_TEMPLATE_DIR = path.resolve(packageDir, '..', 'template');
}
const result = spawnSync(command, args, { stdio: 'inherit', env });
process.exit(result.status ?? 1);

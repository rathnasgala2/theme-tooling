/**
 * Run a command with `THEME_ROOT` defaulted to this repository's own
 * contract-3 theme fixture (`test/fixtures/theme-default-contract-3`) and
 * suite verifies its archived contract-3 behavior independently from the
 * generation-4 theme-checkout matrix. Schema and Template resolve
 * from this package's exact registry dependencies unless a caller
 * supplies an explicit development override.
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
const result = spawnSync(command, args, { stdio: 'inherit', env });
process.exit(result.status ?? 1);

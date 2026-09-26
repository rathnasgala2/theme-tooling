#!/usr/bin/env node
/**
 * The single entry point every theme repository's `tooling/run.mjs` shells
 * out to (THD-M6): one shared implementation of every conformance/release
 * gate, instead of five hand-copied `tooling/scripts` and `tooling/test`
 * directories with the packed file list hardcoded three times each.
 *
 * Always invoked with the calling theme's own `tooling/` directory as
 * `process.cwd()` — every check script's `resolveThemeRoot()` default
 * (`path.resolve('..')`) and every relative path in this file's own
 * commands rely on that convention.
 *
 * Usage: `node <this file's path> <command>`, where `<command>` is one of
 * the keys of `COMMANDS` below, or `verify` to run the full release gate
 * in the order `theme-default`'s README documents.
 */

import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_DIR = path.join(import.meta.dirname, '..');
const SCRIPTS_DIR = path.join(PACKAGE_DIR, 'scripts');
const TEST_DIR = path.join(PACKAGE_DIR, 'test');
const BIN_DIR = path.join(PACKAGE_DIR, 'node_modules', '.bin');

/**
 * Run a child process with this theme's cwd (already `process.cwd()`) and
 * inherited stdio, and return its exit code.
 *
 * @param {string} command the executable
 * @param {string[]} args its arguments
 * @returns {number} the exit code (1 if the process could not be spawned)
 */
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  if (result.error) {
    console.error(`${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * @param {string} script script basename under `scripts/`
 * @param {string[]} [extraArgs] extra argv to forward
 * @returns {number} the exit code
 */
function runScript(script, extraArgs = []) {
  return run(process.execPath, [path.join(SCRIPTS_DIR, script), ...extraArgs]);
}

/** @type {readonly string[]} format/lint targets: this theme's own root
 * content plus its thin `tooling/run.mjs` wrapper — everything else that
 * used to be linted here (25 files' worth) now lives once in this
 * package, and is linted/formatted as part of *this* package's own CI.
 * The theme's SBOM is not in this list at all any more (THD-M6): it is no
 * longer a committed file (see `sbom:generate`'s doc comment), so there is
 * nothing here for `format:check` to skip. */
const FORMAT_TARGETS = ['../*.md', '../*.json', '../*.css', 'run.mjs'];

const COMMANDS = {
  format: () =>
    run(path.join(BIN_DIR, 'prettier'), [
      '--write',
      '--config',
      path.join(PACKAGE_DIR, '.prettierrc.json'),
      ...FORMAT_TARGETS,
    ]),
  'format:check': () =>
    run(path.join(BIN_DIR, 'prettier'), [
      '--check',
      '--config',
      path.join(PACKAGE_DIR, '.prettierrc.json'),
      ...FORMAT_TARGETS,
    ]),
  lint: () =>
    run(path.join(BIN_DIR, 'eslint'), [
      '--config',
      path.join(PACKAGE_DIR, 'eslint.config.js'),
      'run.mjs',
    ]),
  'schema:check': () => runScript('check-theme-schema.mjs'),
  'css:check': () => runScript('check-css-hooks.mjs'),
  'grammar:check': () => runScript('check-css-grammar.mjs'),
  'contrast:check': () => runScript('check-contrast.mjs'),
  'budgets:check': () => runScript('check-budgets.mjs'),
  'package:check': () => runScript('check-package-file-set.mjs'),
  'absence:check': () => runScript('check-forbidden-constructs.mjs'),
  'schema-pin:check': () => runScript('check-no-local-schema-pin.mjs'),
  // THD-H2/H4: no un-flagged `digest:generate` step exists in `verify`
  // anymore. `digest:generate` (writes the real theme.json) remains
  // available for local dev only, run by hand after editing a stylesheet.
  'digest:generate': () => runScript('generate-theme-digests.mjs'),
  'digest:check': () => runScript('generate-theme-digests.mjs', ['--check']),
  test: () =>
    run(process.execPath, [
      '--test',
      ...globSync('*.test.mjs', { cwd: TEST_DIR }).map((file) =>
        path.join(TEST_DIR, file),
      ),
    ]),
  duplication: () =>
    // `tokens.css` is deliberately excluded: its light/dark palette blocks
    // repeat the same ~35 custom-property names by design (only the
    // values differ), which is not the kind of duplication this gate
    // exists to catch.
    run(path.join(BIN_DIR, 'jscpd'), [
      '../components.css',
      '../print.css',
      'run.mjs',
      '--threshold',
      '3',
      '--min-tokens',
      '50',
      '--reporters',
      'console',
    ]),
  // THD-M6 (post-mortem): no longer shells out to `cyclonedx-npm` against
  // this package's own lockfile and attributes the result to the calling
  // theme (that tied every theme's SBOM to this package's devDependency
  // tree, and repeatedly diverged between a local machine and CI). Builds
  // a self-contained SBOM of the calling theme alone; never committed —
  // written to a build directory and attached to the release as an
  // artifact. Forwards `--out <path>` if given (see
  // `generate-theme-sbom.mjs`).
  'sbom:generate': () =>
    runScript('generate-theme-sbom.mjs', process.argv.slice(3)),
  'sbom:check': () => runScript('check-sbom-current.mjs'),
  // The theme's own `tooling/package.json` has no dependencies to audit;
  // the real dependency tree is this shared package's own.
  audit: () =>
    spawnSync('npm', ['audit', '--audit-level=high'], {
      stdio: 'inherit',
      cwd: PACKAGE_DIR,
      env: process.env,
    }).status ?? 1,
  'workflows:check': () => runScript('check-workflow-pins.mjs'),
  'workflows:drift': () => runScript('check-workflow-drift.mjs'),
  // THD-M10: deliberately not in VERIFY_SEQUENCE — this is the one gate
  // that requires a browser binary on disk (`npx playwright install
  // chromium`), so theme CI runs it as its own job instead of imposing
  // that install step on every local `npm run verify`. Forwards every
  // argument after `visual:check` (e.g. `--out <dir>`) verbatim.
  'visual:check': () => runScript('visual-check.mjs', process.argv.slice(3)),
};

/** @type {readonly string[]} the full release gate, in the order the
 * README documents (THD-M11). `digest:generate` is deliberately absent
 * (THD-H2/H4). */
const VERIFY_SEQUENCE = [
  'format:check',
  'lint',
  'schema:check',
  'css:check',
  'grammar:check',
  'contrast:check',
  'budgets:check',
  'package:check',
  'absence:check',
  'schema-pin:check',
  'digest:check',
  'test',
  'duplication',
  'sbom:check',
  'audit',
  'workflows:check',
];

function verify() {
  for (const command of VERIFY_SEQUENCE) {
    console.log(`\n> ${command}`);
    const status = COMMANDS[command]();
    if (status !== 0) {
      console.error(`\nverify failed at: ${command}`);
      return status;
    }
  }
  return 0;
}

function main() {
  const [command] = process.argv.slice(2);
  if (command === 'verify') {
    process.exit(verify());
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(
      `unknown theme-tooling command: ${command}\navailable: verify, ${Object.keys(COMMANDS).join(', ')}`,
    );
    process.exit(1);
  }
  process.exit(handler());
}

main();

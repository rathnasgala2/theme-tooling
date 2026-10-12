/**
 * Palette conformance runner (`palette:check`): a theme's `palette` block
 * binds palette-drivable tokens to the author's three colours (see
 * `@rathnasgala2/schemas/palette`). The template refuses a theme whose block
 * is missing or invalid and refuses a build whose final colours miss a
 * contrast pair, so a theme must not ship unless all of this holds:
 *
 * 1. the block is valid (the schema module's own `validateThemePalette`)
 *    and binds the three seed tokens;
 * 2. the theme's default palette passes every pair in both modes;
 * 3. `components.css` and `print.css` never set a bound token's property
 *    (a value on a hook element would override the root value);
 * 4. `tokens.css` declares no bound token in any block;
 * 5. every palette in the schema package's stress corpus and every golden
 *    vector input derives through the theme's bindings without throwing,
 *    and every rejected pick is refused by `checkPickedColours`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PALETTE_SEED_KEYS,
  checkPalette,
  checkPickedColours,
  derivePalette,
  validateThemePalette,
} from '@rathnasgala2/schemas/palette';
import postcss from 'postcss';

import { boundKeysOf } from './lib/palette-binding.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { runIfMain } from './run-if-main.mjs';

const MODES = ['light', 'dark'];
const STYLESHEETS_WITHOUT_BOUND_TOKENS = ['components.css', 'print.css'];

/**
 * @param {string} specifier package subpath of a JSON file
 * @returns {Promise<any>} the parsed file
 */
async function readSchemaJson(specifier) {
  return JSON.parse(
    await readFile(fileURLToPath(import.meta.resolve(specifier)), 'utf8'),
  );
}

/**
 * @param {string} file stylesheet path
 * @param {Set<string>} bound bound token keys
 * @returns {Promise<string[]>} bound keys whose property the file sets
 */
async function declaredBoundKeys(file, bound) {
  const root = postcss.parse(await readFile(file, 'utf8'), {
    from: path.basename(file),
  });
  /** @type {string[]} */
  const found = [];
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith('--gala-')) return;
    const key = declaration.prop.slice('--gala-'.length);
    if (bound.has(key)) found.push(key);
  });
  return [...new Set(found)];
}

/**
 * @param {string[]} problems collected problems
 * @param {any} theme parsed theme.json
 * @param {Set<string>} bound bound token keys
 */
function checkBindings(problems, theme, bound) {
  try {
    validateThemePalette(theme);
  } catch (error) {
    problems.push(
      `palette: ${error.code ?? 'error'}: ${error.detail ?? error.message}`,
    );
    return false;
  }
  for (const seed of Object.values(PALETTE_SEED_KEYS)) {
    if (!bound.has(seed)) {
      problems.push(
        `palette: seed token ${seed} is not bound by palette.follow`,
      );
    }
  }
  return true;
}

/**
 * @param {string[]} problems collected problems
 * @param {any} theme parsed theme.json
 */
function checkDefaultPalette(problems, theme) {
  const derived = derivePalette(theme, {});
  for (const mode of MODES) {
    for (const failure of checkPalette(derived, mode).failures) {
      problems.push(
        `default palette fails ${failure.pair} in ${mode}: ${failure.ratio ?? 'n/a'} of ${failure.minimum}${failure.reason ? ` (${failure.reason})` : ''}`,
      );
    }
  }
}

/**
 * @param {string[]} problems collected problems
 * @param {any} theme parsed theme.json
 */
async function checkSmoke(problems, theme) {
  const corpus = await readSchemaJson(
    '@rathnasgala2/schemas/palette/stress-corpus.json',
  );
  const golden = await readSchemaJson(
    '@rathnasgala2/schemas/palette/golden-vectors.json',
  );
  const inputs = [
    ...corpus.palettes.map((entry) => ['stress corpus', entry]),
    ...golden.cases.map((entry) => ['golden vectors', entry]),
  ];
  for (const [source, entry] of inputs) {
    try {
      derivePalette(theme, entry.tokens);
    } catch (error) {
      problems.push(
        `${source} "${entry.id}" does not derive through the bindings: ${error.detail ?? error.message}`,
      );
    }
  }
  for (const entry of corpus.rejectedPicks) {
    const { ok, failures } = checkPickedColours(entry.tokens);
    const reported = new Set(
      failures.map((failure) => `${failure.code}:${failure.mode}`),
    );
    const missing = entry.codes.filter((code) => !reported.has(code));
    if (ok || missing.length > 0) {
      problems.push(
        `rejected pick "${entry.id}" is not refused by checkPickedColours${missing.length > 0 ? ` (missing ${missing.join(', ')})` : ''}`,
      );
    }
  }
}

async function main() {
  const themeRoot = resolveThemeRoot();
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const bound = boundKeysOf(theme);
  /** @type {string[]} */
  const problems = [];

  if (checkBindings(problems, theme, bound)) {
    checkDefaultPalette(problems, theme);
    await checkSmoke(problems, theme);
  }

  for (const name of STYLESHEETS_WITHOUT_BOUND_TOKENS) {
    const file = path.join(themeRoot, name);
    const keys = await declaredBoundKeys(file, bound).catch((error) => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
    for (const key of keys) {
      problems.push(
        `${name} sets --gala-${key}, which palette.follow binds (a value on a hook element overrides the palette sheet)`,
      );
    }
  }
  for (const key of await declaredBoundKeys(
    path.join(themeRoot, 'tokens.css'),
    bound,
  )) {
    problems.push(
      `tokens.css declares --gala-${key}, which palette.follow binds (the palette sheet is its only source; run tokens:generate)`,
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }
  console.log(
    `palette is valid: ${bound.size} bound tokens, default palette passes every pair in both modes, corpus derives, no stylesheet sets a bound token.`,
  );
}

await runIfMain(import.meta.url, main);

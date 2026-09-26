/**
 * DEC-097 §4/§8's acyclic theme digest cycle, implemented against this
 * package's own real packed files (see README "Digest cycle" and "What
 * `fixtureDigest`/`evidenceDigest` are, and are not" for the full
 * explanation of why this is genuine local evidence, not a stand-in for
 * the not-yet-existing S2-T11 shared CI fixture release).
 *
 * Usage: `node generate-theme-digests.mjs [--check]`. Without `--check` it
 * rewrites the theme's own `theme.json` in place. With `--check` it copies
 * the theme's packed file set into a scratch directory, regenerates
 * `theme.json` there, and fails if that differs from the committed file —
 * it never mutates the real checkout (THD-H2: the previous implementation
 * ran the generator over the real file and compared two generations of the
 * same run, which could never fail regardless of what was committed).
 */

import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import * as prettier from 'prettier';

import { compareUtf8, domainDigest, sha256Tagged } from './digest.mjs';
import { canonicalizeJcsBytes } from './jcs.mjs';
import { loadPackedFileSet } from './packed-files.mjs';
import { resolveTemplateDir } from './resolve-template-dir.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { runIfMain } from './run-if-main.mjs';
import { buildScratchThemeCopy } from './scratch-theme.mjs';

// Resolved once, from this process's own (never-changing) cwd, before any
// scratch-directory child is spawned — `check-css-hooks.mjs` needs the
// real `@rathnasgala2/template` checkout even when `--check` is running
// the other local runners against a scratch copy of the packed files
// under a disconnected `/tmp` path where the usual relative default
// cannot reach it.
const TEMPLATE_DIR = resolveTemplateDir();

const run = promisify(execFile);

const PRETTIER_CONFIG_PATH = path.join(
  import.meta.dirname,
  '..',
  '.prettierrc.json',
);

/**
 * The five runner IDs this repository can genuinely execute locally
 * (`browser`/`a11y` are S2-T22's Playwright/axe-core scope; `binary` has
 * nothing to validate since these themes declare no non-CSS assets).
 *
 * @type {readonly {runnerId: string, fixtureId: string, script: string}[]}
 */
const LOCAL_RUNNERS = [
  {
    runnerId: 'schema',
    fixtureId: 'fixture-schema-structural',
    script: 'check-theme-schema.mjs',
  },
  {
    runnerId: 'semantic',
    fixtureId: 'fixture-token-catalog-contrast',
    script: 'check-contrast.mjs',
  },
  {
    runnerId: 'package',
    fixtureId: 'fixture-package-file-set',
    script: 'check-package-file-set.mjs',
  },
  {
    runnerId: 'css',
    fixtureId: 'fixture-css-selector-catalog',
    script: 'check-css-hooks.mjs',
  },
  {
    runnerId: 'absence',
    fixtureId: 'fixture-absence-no-active-content',
    script: 'check-forbidden-constructs.mjs',
  },
];

/** @type {string} this repository's own fixed, package-content-independent
 * fixture release identity. */
const FIXTURE_RELEASE_ID = '019906f1-3b21-7c9a-8fa1-4e2c9b6d7a01';

/**
 * Write `theme.json` at `themeRoot`, formatted exactly the way `npm run
 * format`/`format:check` (Prettier, the shared `.prettierrc.json`) would
 * format it, so `digest:generate` never leaves the file in a state
 * `format:check` would then flag as stale.
 *
 * @param {string} themeRoot the repository root to write into
 * @param {Record<string, unknown>} theme the object to write
 * @returns {Promise<void>} resolves once written
 */
async function writeThemeJson(themeRoot, theme) {
  const config = JSON.parse(await readFile(PRETTIER_CONFIG_PATH, 'utf8'));
  const formatted = await prettier.format(JSON.stringify(theme), {
    ...config,
    parser: 'json',
  });
  await writeFile(path.join(themeRoot, 'theme.json'), formatted, 'utf8');
}

/**
 * Build the exact path-sorted digest "entries" array over every packed
 * repository member, virtualizing only `theme.json`.
 *
 * @param {string} themeRoot the repository root to read from
 * @param {Record<string, unknown>} theme parsed `theme.json`
 * @param {readonly string[]} excludedThemeKeys keys to omit from the
 *   virtualized `theme.json` projection
 * @returns {Promise<{path: string, byteLength: string, sha256: string}[]>}
 *   sorted digest entries
 */
async function buildEntries(themeRoot, theme, excludedThemeKeys) {
  const { packedFiles } = await loadPackedFileSet(themeRoot);
  const excluded = new Set(excludedThemeKeys);
  const entries = await Promise.all(
    packedFiles.map(async (relativePath) => {
      const bytes =
        relativePath === 'theme.json'
          ? canonicalizeJcsBytes(
              Object.fromEntries(
                Object.entries(theme).filter(([key]) => !excluded.has(key)),
              ),
            )
          : await readFile(path.join(themeRoot, relativePath));
      return {
        path: relativePath,
        byteLength: String(bytes.byteLength),
        sha256: sha256Tagged(bytes),
      };
    }),
  );
  return entries.sort((left, right) => compareUtf8(left.path, right.path));
}

/**
 * Run one local conformance-check script against `themeRoot` and report
 * whether it passed, along with its combined stdout/stderr.
 *
 * @param {string} themeRoot the repository root to check
 * @param {string} script script basename under this directory
 * @returns {Promise<{passed: boolean, output: string}>} the outcome
 */
async function runLocalCheck(themeRoot, script) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [path.join(import.meta.dirname, script)],
      {
        // `tooling/` (not the theme root itself) is the convention every
        // consumer of `resolveTemplateDir()`'s relative default assumes:
        // one level up is the theme root, two levels up is the workspace
        // sibling directory holding `template`.
        cwd: path.join(themeRoot, 'tooling'),
        env: {
          ...process.env,
          THEME_ROOT: themeRoot,
          GALA_TEMPLATE_DIR: TEMPLATE_DIR,
        },
      },
    );
    return { passed: true, output: `${stdout}${stderr}` };
  } catch (error) {
    return {
      passed: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

/**
 * @param {string} script script basename under this directory
 * @returns {Promise<string>} `sha256:<hex>` of the script's own source
 */
async function scriptDigest(script) {
  const bytes = await readFile(path.join(import.meta.dirname, script));
  return sha256Tagged(bytes);
}

/**
 * @param {Record<string, unknown>} theme parsed `theme.json`
 * @returns {Promise<Record<string, unknown>>} the fixed, package-content
 *   -independent local fixture-release record, with `fixtureDigest` set
 */
async function buildFixtureRelease(theme) {
  const runners = await Promise.all(
    [...LOCAL_RUNNERS]
      .sort((a, b) => compareUtf8(a.runnerId, b.runnerId))
      .map(async (runner) => ({
        runnerId: runner.runnerId,
        version: '1.0.0',
        executableDigest: await scriptDigest(runner.script),
      })),
  );
  const fixtures = [...LOCAL_RUNNERS]
    .sort((a, b) => compareUtf8(a.fixtureId, b.fixtureId))
    .map((runner) => {
      const inputDigest = sha256Tagged(
        canonicalizeJcsBytes({
          fixtureId: runner.fixtureId,
          runnerId: runner.runnerId,
        }),
      );
      return {
        fixtureId: runner.fixtureId,
        runnerId: runner.runnerId,
        inputDigest,
        expectedDisposition: 'accepted',
      };
    });

  const releaseWithoutDigest = {
    profile: 'gala-theme-fixture-release-v2',
    fixtureReleaseId: FIXTURE_RELEASE_ID,
    contractVersion: '2.0.0',
    browserPolicyRef: 'gala-theme-css-v2-20211224',
    binaryAssetProfile: 'gala-theme-binary-assets-v2',
    stylingContractDigest: theme.stylingContractDigest,
    runners,
    fixtures,
  };
  const fixtureDigest = domainDigest(
    'GALA-THEME-FIXTURE-RELEASE-V2',
    releaseWithoutDigest,
  );
  return { ...releaseWithoutDigest, fixtureDigest };
}

/**
 * THD-M5: the per-fixture evidence digest binds the runner's actual
 * captured output, not only its disposition — a runner that exits zero
 * while printing different diagnostics produces a different digest.
 * Exported (rather than inlined in {@link buildConformanceResult}) so the
 * binding itself has a direct unit test independent of spawning real
 * child processes.
 *
 * @param {{fixtureId: string, runnerId: string, disposition: string, output: string}} observation
 * @returns {string} `sha256:<hex>` tagged digest
 */
export function computeObservedEvidenceDigest({
  fixtureId,
  runnerId,
  disposition,
  output,
}) {
  return sha256Tagged(
    canonicalizeJcsBytes({
      fixtureId,
      runnerId,
      disposition,
      outputDigest: sha256Tagged(Buffer.from(output, 'utf8')),
    }),
  );
}

/**
 * Run every local runner for real against `themeRoot` and build the
 * conformance-result record. THD-M5: unlike the original implementation,
 * `observedEvidenceDigest` binds the runner's actual captured output (not
 * just a literal `disposition` string), so a runner that exits zero while
 * printing different diagnostics produces a different digest — evidence
 * that a re-run with the same inputs could actually contradict, rather
 * than a hash of "did five child processes exit zero" wrapped in ceremony.
 *
 * @param {string} themeRoot the repository root to check
 * @param {Record<string, unknown>} fixtureRelease this repository's own
 *   local fixture release
 * @param {string} themeConformanceInputDigest the pre-finalization digest
 * @returns {Promise<Record<string, unknown>>} the completed result, with
 *   `evidenceDigest` set
 */
async function buildConformanceResult(
  themeRoot,
  fixtureRelease,
  themeConformanceInputDigest,
) {
  const fixtures = /** @type {any[]} */ (fixtureRelease.fixtures);
  const results = await Promise.all(
    fixtures.map(async (definition) => {
      const runner = LOCAL_RUNNERS.find(
        (candidate) => candidate.fixtureId === definition.fixtureId,
      );
      if (!runner)
        throw new Error(`no local runner for ${definition.fixtureId}`);
      const { passed, output } = await runLocalCheck(themeRoot, runner.script);
      const observedDisposition = passed ? 'accepted' : 'rejected';
      const observedEvidenceDigest = computeObservedEvidenceDigest({
        fixtureId: definition.fixtureId,
        runnerId: definition.runnerId,
        disposition: observedDisposition,
        output,
      });
      const state =
        observedDisposition === definition.expectedDisposition
          ? 'pass'
          : 'fail';
      return {
        fixtureId: definition.fixtureId,
        runnerId: definition.runnerId,
        observedDisposition,
        observedEvidenceDigest,
        state,
      };
    }),
  );
  const overallState = results.every((row) => row.state === 'pass')
    ? 'pass'
    : 'fail';
  const resultWithoutDigest = {
    profile: 'gala-theme-conformance-result-v2',
    fixtureReleaseId: fixtureRelease.fixtureReleaseId,
    fixtureDigest: fixtureRelease.fixtureDigest,
    themeConformanceInputDigest,
    results,
    overallState,
  };
  const evidenceDigest = domainDigest(
    'GALA-THEME-CONFORMANCE-EVIDENCE-V2',
    resultWithoutDigest,
  );
  return { ...resultWithoutDigest, evidenceDigest };
}

/**
 * Regenerate the digest chain against the packed file set found at
 * `themeRoot`, writing `theme.json` there.
 *
 * @param {string} themeRoot the repository root to generate into
 * @returns {Promise<Record<string, unknown>>} the completed, written
 *   `theme.json` object
 */
async function generate(themeRoot) {
  /** @type {Record<string, any>} */
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const { stylesheets } = await loadPackedFileSet(themeRoot);

  for (const stylesheet of stylesheets) {
    const bytes = await readFile(path.join(themeRoot, stylesheet));
    const row = theme.assets.find((asset) => asset.path === stylesheet);
    if (!row) throw new Error(`theme.json has no assets row for ${stylesheet}`);
    row.byteLength = String(bytes.byteLength);
    row.sha256 = sha256Tagged(bytes);
  }
  await writeThemeJson(themeRoot, theme);

  const fixtureRelease = await buildFixtureRelease(theme);
  theme.fixtureDigest = fixtureRelease.fixtureDigest;
  await writeThemeJson(themeRoot, theme);

  const conformanceInputEntries = await buildEntries(themeRoot, theme, [
    'integrity',
    'evidenceDigest',
  ]);
  const themeConformanceInputDigest = domainDigest(
    'GALA-THEME-CONFORMANCE-INPUT-V2',
    conformanceInputEntries,
  );

  const conformanceResult = await buildConformanceResult(
    themeRoot,
    fixtureRelease,
    themeConformanceInputDigest,
  );
  if (conformanceResult.overallState !== 'pass') {
    throw new Error(
      `local conformance evidence did not pass: ${JSON.stringify(conformanceResult.results, null, 2)}`,
    );
  }
  theme.evidenceDigest = conformanceResult.evidenceDigest;
  await writeThemeJson(themeRoot, theme);

  const integrityEntries = await buildEntries(themeRoot, theme, ['integrity']);
  theme.integrity = domainDigest(
    'GALA-THEME-PACKAGE-INTEGRITY-V2',
    integrityEntries,
  );
  await writeThemeJson(themeRoot, theme);

  return theme;
}

async function main() {
  const check = process.argv.includes('--check');
  const themeRoot = resolveThemeRoot();
  if (!check) {
    await generate(themeRoot);
    console.log('theme.json digest cycle written.');
    return;
  }

  const committed = await readFile(path.join(themeRoot, 'theme.json'), 'utf8');
  const scratchRoot = await buildScratchThemeCopy(themeRoot);
  try {
    await generate(scratchRoot);
    const regenerated = await readFile(
      path.join(scratchRoot, 'theme.json'),
      'utf8',
    );
    if (committed !== regenerated) {
      console.error(
        'digest:check failed: regenerating the digest cycle from the ' +
          'committed packed files produces different theme.json bytes than ' +
          'what is committed (a stale sha256/digest, or digests copied from ' +
          'another theme).',
      );
      process.exitCode = 1;
      return;
    }
    console.log('theme.json digest cycle matches the committed packed files.');
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

await runIfMain(import.meta.url, main);

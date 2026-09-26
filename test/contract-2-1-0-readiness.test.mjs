/**
 * Contract 2.1.0 readiness: every gate must accept a theme.json declaring
 * `contractVersion: "2.1.0"`, a `cssLayers` list that is an ordered
 * subsequence of the published `orderedLayers` without the template-owned
 * `gala-base` entry, and the new closed pseudo-class catalog (`:hover`,
 * `:focus-visible`, `:active`, `:visited`, `:disabled`,
 * `:nth-child(even|odd)`). Built as a scratch copy of the real theme under
 * test (its stylesheets and slotHooks are already conformant), bumped to
 * 2.1.0 and given two extra rules that exercise the new pseudo-classes on
 * hooks it already declares, so the used-hook set does not change
 * (THM-M3 stays satisfied) and only the contract-version surface is new.
 *
 * Skips (rather than fails) when `GALA_TEMPLATE_DIR` does not point at a
 * 2.1.0 contract, since this suite is meaningless against an older
 * template checkout.
 */

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { resolveTemplateDir } from '../scripts/resolve-template-dir.mjs';
import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../scripts/scratch-theme.mjs';
import { normalizeSlotHooks } from './helpers/normalize-slot-hooks.mjs';
import { createRenderDirectories } from './helpers/render-directories.mjs';
import { runCheckScript } from './helpers/run-check.mjs';
import { buildFixture } from './fixtures/rich-build-input.mjs';
import { testProvenance } from './fixtures/test-provenance.mjs';

const TEMPLATE_DIR = resolveTemplateDir();
const CONTRACT_PATH = path.join(
  TEMPLATE_DIR,
  'contracts',
  'theme-styling-contract.jcs',
);

const contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
const is210Contract = contract.contractVersion === '2.1.0';
const execFileAsync = promisify(execFile);
const GENERATE_SCRIPT = path.join(
  import.meta.dirname,
  '..',
  'scripts',
  'generate-theme-digests.mjs',
);

// Isolate this fixture from the coordinator-addendum contrast pairs
// (item C: color-surface-raised/color-accent adjacency floors), which are
// a separate, real finding against the theme under test's current tokens
// (see contrast-pairs.test.mjs) and not part of what this suite tests.
// `generate-theme-digests.mjs`'s "semantic" local runner shells out to
// check-contrast.mjs, which honours GALA_CONTRAST_PAIRS_PATH from its own
// process.env — set once here and forwarded through every child process
// this file spawns.
const ORIGINAL_SEVENTEEN_PAIRS_PATH = path.join(
  await mkdtemp(path.join(tmpdir(), 'contract-210-pairs-')),
  'contrast-pairs.json',
);
{
  const allPairs = JSON.parse(
    await readFile(
      path.join(import.meta.dirname, '..', 'scripts', 'contrast-pairs.json'),
      'utf8',
    ),
  );
  const addendumLabels = new Set([
    'color-surface-raised on color-surface (surface adjacency)',
    'color-accent on color-text (accent as a non-text UI element near body text)',
    'color-accent on color-surface (accent as a non-text UI element on a raised surface)',
  ]);
  await writeFile(
    ORIGINAL_SEVENTEEN_PAIRS_PATH,
    JSON.stringify(allPairs.filter((pair) => !addendumLabels.has(pair.label))),
    'utf8',
  );
}
process.env.GALA_CONTRAST_PAIRS_PATH = ORIGINAL_SEVENTEEN_PAIRS_PATH;

/**
 * Build a scratch theme, bumped to contract 2.1.0, with two rules added
 * that exercise the new pseudo-class catalog on hooks already declared in
 * `slotHooks` (`prose-link` via `a`, `prose-list-item` via `li`).
 *
 * @returns {Promise<string>} the scratch theme root (caller removes it)
 */
async function buildContract210Fixture() {
  const scratchRoot = await buildScratchThemeCopy(resolveThemeRoot());
  // Isolate this fixture from any pre-existing THM-M3 drift in the real
  // theme under test, so this suite exercises only the contract-2.1.0
  // surface it sets out to test; drift, if any, is a separate per-theme
  // finding.
  await normalizeSlotHooks(scratchRoot);

  const themePath = path.join(scratchRoot, 'theme.json');
  const theme = JSON.parse(await readFile(themePath, 'utf8'));
  theme.contractVersion = contract.contractVersion;
  theme.stylingContractDigest = contract.catalogDigest;
  await writeFile(themePath, JSON.stringify(theme, null, 2), 'utf8');

  const componentsPath = path.join(scratchRoot, 'components.css');
  const components = await readFile(componentsPath, 'utf8');
  const additions =
    '\n[data-gala-publication-root] a:hover {\n' +
    '  color: var(--gala-color-accent);\n' +
    '}\n\n' +
    '[data-gala-publication-root] li:nth-child(even) {\n' +
    '  color: var(--gala-color-accent);\n' +
    '}\n';
  await writeFile(componentsPath, components + additions, 'utf8');
  // Both new rules re-use hooks (`prose-link`, `prose-list-item`) already
  // declared and used elsewhere, but normalize again in case the theme
  // under test does not already use one of them.
  await normalizeSlotHooks(scratchRoot);

  // Recompute the asset byteLength/sha256 rows and the full digest chain
  // against the edited components.css and the bumped contractVersion,
  // exercising every local runner (schema/css/grammar-adjacent/package/
  // absence) in the same step: `generate()` throws if any of them reject.
  const generate = await runCheckScript('generate-theme-digests.mjs', {
    env: { THEME_ROOT: scratchRoot },
  });
  if (!generate.passed) {
    throw new Error(
      `fixture setup failed: generate-theme-digests.mjs\n${generate.output}`,
    );
  }
  return scratchRoot;
}

test(
  'digest:generate accepts a contract-2.1.0 theme using the new pseudo-class catalog',
  {
    skip:
      !is210Contract && 'GALA_TEMPLATE_DIR is not a contract-2.1.0 checkout',
  },
  async () => {
    const scratchRoot = await buildContract210Fixture();
    try {
      await execFileAsync(process.execPath, [GENERATE_SCRIPT, '--check'], {
        cwd: process.cwd(),
        env: { ...process.env, THEME_ROOT: scratchRoot },
      });

      const theme = JSON.parse(
        await readFile(path.join(scratchRoot, 'theme.json'), 'utf8'),
      );
      assert.equal(theme.contractVersion, '2.1.0');
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  },
);

test(
  'check-css-hooks.mjs, check-css-grammar.mjs and check-theme-schema.mjs each accept the contract-2.1.0 fixture',
  {
    skip:
      !is210Contract && 'GALA_TEMPLATE_DIR is not a contract-2.1.0 checkout',
  },
  async () => {
    const scratchRoot = await buildContract210Fixture();
    try {
      for (const script of [
        'check-theme-schema.mjs',
        'check-css-hooks.mjs',
        'check-css-grammar.mjs',
        'check-budgets.mjs',
        'check-package-file-set.mjs',
        'check-forbidden-constructs.mjs',
      ]) {
        const { passed, output } = await runCheckScript(script, {
          env: { THEME_ROOT: scratchRoot },
        });
        assert.ok(passed, `${script}:\n${output}`);
      }
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  },
);

test(
  'renderPublication accepts the contract-2.1.0 fixture (contractVersion, cssLayers subsequence without gala-base)',
  {
    skip:
      !is210Contract && 'GALA_TEMPLATE_DIR is not a contract-2.1.0 checkout',
  },
  async () => {
    const { renderPublication } = await import(
      pathToFileURL(path.join(TEMPLATE_DIR, 'src', 'core', 'index.js')).href
    );
    const scratchRoot = await buildContract210Fixture();
    const { outputDirectory, workDirectory, sourceDirectory, cleanup } =
      await createRenderDirectories('contract-210-render-');
    try {
      const buildInput = await buildFixture();
      const { manifest } = await renderPublication(buildInput, {
        outputDirectory,
        workDirectory,
        sourceDirectory,
        themeDirectory: scratchRoot,
        provenance: testProvenance(),
      });
      assert.ok(
        manifest.assets.some((asset) =>
          asset.path.endsWith('assets/theme/components.css'),
        ),
        'manifest must record the theme components.css asset row',
      );
    } finally {
      await cleanup();
      await rm(scratchRoot, { recursive: true, force: true });
    }
  },
);

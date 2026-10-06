import { strict as assert } from 'node:assert';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { resolveTemplateDir } from '../scripts/resolve-template-dir.mjs';
import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { buildScratchThemeCopy } from '../scripts/scratch-theme.mjs';
import { normalizeSlotHooks } from './helpers/normalize-slot-hooks.mjs';
import { runCheckScript } from './helpers/run-check.mjs';

/**
 * Contract 2.1.0 pseudo-class admission (coordinator addendum, item A):
 * `check-css-hooks.mjs` must admit exactly the contract's published
 * `pseudoClasses` catalog and `nth-child`/`nth-last-child` under the
 * `composition.nthExpressionProfile` "positive An+B" reading (a keyword
 * argument, or a non-negative step/offset), and reject anything else —
 * `:focus` is not in the catalog, and `:nth-child(foo)` is not a valid
 * An+B expression.
 *
 * Skipped unless `GALA_TEMPLATE_DIR` resolves a contract publishing a
 * non-empty `pseudoClasses` catalog (2.1.0+).
 */

const contract = JSON.parse(
  await readFile(
    path.join(resolveTemplateDir(), 'contracts', 'theme-styling-contract.jcs'),
    'utf8',
  ),
);
const hasPseudoClassCatalog = (contract.pseudoClasses ?? []).length > 0;

/**
 * @param {string} extraRule a rule to append to a scratch copy's
 *   components.css, expected to use the `prose-list-item` hook (`li`, an
 *   atom already declared and used elsewhere in every reference theme) so
 *   no unrelated slotHooks drift is introduced
 * @returns {Promise<{passed: boolean, output: string}>} check-css-hooks.mjs's outcome
 */
async function checkWithExtraRule(extraRule) {
  const scratchRoot = await buildScratchThemeCopy(resolveThemeRoot());
  try {
    // Isolate this fixture from any pre-existing THM-M3 drift in the real
    // theme it was copied from, so a failure below is attributable to
    // `extraRule` alone.
    await normalizeSlotHooks(scratchRoot);
    const componentsPath = path.join(scratchRoot, 'components.css');
    const components = await readFile(componentsPath, 'utf8');
    await writeFile(componentsPath, `${components}\n${extraRule}\n`, 'utf8');
    return await runCheckScript('check-css-hooks.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

test(
  ':focus is rejected (not in the published pseudoClasses catalog)',
  {
    skip:
      !hasPseudoClassCatalog && 'contract publishes no pseudoClasses catalog',
  },
  async () => {
    const { passed, output } = await checkWithExtraRule(
      '[data-gala-publication-root] li:focus { color: red; }',
    );
    assert.ok(!passed, output);
    assert.match(output, /not in the template's published hook catalog/);
  },
);

test(
  ':nth-child(2n+1) is accepted (a non-negative An+B expression)',
  {
    skip:
      !hasPseudoClassCatalog && 'contract publishes no pseudoClasses catalog',
  },
  async () => {
    const { passed, output } = await checkWithExtraRule(
      '[data-gala-publication-root] li:nth-child(2n+1) { color: red; }',
    );
    assert.ok(passed, output);
  },
);

test(
  ':nth-child(even) is accepted (a published keyword argument)',
  {
    skip:
      !hasPseudoClassCatalog && 'contract publishes no pseudoClasses catalog',
  },
  async () => {
    const { passed, output } = await checkWithExtraRule(
      '[data-gala-publication-root] li:nth-child(even) { color: red; }',
    );
    assert.ok(passed, output);
  },
);

test(
  ':nth-child(foo) is rejected (not a valid An+B expression or keyword)',
  {
    skip:
      !hasPseudoClassCatalog && 'contract publishes no pseudoClasses catalog',
  },
  async () => {
    const { passed, output } = await checkWithExtraRule(
      '[data-gala-publication-root] li:nth-child(foo) { color: red; }',
    );
    assert.ok(!passed, output);
    assert.match(output, /not in the template's published hook catalog/);
  },
);

test(
  'a pseudo-class-suffixed compound counts toward the same hookId as its bare form (THM-M3)',
  {
    skip:
      !hasPseudoClassCatalog && 'contract publishes no pseudoClasses catalog',
  },
  async () => {
    // `li:hover` alone (no bare `li` selector added) must still mark
    // `prose-list-item` as used, since the hookId is derived from the atom
    // after stripping the pseudo-class, not from the full compound text.
    const scratchRoot = await buildScratchThemeCopy(resolveThemeRoot());
    try {
      await normalizeSlotHooks(scratchRoot);
      const themePath = path.join(scratchRoot, 'theme.json');
      const theme = JSON.parse(await readFile(themePath, 'utf8'));
      assert.ok(
        theme.slotHooks.includes('prose-list-item'),
        'fixture assumption: prose-list-item must already be declared',
      );
      const componentsPath = path.join(scratchRoot, 'components.css');
      const components = await readFile(componentsPath, 'utf8');
      await writeFile(
        componentsPath,
        `${components}\n[data-gala-publication-root] li:hover { color: red; }\n`,
        'utf8',
      );
      const { passed, output } = await runCheckScript('check-css-hooks.mjs', {
        env: { THEME_ROOT: scratchRoot },
      });
      assert.ok(passed, output);
      assert.doesNotMatch(output, /prose-list-item/);
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  },
);

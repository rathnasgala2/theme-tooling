/**
 * CSS-hook closure conformance test (task packet S2-T13): every selector in
 * every packed stylesheet must resolve to nothing but the template's own
 * published, closed 64-entry `publicThemeSlotHooks` catalog
 * (`contracts/theme-styling-contract.jcs` in `@rathnasgala2/template`,
 * consumed by path per LOCAL-4/README "Consuming the template by path"),
 * scoped under the required root/palette compound, joined only by the
 * contract's own closed combinator set, with only the contract's closed
 * pseudo-element set attached.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

import { loadPackedFileSet } from './packed-files.mjs';
import { resolveTemplateDir } from './resolve-template-dir.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';

const ALLOWED_PSEUDO_ELEMENTS = new Set([
  '::before',
  '::after',
  '::marker',
  '::selection',
]);
const ALLOWED_COMBINATORS = new Set(['', '>', '+', '~']);

/**
 * @returns {Promise<{contract: any, allowedAtoms: Set<string>, rootCompounds: Set<string>}>}
 */
async function loadContract() {
  // `contracts/theme-styling-contract.jcs` is read directly off disk from
  // the template checkout `resolveTemplateDir()` resolves (this
  // repository's tooling consumes the template *by path*, not as an npm
  // dependency — independent-review finding on S2-T13).
  const templateRoot = resolveTemplateDir();
  const contractPath = path.join(
    templateRoot,
    'contracts',
    'theme-styling-contract.jcs',
  );
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const allowedAtoms = new Set(
    contract.publicThemeSlotHooks.map((hook) => hook.selectorAtom),
  );
  const rootCompounds = new Set([
    contract.publicationRootSelector,
    contract.resolvedPaletteSelectors.light,
    contract.resolvedPaletteSelectors.dark,
  ]);
  return { contract, allowedAtoms, rootCompounds };
}

/**
 * @param {import('postcss-selector-parser').Selector} selector one parsed
 *   selector (a comma-separated member of a selector list)
 * @returns {{compounds: string[], combinators: string[]}} the selector
 *   decomposed into combinator-separated compound substrings
 */
function decompose(selector) {
  const compounds = [];
  const combinators = [];
  let current = '';
  selector.walk((node) => {
    if (node.type === 'combinator') {
      compounds.push(current);
      combinators.push(node.value.trim());
      current = '';
      return;
    }
    current += node.toString();
  });
  compounds.push(current);
  return { compounds, combinators };
}

/**
 * @param {string} compound one compound selector's exact text
 * @param {Set<string>} allowedAtoms the 64-hook selectorAtom catalog
 * @returns {{atom: string, pseudoElements: string[]} | null} the split
 *   atom/pseudo-elements, or `null` if the compound is not a single
 *   allowed atom plus zero or more allowed pseudo-elements
 */
function splitTrailingPseudoElements(compound, allowedAtoms) {
  let remaining = compound;
  const pseudoElements = [];
  while (true) {
    const match = /(::[a-zA-Z-]+)$/.exec(remaining);
    if (!match) break;
    pseudoElements.unshift(match[1]);
    remaining = remaining.slice(0, -match[1].length);
  }
  if (!allowedAtoms.has(remaining)) return null;
  return { atom: remaining, pseudoElements };
}

async function main() {
  const { allowedAtoms, rootCompounds } = await loadContract();
  const { stylesheets } = await loadPackedFileSet();
  const themeRoot = resolveThemeRoot();
  let failed = false;

  for (const stylesheet of stylesheets) {
    const css = await readFile(path.join(themeRoot, stylesheet), 'utf8');
    const root = postcss.parse(css, { from: stylesheet });
    root.walkRules((rule) => {
      // `rule.selectors` (postcss, not postcss-selector-parser) is the
      // already comma-split, whitespace-trimmed list of individual
      // selectors — parsing each one separately (rather than the raw,
      // possibly multi-line `rule.selector` text as one selector list)
      // avoids a leading-whitespace artifact from the source formatting
      // of a later selector in a grouped rule leaking into its first
      // compound's text.
      for (const singleSelector of rule.selectors) {
        const list = selectorParser().astSync(singleSelector);
        list.each((selector) => {
          const { compounds, combinators } = decompose(selector);
          const [firstRaw, ...rest] = compounds;
          const firstSplit = splitTrailingPseudoElements(
            firstRaw,
            rootCompounds,
          );
          if (!firstSplit) {
            console.error(
              `${stylesheet}: "${singleSelector}" does not start with the required root/palette compound (got "${firstRaw}")`,
            );
            failed = true;
            return;
          }
          for (const pseudoElement of firstSplit.pseudoElements) {
            if (!ALLOWED_PSEUDO_ELEMENTS.has(pseudoElement)) {
              console.error(
                `${stylesheet}: "${singleSelector}" uses a pseudo-element not in the closed set: "${pseudoElement}"`,
              );
              failed = true;
            }
          }
          for (const combinator of combinators) {
            if (!ALLOWED_COMBINATORS.has(combinator)) {
              console.error(
                `${stylesheet}: "${singleSelector}" uses a combinator not in the closed set: "${combinator}"`,
              );
              failed = true;
            }
          }
          for (const compound of rest) {
            const split = splitTrailingPseudoElements(compound, allowedAtoms);
            if (!split) {
              console.error(
                `${stylesheet}: "${singleSelector}" uses a hook not in the template's published 64-hook catalog: "${compound}"`,
              );
              failed = true;
              continue;
            }
            for (const pseudoElement of split.pseudoElements) {
              if (!ALLOWED_PSEUDO_ELEMENTS.has(pseudoElement)) {
                console.error(
                  `${stylesheet}: "${singleSelector}" uses a pseudo-element not in the closed set: "${pseudoElement}"`,
                );
                failed = true;
              }
            }
          }
        });
      }
    });
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('every selector resolves only to the closed 64-hook catalog.');
}

await main();

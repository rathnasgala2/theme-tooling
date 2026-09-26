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

// `nth-child`/`nth-last-child` are the only functional pseudo-classes this
// runner admits (`:is()`/`:where()`/`:not()` are in the contract's
// `functionalPseudos` too, but no reference theme uses them and validating
// their compound-only, depth-1 nested-selector argument is a separate
// feature; out of scope here).
const FUNCTIONAL_NTH_PSEUDO_NAMES = new Set(['nth-child', 'nth-last-child']);

/**
 * Validate an `nth-child()`/`nth-last-child()` argument against the
 * contract's `nthExpressionProfile: "gala-positive-an-plus-b-v2"`: the
 * `functionalPseudoKeywordArguments` keywords, or a non-negative An+B
 * expression (no leading `-` on either the step or the offset) — `n`,
 * `2n`, `3n+1`, or a bare non-negative integer. A profile name is
 * published, not a grammar, so this regex is this runner's own
 * interpretation of "positive An+B", scoped to what the two admitted
 * keywords plus ordinary non-negative step/offset forms need.
 *
 * @param {string} argument the raw text inside the parentheses
 * @param {ReadonlySet<string>} keywordArguments contract's
 *   `functionalPseudoKeywordArguments` (e.g. `even`, `odd`)
 * @returns {boolean} whether the argument is admitted
 */
function isValidPositiveAnPlusB(argument, keywordArguments) {
  const trimmed = argument.trim();
  if (keywordArguments.has(trimmed)) return true;
  return /^(?:\d*n(?:\s*\+\s*\d+)?|\d+)$/.test(trimmed);
}

/**
 * @returns {Promise<{contract: any, allowedAtoms: Set<string>, rootCompounds: Set<string>, atomToHookId: Map<string, string>}>}
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
  const atomToHookId = new Map(
    contract.publicThemeSlotHooks.map((hook) => [
      hook.selectorAtom,
      hook.hookId,
    ]),
  );
  const rootCompounds = new Set([
    contract.publicationRootSelector,
    contract.resolvedPaletteSelectors.light,
    contract.resolvedPaletteSelectors.dark,
  ]);
  // Contract 2.1.0 (TPL-H2): the simple pseudo-class catalog and the
  // nth-expression keyword arguments are read from the published contract
  // itself, not hand-copied here, so a future contract revision that adds
  // or removes a pseudo-class takes effect without an edit to this file.
  // An older (2.0.0) contract publishes no `pseudoClasses`/
  // `composition.functionalPseudoKeywordArguments` at all, so both
  // default to empty.
  const allowedSimplePseudoClasses = new Set(
    (contract.pseudoClasses ?? []).map((name) => `:${name}`),
  );
  const nthKeywordArguments = new Set(
    contract.composition?.functionalPseudoKeywordArguments ?? [],
  );
  const allowedFunctionalPseudoNames = new Set(
    (contract.functionalPseudos ?? []).filter((name) =>
      FUNCTIONAL_NTH_PSEUDO_NAMES.has(name),
    ),
  );
  return {
    contract,
    allowedAtoms,
    rootCompounds,
    atomToHookId,
    allowedSimplePseudoClasses,
    nthKeywordArguments,
    allowedFunctionalPseudoNames,
  };
}

/**
 * Strip zero or more trailing simple/functional pseudo-classes from a
 * compound's remaining text, after any trailing pseudo-elements have
 * already been removed, against the contract's own published catalogs.
 *
 * @param {string} compound compound text with pseudo-elements already stripped
 * @param {ReadonlySet<string>} allowedSimplePseudoClasses e.g. `:hover`
 * @param {ReadonlySet<string>} allowedFunctionalPseudoNames e.g. `nth-child`
 * @param {ReadonlySet<string>} nthKeywordArguments e.g. `even`, `odd`
 * @returns {{remaining: string, pseudoClasses: string[]}} the atom text and
 *   the stripped pseudo-classes, outermost-last
 */
function stripTrailingPseudoClasses(
  compound,
  allowedSimplePseudoClasses,
  allowedFunctionalPseudoNames,
  nthKeywordArguments,
) {
  let remaining = compound;
  const pseudoClasses = [];
  while (true) {
    const functionalMatch = /:([a-zA-Z-]+)\(([^()]*)\)$/.exec(remaining);
    if (
      functionalMatch &&
      allowedFunctionalPseudoNames.has(functionalMatch[1]) &&
      isValidPositiveAnPlusB(functionalMatch[2], nthKeywordArguments)
    ) {
      pseudoClasses.unshift(functionalMatch[0]);
      remaining = remaining.slice(0, -functionalMatch[0].length);
      continue;
    }
    const simpleMatch = /(:[a-zA-Z-]+)$/.exec(remaining);
    if (simpleMatch && allowedSimplePseudoClasses.has(simpleMatch[1])) {
      pseudoClasses.unshift(simpleMatch[1]);
      remaining = remaining.slice(0, -simpleMatch[1].length);
      continue;
    }
    break;
  }
  return { remaining, pseudoClasses };
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
  // `selector.each()` visits only this selector's direct children (tag,
  // id, class, attribute, pseudo, combinator). A functional pseudo-class
  // such as `:nth-child(even)` renders its whole text, argument included,
  // from a single top-level pseudo node's own `toString()` — the argument
  // is not itself walked as a sibling compound. `selector.walk()` instead
  // recurses into that argument's nested selector nodes too, appending
  // their text a second time (e.g. "li:nth-child(even)eveneven"), which is
  // why this uses `each()` rather than `walk()`.
  selector.each((node) => {
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
 * @param {ReadonlySet<string>} allowedSimplePseudoClasses e.g. `:hover`
 * @param {ReadonlySet<string>} allowedFunctionalPseudoNames e.g. `nth-child`
 * @param {ReadonlySet<string>} nthKeywordArguments e.g. `even`, `odd`
 * @returns {{atom: string, pseudoElements: string[]} | null} the split
 *   atom/pseudo-elements, or `null` if the compound is not a single
 *   allowed atom plus zero or more allowed pseudo-elements/classes
 */
function splitTrailingPseudoElements(
  compound,
  allowedAtoms,
  allowedSimplePseudoClasses,
  allowedFunctionalPseudoNames,
  nthKeywordArguments,
) {
  let remaining = compound;
  const pseudoElements = [];
  while (true) {
    const match = /(::[a-zA-Z-]+)$/.exec(remaining);
    if (!match) break;
    pseudoElements.unshift(match[1]);
    remaining = remaining.slice(0, -match[1].length);
  }
  // Contract 2.1.0: a pseudo-class (`:hover`, `:nth-child(even)`, ...) may
  // sit between the atom and any trailing pseudo-element(s), e.g.
  // `a:hover::before`. Strip it before checking the remaining text
  // against the closed atom catalog.
  const { remaining: atom, pseudoClasses } = stripTrailingPseudoClasses(
    remaining,
    allowedSimplePseudoClasses,
    allowedFunctionalPseudoNames,
    nthKeywordArguments,
  );
  if (!allowedAtoms.has(atom)) return null;
  return { atom, pseudoElements, pseudoClasses };
}

async function main() {
  const {
    allowedAtoms,
    rootCompounds,
    atomToHookId,
    allowedSimplePseudoClasses,
    allowedFunctionalPseudoNames,
    nthKeywordArguments,
  } = await loadContract();
  const { stylesheets } = await loadPackedFileSet();
  const themeRoot = resolveThemeRoot();
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const usedHookIds = new Set();
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
            allowedSimplePseudoClasses,
            allowedFunctionalPseudoNames,
            nthKeywordArguments,
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
            const split = splitTrailingPseudoElements(
              compound,
              allowedAtoms,
              allowedSimplePseudoClasses,
              allowedFunctionalPseudoNames,
              nthKeywordArguments,
            );
            if (!split) {
              console.error(
                `${stylesheet}: "${singleSelector}" uses a hook not in the template's published 64-hook catalog: "${compound}"`,
              );
              failed = true;
              continue;
            }
            usedHookIds.add(atomToHookId.get(split.atom));
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

  // THM-M3: `theme.json.slotHooks` is documented as "the exact sorted set
  // of hook IDs this CSS actually uses" — a claim only checked in one
  // direction above (every used hook is in the closed catalog). Assert
  // set-equality in both directions between what the CSS actually matched
  // and what `theme.json` declares, so `slotHooks` can no longer drift
  // from the CSS silently in either direction.
  const declaredHookIds = new Set(
    Array.isArray(theme.slotHooks) ? theme.slotHooks : [],
  );
  const missingFromCss = [...declaredHookIds]
    .filter((hookId) => !usedHookIds.has(hookId))
    .sort();
  const extraInCss = [...usedHookIds]
    .filter((hookId) => !declaredHookIds.has(hookId))
    .sort();
  if (missingFromCss.length > 0) {
    console.error(
      `theme.json.slotHooks declares hook(s) the CSS never uses: ${missingFromCss.join(', ')}`,
    );
    failed = true;
  }
  if (extraInCss.length > 0) {
    console.error(
      `the CSS uses hook(s) theme.json.slotHooks does not declare: ${extraInCss.join(', ')}`,
    );
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('every selector resolves only to the closed 64-hook catalog.');
}

await main();

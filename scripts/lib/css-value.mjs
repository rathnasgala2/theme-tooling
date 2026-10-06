/**
 * Normalize a declaration value as Prettier may have wrapped it: whitespace
 * runs collapse to one space and the padding Prettier adds inside
 * parentheses and around commas is removed, so a long gradient token that
 * `format` broke over several lines compares equal to its single-line
 * `theme.json` form (which is also the form the token grammars admit).
 *
 * @param {string} value raw declaration value
 * @returns {string} the single-line canonical value
 */
export function normalizeCssValue(value) {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/\( /gu, '(')
    .replace(/ \)/gu, ')')
    .replace(/ ,/gu, ',')
    .trim();
}

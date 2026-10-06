/**
 * Mirror of `@rathnasgala2/schemas` 3.0.0's theme contract 3 token catalog
 * and value grammars (`scripts/internal-semantics/theme-token-grammar.js`
 * in the schema repository). The published schemas package does not export
 * that module (it ships only the built JSON Schema and `validateGalaDocument`),
 * so this tooling mirrors it verbatim and `test/token-catalog.test.mjs` pins
 * the mirror to the package's own `default-3.0.json` example (exact key
 * list, order and types, and every value admitted by the grammar). When the
 * schema's grammar changes, re-copy it here and let that test show the diff.
 *
 * Every grammar is an allow-list: a value that is not produced by the
 * grammar is rejected, so `url(`, `var(`, `calc(`, `attr(`, `expression`,
 * `;`, `{`, `}`, `\`, and quotes never need a separate deny-list.
 */
const INTEGER = '(?:0|[1-9][0-9]{0,5})';
const FRACTION = '(?:\\.[0-9]{1,4})?';
const COLOR = '#[0-9a-f]{6}(?:[0-9a-f]{2})?';
const LENGTH = `(?:0|-?${INTEGER}${FRACTION}(?:px|rem|em|%))`;
const PERCENT = `-?${INTEGER}${FRACTION}%`;
const BEZIER_NUMBER = '-?(?:0|[1-9][0-9]?)(?:\\.[0-9]{1,4})?';
const STOP = `(?:${COLOR}|transparent)(?: ${LENGTH}(?: ${LENGTH})?)?`;
const STOPS = `${STOP}(?:, ${STOP}){1,4}`;
const DEGREES = '-?(?:0|[1-9][0-9]{0,2})deg';
const GRADIENT =
  `(?:(?:repeating-)?linear-gradient\\(${DEGREES}, ${STOPS}\\)` +
  `|radial-gradient\\(${LENGTH} ${LENGTH} at ${PERCENT} ${PERCENT}, ${STOPS}\\))`;
const SHADOW_LAYER = `(?:inset )?${LENGTH} ${LENGTH} ${LENGTH}(?: ${LENGTH})? ${COLOR}`;

/** Maximum UTF-16 length of any token value. */
export const TOKEN_VALUE_MAX_LENGTH = 640;

/** Value types whose light and dark values may differ. */
export const MODE_VARIANT_TYPES = Object.freeze([
  'color',
  'paint',
  'border',
  'shadow',
]);

/** Every token value type, in schema order. */
export const TOKEN_TYPES = Object.freeze([
  'color',
  'length',
  'box',
  'number',
  'duration',
  'easing',
  'font-family',
  'font-weight',
  'border',
  'shadow',
  'paint',
  'keyword',
]);

/** Anchored allow-list grammar source per value type (keyword uses enums). */
export const VALUE_PATTERNS = Object.freeze(
  /** @type {Record<string, string>} */ ({
    color: `^${COLOR}$`,
    length: `^${LENGTH}$`,
    box: `^${LENGTH}(?: ${LENGTH}){0,3}$`,
    number: '^(?:10(?:\\.0{1,3})?|[0-9](?:\\.[0-9]{1,3})?)$',
    duration: '^(?:0|[1-9][0-9]{0,2}|1[0-9]{3}|2000)ms$',
    easing: `^(?:linear|cubic-bezier\\(${BEZIER_NUMBER}, ${BEZIER_NUMBER}, ${BEZIER_NUMBER}, ${BEZIER_NUMBER}\\))$`,
    'font-family':
      '^[A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+)*(?:, [A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+)*){0,7}$',
    'font-weight': '^(?:[1-9][0-9]{0,2}|1000)$',
    border: `^(?:none|${LENGTH} (?:solid|dashed) ${COLOR})$`,
    shadow: `^(?:none|${SHADOW_LAYER}(?:, ${SHADOW_LAYER}){0,2})$`,
    paint: `^(?:none|${COLOR}|${GRADIENT}(?:, ${GRADIENT}){0,2})$`,
  }),
);

/** Closed per-key enum of every `keyword` token. */
export const KEYWORD_ENUMS = Object.freeze(
  /** @type {Record<string, string[]>} */ ({
    'decor-size': ['auto', '100% 46rem'],
    'display-style': ['normal', 'italic'],
    'label-transform': ['none', 'uppercase'],
    'link-skip-ink': ['auto', 'none'],
    'media-filter': ['none', 'grayscale(1)'],
    'media-filter-hover': ['none', 'grayscale(1)'],
    'quote-align': ['start', 'center'],
    'quote-mark': ['none', 'open-quote'],
    'quote-style': ['normal', 'italic'],
    'quote-transform': ['none', 'uppercase'],
    'title-transform': ['none', 'uppercase'],
  }),
);

const GROUPS = {
  color: [
    'color-accent',
    'color-accent-2',
    'color-border',
    'color-btn-panel',
    'color-btn-panel-text',
    'color-btn-text',
    'color-canvas',
    'color-chip-text',
    'color-code-canvas',
    'color-code-text',
    'color-danger',
    'color-focus',
    'color-footer',
    'color-header',
    'color-icon-accent',
    'color-input',
    'color-input-border',
    'color-link',
    'color-link-underline',
    'color-link-underline-hover',
    'color-link-visited',
    'color-on-accent',
    'color-overlay',
    'color-panel-muted',
    'color-panel-text',
    'color-selection',
    'color-success',
    'color-surface',
    'color-surface-raised',
    'color-syntax-comment',
    'color-syntax-function',
    'color-syntax-keyword',
    'color-syntax-number',
    'color-syntax-string',
    'color-text',
    'color-text-faint',
    'color-text-muted',
    'color-toc-active',
    'color-toc-active-text',
    'color-warning',
  ],
  paint: ['paint-button', 'paint-chip', 'paint-page-decor', 'paint-panel'],
  border: [
    'border-button',
    'border-card',
    'border-chip',
    'border-code',
    'border-media-divider',
    'border-quote',
    'border-row-divider',
    'border-section-rule',
  ],
  shadow: [
    'shadow-avatar-ring',
    'shadow-button',
    'shadow-card',
    'shadow-card-hover',
    'shadow-dialog',
  ],
  'font-family': [
    'font-body',
    'font-display',
    'font-label',
    'font-mono',
    'font-ui',
  ],
  'font-weight': [
    'weight-display',
    'weight-normal',
    'weight-strong',
    'weight-title',
    'weight-ui',
  ],
  length: [
    'border-width',
    'card-inset',
    'card-title-size',
    'content-measure',
    'display-max',
    'focus-width',
    'lift-x',
    'lift-y',
    'link-offset',
    'link-offset-hover',
    'link-thickness',
    'prose-size',
    'radius-avatar',
    'radius-large',
    'radius-media',
    'radius-medium',
    'radius-pill',
    'radius-small',
    'row-pad',
    'space-1',
    'space-2',
    'space-3',
    'space-4',
    'space-6',
    'space-8',
    'tracking-display',
    'tracking-label',
    'tracking-title',
  ],
  box: ['card-pad', 'chip-pad', 'quote-pad'],
  number: ['media-zoom', 'prose-leading'],
  duration: ['duration-base', 'duration-fast', 'duration-slow'],
  easing: ['ease-standard', 'ease-spring'],
  keyword: Object.keys(KEYWORD_ENUMS),
};

/**
 * The exact ordered token catalog: `[key, type]` rows sorted by key in UTF-8
 * byte order (all keys are lowercase ASCII, so code-unit order is byte order).
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const THEME_TOKEN_CATALOG = Object.freeze(
  Object.entries(GROUPS)
    .flatMap(([type, keys]) =>
      keys.map((key) => /** @type {[string, string]} */ ([key, type])),
    )
    .sort(([left], [right]) =>
      Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')),
    )
    .map((row) => Object.freeze(row)),
);

/**
 * Test one token value against its type's grammar.
 *
 * @param {string} key token key
 * @param {string} type token value type
 * @param {unknown} value candidate value
 * @returns {boolean} whether the value is admitted
 */
export function isAdmittedTokenValue(key, type, value) {
  if (typeof value !== 'string' || value.length > TOKEN_VALUE_MAX_LENGTH) {
    return false;
  }
  if (type === 'keyword') {
    return (KEYWORD_ENUMS[key] ?? []).includes(value);
  }
  const source = VALUE_PATTERNS[type];
  if (source === undefined) return false;
  if (!new RegExp(source, 'u').test(value)) return false;
  return (
    type !== 'font-family' ||
    value
      .split(', ')
      .every((component) => Buffer.byteLength(component, 'ascii') <= 64)
  );
}

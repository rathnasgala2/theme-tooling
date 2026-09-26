/**
 * A minimal RFC 8785 (JSON Canonicalization Scheme, "JCS") serializer,
 * sufficient for this repository's own digest computations (DEC-097 §4/§8):
 * plain objects, arrays, strings, booleans, `null`, and safe integers —
 * every value this repository ever canonicalizes (theme.json's own fields
 * and this repository's local conformance fixture-release/result records).
 * No floating-point number ever needs canonicalizing here, so the ECMA-262
 * `Number::toString` edge cases RFC 8785 §3.2.2.3 exists for do not arise.
 *
 * This is an independent reimplementation of the *published* RFC 8785
 * algorithm (object keys sorted by UTF-16 code unit, no insignificant
 * whitespace, minimal string escaping), not a copy of any Gala repository's
 * internal `canonical-jcs.js` (that module is not part of
 * `@rathnasgala2/schemas`' published `exports` map, so it cannot be
 * imported as a dependency from here).
 */

/**
 * @param {unknown} value a JSON-compatible value
 * @returns {string} its RFC 8785 canonical JSON serialization
 */
export function canonicalizeJcs(value) {
  return serialize(value);
}

/**
 * @param {unknown} value a JSON-compatible value
 * @returns {Buffer} the UTF-8 bytes of {@link canonicalizeJcs}'s output
 */
export function canonicalizeJcsBytes(value) {
  return Buffer.from(serialize(value), 'utf8');
}

/**
 * @param {unknown} value a JSON-compatible value
 * @returns {string} canonical JSON text
 */
function serialize(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('JCS_NUMBER_NOT_FINITE');
    }
    return String(value);
  }
  if (typeof value === 'string') return serializeString(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serialize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => compareUtf16(a, b));
    const members = keys.map(
      (key) =>
        `${serializeString(key)}:${serialize(/** @type {Record<string, unknown>} */ (value)[key])}`,
    );
    return `{${members.join(',')}}`;
  }
  throw new TypeError(`JCS_VALUE_UNSUPPORTED: ${typeof value}`);
}

/**
 * Compare two strings by UTF-16 code unit, as RFC 8785 §3.2.3 requires for
 * object member ordering.
 *
 * @param {string} a first string
 * @param {string} b second string
 * @returns {number} comparison result
 */
function compareUtf16(a, b) {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const codeA = a.charCodeAt(index);
    const codeB = b.charCodeAt(index);
    if (codeA !== codeB) return codeA - codeB;
  }
  return a.length - b.length;
}

/**
 * JSON-escape one string exactly as RFC 8785 requires (the same minimal
 * escaping standard `JSON.stringify` already performs for a plain string:
 * quote, backslash, and control characters only; no extra escaping of
 * `/` or non-ASCII code points).
 *
 * @param {string} value a string value or object key
 * @returns {string} its quoted, escaped JSON representation
 */
function serializeString(value) {
  return JSON.stringify(value);
}

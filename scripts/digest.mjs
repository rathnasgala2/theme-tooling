import { createHash } from 'node:crypto';

import { canonicalizeJcsBytes } from './jcs.mjs';

/**
 * @param {Uint8Array | Buffer} bytes exact bytes to hash
 * @returns {string} `sha256:<hex>` tagged digest
 */
export function sha256Tagged(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Compute one DEC-097 §8 domain-separated digest:
 * `SHA256(UTF8(domain + "\0") || JCS(value))`.
 *
 * @param {string} domain the domain tag, without its trailing NUL
 * @param {unknown} value the JSON value to canonicalize and hash
 * @returns {string} `sha256:<hex>` tagged digest
 */
export function domainDigest(domain, value) {
  const hash = createHash('sha256');
  hash.update(`${domain}\0`, 'utf8');
  hash.update(canonicalizeJcsBytes(value));
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Compare two strings by unsigned UTF-8 byte sequence (used to sort digest
 * "entries" arrays the same way DEC-097's own reference implementation
 * does).
 *
 * @param {string} a first string
 * @param {string} b second string
 * @returns {number} comparison result
 */
export function compareUtf8(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

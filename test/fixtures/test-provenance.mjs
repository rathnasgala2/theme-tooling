import { buildFixtureProvenance } from '../../scripts/fixture-provenance.mjs';

/**
 * A schema-valid, deterministic placeholder `provenance` bundle, the same
 * placeholder-digest convention `@rathnasgala2/template`'s own
 * `test/helpers/render-fixtures.js#testProvenance` uses (that helper is not
 * part of the template package's published `files`, so it is reproduced
 * here rather than imported — see README "Consuming the template by
 * path"). Not a truthful release fact; a real caller
 * (`publish-kernel`/`publish-action`) supplies its own verified values.
 *
 * @returns {Record<string, unknown>} a fresh provenance bundle
 */
export function testProvenance() {
  return buildFixtureProvenance();
}

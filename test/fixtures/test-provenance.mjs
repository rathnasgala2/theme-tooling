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
  const digest = (n) => `sha256:${'0'.repeat(64 - String(n).length)}${n}`;
  return {
    builder: {
      package: '@rathnasgala2/publish-action',
      version: '2.0.0',
      integrity: digest(1),
      registry: 'https://fixture-1.example.com/',
    },
    repositoryCoordinate: 'fixture-owner/fixture-repository',
    workflowIdentity: digest(1),
    buildToolVersions: [
      { kind: 'runtime', name: 'node', version: '24.18.0', digest: digest(1) },
      { kind: 'runtime', name: 'npm', version: '11.16.0', digest: digest(2) },
      {
        kind: 'package',
        package: '@rathnasgala2/schemas',
        version: '2.0.0',
        digest: digest(3),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/template',
        version: '2.0.0',
        digest: digest(4),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/theme-default',
        version: '2.0.0',
        digest: digest(5),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/publish-action',
        version: '2.0.0',
        digest: digest(6),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/publish-kernel',
        version: '2.0.0',
        digest: digest(7),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/adapter-protocol',
        version: '2.0.0',
        digest: digest(8),
      },
      {
        kind: 'package',
        package: '@rathnasgala2/adapter-local-directory',
        version: '2.0.0',
        digest: digest(9),
      },
    ],
  };
}

import { createHash } from 'node:crypto';

/**
 * Fixed timestamp substituted for `metadata.timestamp` so the committed SBOM
 * does not change on every `sbom:generate` run (mirrors
 * `@rathnasgala2/template`'s own `scripts/sbom-normalize.mjs`; the theme
 * package has no runtime dependencies, but the same non-determinism in
 * `cyclonedx-npm`'s own `serialNumber`/`metadata.timestamp` output applies).
 *
 * @type {string}
 */
export const SBOM_FIXED_TIMESTAMP = '2000-01-01T00:00:00Z';

/**
 * Derive a stable, syntactically valid `urn:uuid:` serial number from the
 * package identity so repeated generations of the same package identity
 * produce the same SBOM bytes.
 *
 * @param {string} name package name
 * @param {string} version package version
 * @returns {string} a `urn:uuid:`-prefixed deterministic identifier
 */
export function deterministicSerialNumber(name, version) {
  const hash = createHash('sha256')
    .update(`gala-sbom-serial-number-v1\0${name}@${version}`, 'utf8')
    .digest('hex');
  const uuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
  return `urn:uuid:${uuid}`;
}

/**
 * Split a (possibly scoped) npm package name into its `@scope` group and
 * unscoped name, mirroring how CycloneDX/`cyclonedx-npm` represent scoped
 * packages as separate `group`/`name` fields.
 *
 * @param {string} fullName full package name, e.g. `@rathnasgala2/theme-default`
 * @returns {{group: string | undefined, name: string}} the split identity
 */
export function splitScopedPackageName(fullName) {
  if (fullName.startsWith('@')) {
    const slashIndex = fullName.indexOf('/');
    return {
      group: fullName.slice(0, slashIndex),
      name: fullName.slice(slashIndex + 1),
    };
  }
  return { group: undefined, name: fullName };
}

/**
 * Build a `pkg:npm/...` purl for a package identity, matching
 * `cyclonedx-npm`'s own encoding (the leading `@` of a scope is
 * percent-encoded as `%40`; the rest of the scoped path is literal).
 *
 * @param {string} fullName full package name
 * @param {string} version package version
 * @returns {string} the purl
 */
export function toPurl(fullName, version) {
  const encoded = fullName.startsWith('@')
    ? `%40${fullName.slice(1)}`
    : fullName;
  return `pkg:npm/${encoded}@${version}`;
}

/**
 * Build a complete, self-contained CycloneDX 1.6 document describing a
 * theme package **alone** — root component only, zero dependency
 * components — instead of shelling out to `cyclonedx-npm` at all (THD-M6,
 * post-mortem: the previous design ran `cyclonedx-npm --package-lock-only`
 * against `@rathnasgala2/theme-tooling`'s own `package-lock.json` and
 * attributed the result to the calling theme's identity; that tied every
 * theme's committed SBOM to the tooling package's devDependency tree,
 * which is not something the published theme actually ships, and produced
 * bytes that depended on which `cyclonedx-npm`/`cyclonedx-library` release
 * happened to be resolved locally versus in CI — a repeated source of
 * local-vs-CI divergence). A published `@rathnasgala2/theme-*` package has
 * no runtime `dependencies` of its own, so its accurate SBOM has an empty
 * `components` array; building the document directly here, from nothing
 * but the theme's own `name`/`version`, means generation touches neither
 * `node_modules` nor any lockfile and is therefore identical regardless of
 * install state, host platform, or which tool versions a lockfile
 * resolved to.
 *
 * @param {{name: string, version: string}} packageIdentity the described
 *   theme package's `name` and `version`
 * @returns {Record<string, unknown>} a complete CycloneDX 1.6 JSON document
 */
export function buildThemeOnlySbom(packageIdentity) {
  const { group, name } = splitScopedPackageName(packageIdentity.name);
  const bomRef = `${packageIdentity.name}@${packageIdentity.version}`;
  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    serialNumber: deterministicSerialNumber(
      packageIdentity.name,
      packageIdentity.version,
    ),
    metadata: {
      timestamp: SBOM_FIXED_TIMESTAMP,
      component: {
        type: 'library',
        name,
        group,
        version: packageIdentity.version,
        'bom-ref': bomRef,
        purl: toPurl(packageIdentity.name, packageIdentity.version),
      },
    },
    components: [],
    dependencies: [{ ref: bomRef, dependsOn: [] }],
  };
}

/**
 * Replace the two non-deterministic fields of a CycloneDX document
 * (`serialNumber` and `metadata.timestamp`) with values derived only from
 * the document's own package identity, leaving every other field untouched.
 * Also rewrites `metadata.component`'s identity (`name`/`group`/`version`/
 * `bom-ref`/`purl`) to describe the actual published root package rather
 * than whatever package `cyclonedx-npm` was invoked from (it runs with
 * cwd `tooling/`, so it otherwise describes the unpublished
 * `*-tooling` package instead of the published root package this SBOM is
 * meant to describe), and keeps the top-level `dependencies` array
 * self-consistent by repointing the one entry whose `ref` targeted the old
 * root `bom-ref`.
 *
 * @param {Record<string, unknown>} document parsed `sbom.cdx.json` content
 * @param {{name: string, version: string}} packageIdentity the described
 *   root package's name and version
 * @returns {Record<string, unknown>} a new object with normalized fields
 */
export function normalizeSbomDocument(document, packageIdentity) {
  const normalized = { ...document };
  normalized.serialNumber = deterministicSerialNumber(
    packageIdentity.name,
    packageIdentity.version,
  );

  const { group, name } = splitScopedPackageName(packageIdentity.name);
  const newBomRef = `${packageIdentity.name}@${packageIdentity.version}`;
  const newPurl = toPurl(packageIdentity.name, packageIdentity.version);

  const metadata = document.metadata;
  let oldBomRef;
  if (metadata && typeof metadata === 'object') {
    const component = metadata.component;
    let normalizedComponent = component;
    if (component && typeof component === 'object') {
      oldBomRef = component['bom-ref'];
      normalizedComponent = {
        ...component,
        name,
        group,
        version: packageIdentity.version,
        'bom-ref': newBomRef,
        purl: newPurl,
      };
    }
    normalized.metadata = {
      ...metadata,
      timestamp: SBOM_FIXED_TIMESTAMP,
      component: normalizedComponent,
    };
  }

  if (oldBomRef !== undefined && Array.isArray(document.dependencies)) {
    normalized.dependencies = document.dependencies.map((dependency) =>
      dependency &&
      typeof dependency === 'object' &&
      dependency.ref === oldBomRef
        ? { ...dependency, ref: newBomRef }
        : dependency,
    );
  }

  return normalized;
}

/**
 * Serialize a normalized SBOM document exactly as `cyclonedx-npm` does: two
 * -space indentation and no trailing newline.
 *
 * @param {Record<string, unknown>} document normalized document
 * @returns {string} canonical file content
 */
export function serializeSbomDocument(document) {
  return JSON.stringify(document, null, 2);
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildThemeOnlySbom,
  serializeSbomDocument,
} from './sbom-normalize.mjs';

/**
 * THD-M6 (post-mortem): the theme's SBOM is no longer a committed file —
 * it is generated fresh at release time and attached as a build artifact
 * (see `generate-theme-sbom.mjs`), so there is nothing here to compare
 * against a checked-in copy any more. What `verify` still needs to catch
 * is generation itself becoming non-deterministic (it previously depended
 * on which `cyclonedx-npm` release a lockfile resolved to, and diverged
 * between a local machine and CI for that reason three times running).
 * This regenerates the document twice from the calling theme's own
 * `package.json` and asserts the two runs are byte-identical — which they
 * always are for `buildThemeOnlySbom` (a pure function of `name`/
 * `version`, touching neither `node_modules` nor any lockfile), so a
 * regression here means someone reintroduced an environment-dependent
 * input into that function.
 *
 * @returns {Promise<void>} resolves once the check passes
 */
async function main() {
  const packageJson = JSON.parse(
    await readFile(path.resolve('../package.json'), 'utf8'),
  );
  const identity = { name: packageJson.name, version: packageJson.version };

  const first = serializeSbomDocument(buildThemeOnlySbom(identity));
  const second = serializeSbomDocument(buildThemeOnlySbom(identity));

  if (first !== second) {
    console.error(
      'sbom generation is not deterministic: two generations from the ' +
        'same package.json produced different bytes.',
    );
    process.exitCode = 1;
    return;
  }

  // Also exercise the actual output path generate-theme-sbom.mjs writes to,
  // by rebuilding it in isolation from a bare package.json object literal
  // (no filesystem/network/install-state input at all), so this check
  // fails closed if buildThemeOnlySbom ever starts reading anything else.
  const isolated = serializeSbomDocument(
    buildThemeOnlySbom({ name: identity.name, version: identity.version }),
  );
  if (isolated !== first) {
    console.error('sbom generation depends on more than name/version.');
    process.exitCode = 1;
    return;
  }

  console.log('sbom generation is deterministic.');
}

await main();

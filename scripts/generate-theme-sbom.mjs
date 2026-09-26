import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildThemeOnlySbom,
  serializeSbomDocument,
} from './sbom-normalize.mjs';

/**
 * THD-M6 (post-mortem): writes a self-contained CycloneDX 1.6 SBOM
 * describing the calling theme package alone (see
 * `buildThemeOnlySbom`'s doc comment for why) — never committed, and no
 * longer attributed with the shared tooling's own dependency tree. The
 * release workflow generates this fresh at release time and uploads it as
 * a build artifact; it is not part of the packed npm payload.
 *
 * Usage (cwd is always the calling theme's `tooling/` directory, per
 * `bin/cli.mjs`'s convention): `node generate-theme-sbom.mjs [--out <path>]`.
 * `<path>` defaults to `../dist/sbom.cdx.json` (relative to the theme
 * root) when omitted.
 *
 * @returns {Promise<void>} resolves once the file is written
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outArg = outIndex === -1 ? undefined : args[outIndex + 1];
  const outputPath = outArg
    ? path.resolve(outArg)
    : path.resolve('../dist/sbom.cdx.json');

  const packageJson = JSON.parse(
    await readFile(path.resolve('../package.json'), 'utf8'),
  );
  const document = buildThemeOnlySbom({
    name: packageJson.name,
    version: packageJson.version,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeSbomDocument(document), 'utf8');
  console.log(`Wrote ${outputPath}`);
}

await main();

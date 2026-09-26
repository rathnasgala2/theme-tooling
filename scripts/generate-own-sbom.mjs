import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  normalizeSbomDocument,
  serializeSbomDocument,
} from './sbom-normalize.mjs';

/**
 * Generates `@rathnasgala2/theme-tooling`'s own committed `sbom.cdx.json`,
 * describing this package's own devDependency tree (unlike
 * `generate-theme-sbom.mjs`, which builds a theme's SBOM directly with no
 * tool invocation at all — this package's own supply chain is what that
 * design change was drawing an unwanted line from, so this file
 * legitimately still shells out to `cyclonedx-npm --package-lock-only`
 * against this package's own `package.json`/`package-lock.json`). Run from
 * this package's own root (`npm run sbom:generate` here, not from a
 * theme's `tooling/` directory).
 *
 * @returns {Promise<void>} resolves once `sbom.cdx.json` is written
 */
async function main() {
  const packageDir = path.join(import.meta.dirname, '..');
  const outputPath = path.join(packageDir, 'sbom.cdx.json');
  const result = spawnSync(
    path.join(packageDir, 'node_modules', '.bin', 'cyclonedx-npm'),
    [
      '--package-lock-only',
      '--output-file',
      outputPath,
      '--output-format',
      'JSON',
      '--spec-version',
      '1.6',
      path.join(packageDir, 'package.json'),
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  const packageJson = JSON.parse(
    await readFile(path.join(packageDir, 'package.json'), 'utf8'),
  );
  const generated = JSON.parse(await readFile(outputPath, 'utf8'));
  const normalized = normalizeSbomDocument(generated, {
    name: packageJson.name,
    version: packageJson.version,
  });
  await writeFile(outputPath, serializeSbomDocument(normalized), 'utf8');
}

await main();

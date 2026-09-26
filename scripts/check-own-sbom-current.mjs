import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  normalizeSbomDocument,
  serializeSbomDocument,
} from './sbom-normalize.mjs';

const run = promisify(execFile);

/**
 * Asserts `@rathnasgala2/theme-tooling`'s own committed `sbom.cdx.json` is
 * current: regenerates it into a scratch file from this package's own
 * `package.json`/`package-lock.json` and diffs byte-for-byte. Run from
 * this package's own root.
 *
 * @returns {Promise<void>} resolves once the check passes
 */
async function main() {
  const packageDir = path.join(import.meta.dirname, '..');
  const committedPath = path.join(packageDir, 'sbom.cdx.json');
  const committed = await readFile(committedPath, 'utf8');

  const scratchDirectory = await mkdtemp(path.join(tmpdir(), 'tooling-sbom-'));
  const scratchPath = path.join(scratchDirectory, 'sbom.cdx.json');
  try {
    await run(path.join(packageDir, 'node_modules', '.bin', 'cyclonedx-npm'), [
      '--package-lock-only',
      '--output-file',
      scratchPath,
      '--output-format',
      'JSON',
      '--spec-version',
      '1.6',
      path.join(packageDir, 'package.json'),
    ]);
    const packageJson = JSON.parse(
      await readFile(path.join(packageDir, 'package.json'), 'utf8'),
    );
    const generated = JSON.parse(await readFile(scratchPath, 'utf8'));
    const normalized = serializeSbomDocument(
      normalizeSbomDocument(generated, {
        name: packageJson.name,
        version: packageJson.version,
      }),
    );
    if (normalized !== committed) {
      console.error(
        'sbom.cdx.json is stale: regenerating it produces different bytes. ' +
          'Run `npm run sbom:generate` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log('sbom.cdx.json is current.');
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
}

await main();

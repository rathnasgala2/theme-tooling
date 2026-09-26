/**
 * THD-M6 (post-mortem): a theme's SBOM used to be `cyclonedx-npm` scanning
 * this package's own lockfile, attributed to the calling theme's identity
 * — and diverged between a local machine and CI three times running for
 * reasons never fully pinned down. `buildThemeOnlySbom` replaces that with
 * a pure function of the theme's own `name`/`version` (see its doc
 * comment in `scripts/sbom-normalize.mjs`), so this suite asserts the
 * property the old design could never guarantee: generation is identical
 * regardless of whether `node_modules` exists at all, not just identical
 * between two `npm ci`s that both happened to succeed.
 */
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import {
  buildThemeOnlySbom,
  serializeSbomDocument,
} from '../scripts/sbom-normalize.mjs';

const run = promisify(execFile);
const PACKAGE_DIR = path.join(import.meta.dirname, '..');
const GENERATOR = path.join(PACKAGE_DIR, 'scripts', 'generate-theme-sbom.mjs');

test('buildThemeOnlySbom is a pure function of name/version: two calls are byte-identical', () => {
  const identity = { name: '@rathnasgala2/theme-default', version: '2.1.0' };
  const first = serializeSbomDocument(buildThemeOnlySbom(identity));
  const second = serializeSbomDocument(buildThemeOnlySbom(identity));
  assert.equal(first, second);
});

test('buildThemeOnlySbom describes the theme alone: zero dependency components', () => {
  const document = buildThemeOnlySbom({
    name: '@rathnasgala2/theme-default',
    version: '2.1.0',
  });
  assert.deepEqual(document.components, []);
  assert.equal(document.metadata.component.name, 'theme-default');
  assert.equal(document.metadata.component.group, '@rathnasgala2');
});

test('generate-theme-sbom.mjs imports nothing but node builtins and its own relative sibling (no node_modules dependency at all)', async () => {
  const source = await readFile(GENERATOR, 'utf8');
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map(
    (match) => match[1],
  );
  assert.ok(specifiers.length > 0, 'expected at least one import');
  for (const specifier of specifiers) {
    assert.ok(
      specifier.startsWith('node:') || specifier.startsWith('./'),
      `${specifier} is neither a node builtin nor a relative sibling import ` +
        '— it would require node_modules to resolve, which generate-theme-sbom.mjs must not depend on',
    );
  }
});

test('generate-theme-sbom.mjs produces byte-identical output run twice in a row, run against a bare package.json with no node_modules anywhere nearby', async () => {
  // Fake a theme checkout in an isolated scratch directory (no
  // node_modules directory exists anywhere under it): a root package.json
  // plus a tooling/ directory, matching bin/cli.mjs's convention that
  // every script runs with cwd set to the calling theme's tooling/
  // directory.
  const themeRoot = await mkdtemp(path.join(tmpdir(), 'theme-sbom-e2e-'));
  const toolingDir = path.join(themeRoot, 'tooling');
  await mkdir(toolingDir, { recursive: true });
  await writeFile(
    path.join(themeRoot, 'package.json'),
    JSON.stringify({ name: '@rathnasgala2/theme-default', version: '2.1.0' }),
    'utf8',
  );

  const outA = path.join(themeRoot, 'dist-a', 'sbom.cdx.json');
  const outB = path.join(themeRoot, 'dist-b', 'sbom.cdx.json');
  await run(process.execPath, [GENERATOR, '--out', outA], { cwd: toolingDir });
  await run(process.execPath, [GENERATOR, '--out', outB], { cwd: toolingDir });

  const [bytesA, bytesB] = await Promise.all([
    readFile(outA, 'utf8'),
    readFile(outB, 'utf8'),
  ]);
  assert.equal(bytesA, bytesB);

  await rm(themeRoot, { recursive: true, force: true });
});

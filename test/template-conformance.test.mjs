/**
 * Task packet S2-T13 conformance test: render
 * `@rathnasgala2/template`'s build with `options.themeDirectory` pointing
 * at this package (this repository's own root — the exact same shape
 * `publish-kernel`/`publish-action` will resolve an extracted theme
 * package directory to, per README "Consuming the template by path"), and
 * assert the styled output is byte-identical across two independent
 * builds of the same pinned inputs (S2 brief §3 "Determinism": "Two clean
 * builds of identical pinned inputs must produce byte-identical route and
 * asset files").
 */

import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

import { resolveTemplateDir } from '../scripts/resolve-template-dir.mjs';
import { resolveThemeRoot } from '../scripts/resolve-theme-root.mjs';
import { buildFixture } from './fixtures/rich-build-input.mjs';
import { testProvenance } from './fixtures/test-provenance.mjs';

// `@rathnasgala2/template` is consumed *by path*, not as an npm
// dependency (independent-review finding on S2-T13). See
// `resolve-template-dir.mjs` and README "Consuming the template by path".
const { renderPublication } = await import(
  pathToFileURL(path.join(resolveTemplateDir(), 'src', 'core', 'index.js')).href
);

// The theme under test, identified by process.cwd() (this package is
// shared across five theme repositories; see bin/cli.mjs), not by this
// test file's own location.
const THEME_DIRECTORY = resolveThemeRoot();

/**
 * @returns {Promise<{outputDirectory: string, workDirectory: string, sourceDirectory: string, cleanup: () => Promise<void>}>}
 *   a fresh, empty output/work/source directory triple
 */
async function createRenderDirectories() {
  const root = await mkdtemp(path.join(tmpdir(), 'theme-default-conformance-'));
  const outputDirectory = path.join(root, 'output');
  const workDirectory = path.join(root, 'work');
  const sourceDirectory = path.join(root, 'source');
  await mkdir(sourceDirectory, { recursive: true });
  return {
    outputDirectory,
    workDirectory,
    sourceDirectory,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * @param {string} directory absolute directory
 * @returns {Promise<string[]>} every regular file path under it, relative
 *   to `directory`, sorted
 */
async function listFilesSorted(directory) {
  /** @type {string[]} */
  const results = [];
  /**
   * @param {string} current absolute directory being walked
   * @param {string} relative its path relative to `directory`
   * @returns {Promise<void>} resolves once fully walked
   */
  async function walk(current, relative) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), relativePath);
      } else if (entry.isFile()) {
        results.push(relativePath);
      }
    }
  }
  await walk(directory, '');
  return results.sort();
}

test('renderPublication with options.themeDirectory pointing at this package renders successfully and links the theme stylesheets', async () => {
  const buildInput = await buildFixture();
  const { outputDirectory, workDirectory, sourceDirectory, cleanup } =
    await createRenderDirectories();
  try {
    const { manifest } = await renderPublication(buildInput, {
      outputDirectory,
      workDirectory,
      sourceDirectory,
      themeDirectory: THEME_DIRECTORY,
      provenance: testProvenance(),
    });
    for (const stylesheet of ['tokens.css', 'components.css', 'print.css']) {
      assert.ok(
        manifest.assets.some((asset) =>
          asset.path.endsWith(`assets/theme/${stylesheet}`),
        ),
        `manifest must record a theme asset row for ${stylesheet}`,
      );
    }
    const htmlRoute = manifest.routes.find(
      (route) => route.routeClass === 'html',
    );
    assert.ok(htmlRoute, 'the render must produce at least one html route');
    const html = await readFile(
      path.join(outputDirectory, htmlRoute.path),
      'utf8',
    );
    assert.ok(html.includes('assets/theme/tokens.css'));
    assert.ok(html.includes('assets/theme/components.css'));
    assert.ok(html.includes('assets/theme/print.css'));
  } finally {
    await cleanup();
  }
});

test('two independent builds of the same pinned inputs against this theme are byte-identical (determinism)', async () => {
  const buildInputA = await buildFixture();
  const buildInputB = await buildFixture();
  const first = await createRenderDirectories();
  const second = await createRenderDirectories();
  try {
    const [{ manifest: manifestA }, { manifest: manifestB }] =
      await Promise.all([
        renderPublication(buildInputA, {
          outputDirectory: first.outputDirectory,
          workDirectory: first.workDirectory,
          sourceDirectory: first.sourceDirectory,
          themeDirectory: THEME_DIRECTORY,
          provenance: testProvenance(),
        }),
        renderPublication(buildInputB, {
          outputDirectory: second.outputDirectory,
          workDirectory: second.workDirectory,
          sourceDirectory: second.sourceDirectory,
          themeDirectory: THEME_DIRECTORY,
          provenance: testProvenance(),
        }),
      ]);

    const filesA = await listFilesSorted(first.outputDirectory);
    const filesB = await listFilesSorted(second.outputDirectory);
    assert.deepEqual(
      filesA,
      filesB,
      'both builds must produce the exact same file list',
    );

    for (const relativePath of filesA) {
      const bytesA = await readFile(
        path.join(first.outputDirectory, relativePath),
      );
      const bytesB = await readFile(
        path.join(second.outputDirectory, relativePath),
      );
      assert.ok(
        bytesA.equals(bytesB),
        `${relativePath} must be byte-identical across both builds`,
      );
    }

    assert.equal(
      manifestA.assets.length,
      manifestB.assets.length,
      'both manifests must record the same number of assets',
    );
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

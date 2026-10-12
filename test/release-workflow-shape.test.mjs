/**
 * Workflow shape gates across all six generation-4 theme repositories. None
 * of these properties can be checked by a Node conformance script run *inside*
 * one theme's own `verify`, since the defect is in the workflow YAML itself.
 * The registry-Template gate reads all three workflows; the publish and
 * artifact gates read each sibling theme's `.github/workflows/release.yaml` directly
 * off disk and assert on its text/step order, as THD-H2/H4/H5/H6 require.
 *
 * `WORKSPACE_ROOT` is either the current repository root in GitHub Actions or
 * the directory containing every theme in the local multi-repository
 * workspace. A basename match distinguishes those two cases. The current
 * repository is required; only an explicitly absent sibling repository may
 * skip, and only an `ENOENT` read is treated as absence.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const THEME_NAMES = [
  'theme-default',
  'theme-minimal',
  'theme-amaze',
  'theme-flashy',
  'theme-zebra',
  'theme-editorial',
];

const WORKFLOW_NAMES = ['ci.yml', 'nightly.yml', 'release.yaml'];

const DEFAULT_WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * @param {string} themeName
 * @param {string} [workspaceRoot]
 * @returns {string} the resolved theme repository directory
 */
function themeDirectory(
  themeName,
  workspaceRoot = process.env.WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT,
) {
  return path.basename(path.resolve(workspaceRoot)) === themeName
    ? path.resolve(workspaceRoot)
    : path.join(workspaceRoot, themeName);
}

/**
 * @param {string} themeName
 * @param {string} [workflowName]
 * @param {string} [workspaceRoot]
 * @returns {string} the resolved workflow path (existence is not guaranteed)
 */
function workflowPath(
  themeName,
  workflowName = 'release.yaml',
  workspaceRoot = process.env.WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT,
) {
  return path.join(
    themeDirectory(themeName, workspaceRoot),
    '.github',
    'workflows',
    workflowName,
  );
}

/**
 * @param {string} themeName
 * @param {string} workflowName
 * @param {(path: string, encoding: string) => Promise<string>} [reader]
 * @param {string} [workspaceRoot]
 * @returns {Promise<[string, string | undefined]>}
 */
async function readOptionalSiblingWorkflow(
  themeName,
  workflowName,
  reader = readFile,
  workspaceRoot = process.env.WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT,
) {
  const filePath = workflowPath(themeName, workflowName, workspaceRoot);
  const isCurrentTheme =
    path.resolve(themeDirectory(themeName, workspaceRoot)) ===
    path.resolve(workspaceRoot);
  try {
    return [filePath, await reader(filePath, 'utf8')];
  } catch (error) {
    if (!isCurrentTheme && error?.code === 'ENOENT') {
      return [filePath, undefined];
    }
    throw error;
  }
}

test('workflow paths resolve the current remote theme repository directly', () => {
  assert.equal(
    workflowPath('theme-default', 'ci.yml', '/runner/theme-default'),
    path.join('/runner/theme-default', '.github', 'workflows', 'ci.yml'),
  );
});

test('workflow paths preserve local multi-repository coverage', () => {
  assert.equal(
    workflowPath('theme-default', 'ci.yml', '/workspace/v2'),
    path.join(
      '/workspace/v2',
      'theme-default',
      '.github',
      'workflows',
      'ci.yml',
    ),
  );
});

test('workflow reads rethrow non-ENOENT errors', async () => {
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  await assert.rejects(
    readOptionalSiblingWorkflow(
      'theme-default',
      'ci.yml',
      async () => Promise.reject(denied),
      '/workspace/v2',
    ),
    denied,
  );
});

test('current theme workflow absence fails instead of skipping', async () => {
  const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
  await assert.rejects(
    readOptionalSiblingWorkflow(
      'theme-default',
      'ci.yml',
      async () => Promise.reject(missing),
      '/runner/theme-default',
    ),
    missing,
  );
});

for (const themeName of THEME_NAMES) {
  test(`${themeName}: workflows use the registry Template installed by theme-tooling`, async (t) => {
    const workflows = await Promise.all(
      WORKFLOW_NAMES.map((workflowName) =>
        readOptionalSiblingWorkflow(themeName, workflowName),
      ),
    );
    const presentWorkflows = workflows.filter(([, yaml]) => yaml !== undefined);
    if (presentWorkflows.length === 0) {
      t.skip(`${workflows[0][0]} not present on disk`);
      return;
    }
    assert.equal(
      presentWorkflows.length,
      WORKFLOW_NAMES.length,
      `${themeName} has a partial workflow set: ${workflows
        .filter(([, yaml]) => yaml === undefined)
        .map(([filePath]) => filePath)
        .join(', ')} missing`,
    );

    for (const [filePath, yaml] of presentWorkflows) {
      assert.doesNotMatch(
        yaml,
        /^\s*repository:\s*rathnasgala2\/template\s*$/mu,
        `${filePath} must not check out a Template sibling`,
      );
      assert.doesNotMatch(
        yaml,
        /^\s*GALA_TEMPLATE_DIR\s*:/mu,
        `${filePath} must not override the registry Template`,
      );
      assert.doesNotMatch(
        yaml,
        /^\s*working-directory:\s*template\s*$/mu,
        `${filePath} must not install a Template sibling`,
      );
    }
  });

  test(`${themeName}/.github/workflows/release.yaml: carries the npm publish job (environment npm, OIDC, provenance)`, async (t) => {
    const [filePath, yaml] = await readOptionalSiblingWorkflow(
      themeName,
      'release.yaml',
    );
    if (yaml === undefined) {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    assert.match(
      yaml,
      /^\s*environment:\s*npm\s*$/mu,
      'expected environment: npm',
    );
    assert.match(
      yaml,
      /^\s*id-token:\s*write\s*$/mu,
      'expected id-token: write',
    );
    assert.match(
      yaml,
      /^\s*registry-url:\s*https:\/\/registry\.npmjs\.org\s*$/mu,
      'expected registry-url for setup-node',
    );
    assert.match(
      yaml,
      /npm publish --access public --provenance(?!\s+--dry-run)/u,
      'expected a real `npm publish --access public --provenance` step',
    );
    assert.match(
      yaml,
      /npm publish --access public --provenance --dry-run/u,
      'expected a provenance dry run before publishing (THD-H6)',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: fails if the version is already published, before verify (THD-H5)`, async (t) => {
    const [filePath, yaml] = await readOptionalSiblingWorkflow(
      themeName,
      'release.yaml',
    );
    if (yaml === undefined) {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const viewIndex = yaml.indexOf('npm view ');
    const verifyIndex = yaml.indexOf('npm run verify');
    const publishIndex = yaml.lastIndexOf('npm publish --access public');
    assert.notEqual(
      viewIndex,
      -1,
      'expected an `npm view` already-published check',
    );
    assert.match(
      yaml,
      /already published/u,
      'expected the already-published error',
    );
    assert.ok(
      viewIndex < verifyIndex && verifyIndex < publishIndex,
      'expected order: npm view check, npm run verify, npm publish',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: git diff --exit-code runs after verify and before npm pack and publish (THD-H4)`, async (t) => {
    const [filePath, yaml] = await readOptionalSiblingWorkflow(
      themeName,
      'release.yaml',
    );
    if (yaml === undefined) {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const verifyIndex = yaml.indexOf('npm run verify');
    const diffIndex = yaml.indexOf('git diff --exit-code');
    const packIndex = yaml.indexOf('npm pack');
    const publishIndex = yaml.lastIndexOf('npm publish --access public');
    assert.notEqual(verifyIndex, -1, 'expected a "npm run verify" step');
    assert.notEqual(diffIndex, -1, 'expected a "git diff --exit-code" step');
    assert.notEqual(packIndex, -1, 'expected an "npm pack" step');
    assert.ok(
      verifyIndex < diffIndex &&
        diffIndex < packIndex &&
        diffIndex < publishIndex,
      'expected order: npm run verify, then git diff --exit-code, then npm pack and npm publish',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: builds and uploads a package artifact before publishing`, async (t) => {
    const [filePath, yaml] = await readOptionalSiblingWorkflow(
      themeName,
      'release.yaml',
    );
    if (yaml === undefined) {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const packIndex = yaml.indexOf('npm pack --pack-destination dist');
    const packageUploadIndex = yaml.indexOf('path: dist/*.tgz');
    assert.notEqual(
      packIndex,
      -1,
      'expected npm pack to write the reviewed artifact into dist',
    );
    assert.ok(
      packIndex < packageUploadIndex,
      'the package must be built before its artifact upload declaration',
    );
    assert.ok(
      packageUploadIndex < yaml.lastIndexOf('npm publish --access public'),
      'the reviewed artifact must be uploaded before the publish step',
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: no step mutates package.json`, async (t) => {
    const [filePath, yaml] = await readOptionalSiblingWorkflow(
      themeName,
      'release.yaml',
    );
    if (yaml === undefined) {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    assert.doesNotMatch(
      yaml,
      /npm version|npm pkg set|sed -i[^\n]*package\.json/,
      "the release job must publish the reviewed commit's package.json unchanged",
    );
  });

  test(`${themeName}/.github/workflows/release.yaml: generates and uploads the release SBOM (THD-M6)`, async (t) => {
    const [filePath, yaml] = await readOptionalSiblingWorkflow(
      themeName,
      'release.yaml',
    );
    if (yaml === undefined) {
      t.skip(`${filePath} not present on disk`);
      return;
    }
    const generateIndex = yaml.indexOf('sbom:generate');
    const uploadIndex = yaml.indexOf('actions/upload-artifact@');
    assert.notEqual(
      generateIndex,
      -1,
      'expected a step running `npm run sbom:generate` (or `-- --out ...`)',
    );
    assert.notEqual(
      uploadIndex,
      -1,
      'expected an `actions/upload-artifact` step (pinned by commit SHA)',
    );
    assert.ok(
      generateIndex < uploadIndex,
      'the SBOM must be generated before it is uploaded',
    );
    assert.match(
      yaml,
      /actions\/upload-artifact@[0-9a-f]{40}/,
      'actions/upload-artifact must be pinned to a full commit SHA, like every other action here',
    );
    assert.match(
      yaml,
      /sbom\.cdx\.json/,
      'the uploaded artifact must reference sbom.cdx.json',
    );
  });
}

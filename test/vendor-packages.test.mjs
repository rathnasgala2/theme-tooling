import { strict as assert } from 'node:assert';
import { appendFile, cp, mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  EXPECTED_PACKAGES,
  verifyVendoredPackages,
} from '../scripts/check-vendored-packages.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

async function withVendorCopy(assertion) {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'theme-tooling-vendor-'),
  );
  const vendorDirectory = path.join(temporaryDirectory, 'vendor');
  try {
    await cp(path.join(ROOT, 'vendor'), vendorDirectory, { recursive: true });
    await assertion(vendorDirectory);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test('the complete authoritative source-only package set verifies', () => {
  verifyVendoredPackages();
});

test('verification fails closed when a generation-4 theme is missing', async () => {
  await withVendorCopy(async (vendorDirectory) => {
    const theme = EXPECTED_PACKAGES.at(-1);
    assert.ok(theme);
    await unlink(
      path.join(
        vendorDirectory,
        `rathnasgala2-${theme.name.split('/')[1]}-${theme.version}.tgz`,
      ),
    );
    assert.throws(
      () => verifyVendoredPackages({ vendorDirectory }),
      /vendored tarball is missing/u,
    );
  });
});

test('verification fails closed when authoritative archive bytes change', async () => {
  await withVendorCopy(async (vendorDirectory) => {
    const schema = EXPECTED_PACKAGES[0];
    assert.ok(schema);
    await appendFile(
      path.join(vendorDirectory, 'rathnasgala2-schemas-3.8.0.tgz'),
      Buffer.from([0]),
    );
    assert.throws(
      () => verifyVendoredPackages({ vendorDirectory }),
      /does not match authoritative/u,
    );
  });
});

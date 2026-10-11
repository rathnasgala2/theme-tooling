#!/usr/bin/env node
/**
 * Fail-closed integrity gate for the unpublished generation-4 package set.
 * It intentionally uses only Node built-ins so CI can execute it before
 * `npm ci`, without a registry request or a sibling repository checkout.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_ENTRY_KEYS = ['name', 'version', 'file', 'bytes', 'sha256'];

export const EXPECTED_PACKAGES = Object.freeze([
  Object.freeze({
    name: '@rathnasgala2/schemas',
    version: '3.8.0',
    sha256: 'c00e94ae04e7d8eab02c5a344dd569e81a35f8674dc92b0e5911907afda592e3',
    requiredFiles: [
      'package/package.json',
      'package/LICENSE',
      'package/NOTICE',
      'package/schemas/theme-contract.schema.json',
      'package/schemas/template-composition.schema.json',
      'package/src/index.js',
    ],
  }),
  Object.freeze({
    name: '@rathnasgala2/template',
    version: '4.0.0',
    sha256: '25a3c761a56316cf2143aa53d7be46be892ff505a636d91f9b3aa6eaced8b7fa',
    requiredFiles: [
      'package/package.json',
      'package/LICENSE',
      'package/contracts/theme-styling-contract.jcs',
      'package/src/core/index.js',
    ],
  }),
  ...[
    [
      'amaze',
      'fd9991ca98c3e6be3ae7967a09a989b63c0a20a34eb7fe1d1eb4dd620b179ccb',
    ],
    [
      'default',
      '1d648d8b6cfefd22afdf47a46a0bb1260a7afa1d13990d95329e0230fab176a5',
    ],
    [
      'editorial',
      'e3d466a6e579406289a6916e3891b8575119c0cc3a3271dacbf12bbe066b3c5a',
    ],
    [
      'flashy',
      '8cc1927c55d91bed5a512abc7f2173505c51757910f8c87fa57900f486010a91',
    ],
    [
      'minimal',
      '19d66ef77b5f4f65d8c5a9d657c8d80fae3638b2f6c50e26f8052a68d9eff791',
    ],
    [
      'zebra',
      '212b259a7cfd9dbd23c298eb4ac1ee59956904ca85013284048996fb05109be8',
    ],
  ].map(([theme, sha256]) =>
    Object.freeze({
      name: `@rathnasgala2/theme-${theme}`,
      version: '4.0.0',
      sha256,
      requiredFiles: [
        'package/package.json',
        'package/LICENSE',
        'package/README.md',
        'package/components.css',
        'package/print.css',
        'package/theme.json',
        'package/tokens.css',
      ],
    }),
  ),
]);

function readJson(filePath, label, diagnostics) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    diagnostics.push(`${label}: ${error.message}`);
    return undefined;
  }
}

function hash(algorithm, content, encoding) {
  return createHash(algorithm).update(content).digest(encoding);
}

function readTarString(header, offset, length) {
  const field = header.subarray(offset, offset + length);
  const nul = field.indexOf(0);
  return field.subarray(0, nul === -1 ? field.length : nul).toString('utf8');
}

function readTarEntries(archive, label, diagnostics) {
  let tar;
  try {
    tar = gunzipSync(archive);
  } catch (error) {
    diagnostics.push(`${label}: invalid gzip archive (${error.message})`);
    return new Map();
  }

  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(
      readTarString(header, 124, 12).trim() || '0',
      8,
    );
    if (!Number.isSafeInteger(size) || size < 0) {
      diagnostics.push(`${label}: invalid tar entry size for ${entryPath}`);
      break;
    }

    offset += 512;
    if (offset + size > tar.length) {
      diagnostics.push(`${label}: truncated tar entry ${entryPath}`);
      break;
    }
    if (entries.has(entryPath)) {
      diagnostics.push(`${label}: duplicate tar entry ${entryPath}`);
    } else {
      entries.set(entryPath, tar.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

function validateEntry(
  entry,
  expected,
  packageJson,
  lock,
  vendorDirectory,
  diagnostics,
) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    diagnostics.push(
      `${expected.name}: vendor manifest entry is missing or invalid`,
    );
    return;
  }
  if (
    JSON.stringify(Object.keys(entry)) !== JSON.stringify(MANIFEST_ENTRY_KEYS)
  ) {
    diagnostics.push(
      `${expected.name}: vendor manifest keys must be exactly ${MANIFEST_ENTRY_KEYS.join(', ')}`,
    );
  }
  if (entry.name !== expected.name || entry.version !== expected.version) {
    diagnostics.push(
      `${expected.name}: expected ${expected.name}@${expected.version}, found ${entry.name}@${entry.version}`,
    );
  }
  if (entry.sha256 !== expected.sha256) {
    diagnostics.push(
      `${expected.name}: manifest SHA-256 ${entry.sha256} does not match authoritative ${expected.sha256}`,
    );
  }
  if (
    typeof entry.file !== 'string' ||
    path.basename(entry.file) !== entry.file ||
    !entry.file.endsWith('.tgz')
  ) {
    diagnostics.push(
      `${expected.name}: invalid vendor archive name ${entry.file}`,
    );
    return;
  }

  const specifier = `file:vendor/${entry.file}`;
  if (packageJson?.devDependencies?.[expected.name] !== specifier) {
    diagnostics.push(
      `package.json: devDependencies.${expected.name} must be ${specifier}`,
    );
  }
  if (lock?.packages?.['']?.devDependencies?.[expected.name] !== specifier) {
    diagnostics.push(
      `package-lock.json: root devDependencies.${expected.name} must be ${specifier}`,
    );
  }

  const archivePath = path.join(vendorDirectory, entry.file);
  let archive;
  try {
    archive = readFileSync(archivePath);
  } catch (error) {
    diagnostics.push(
      `${entry.file}: vendored tarball is missing (${error.message})`,
    );
    return;
  }
  if (archive.length !== entry.bytes) {
    diagnostics.push(
      `${entry.file}: byte length ${archive.length} does not match manifest ${entry.bytes}`,
    );
  }
  const sha256 = hash('sha256', archive, 'hex');
  if (sha256 !== expected.sha256) {
    diagnostics.push(
      `${entry.file}: SHA-256 ${sha256} does not match authoritative ${expected.sha256}`,
    );
  }

  const entries = readTarEntries(archive, entry.file, diagnostics);
  for (const requiredFile of expected.requiredFiles) {
    if (!entries.has(requiredFile)) {
      diagnostics.push(
        `${entry.file}: required archive entry ${requiredFile} is missing`,
      );
    }
  }
  const packedPackageJson = entries.get('package/package.json');
  if (packedPackageJson) {
    try {
      const packedManifest = JSON.parse(packedPackageJson.toString('utf8'));
      if (
        packedManifest.name !== expected.name ||
        packedManifest.version !== expected.version
      ) {
        diagnostics.push(
          `${entry.file}: contains ${packedManifest.name}@${packedManifest.version}, expected ${expected.name}@${expected.version}`,
        );
      }
    } catch (error) {
      diagnostics.push(
        `${entry.file}: invalid package/package.json (${error.message})`,
      );
    }
  }

  const lockEntry = lock?.packages?.[`node_modules/${expected.name}`];
  if (
    lockEntry?.version !== expected.version ||
    lockEntry?.resolved !== specifier ||
    lockEntry?.integrity !== `sha512-${hash('sha512', archive, 'base64')}`
  ) {
    diagnostics.push(
      `package-lock.json: node_modules/${expected.name} is not bound to ${specifier} with matching version and SHA-512 integrity`,
    );
  }
}

/**
 * @param {{root?: string, vendorDirectory?: string}} [options] isolated paths
 * @returns {void} throws unless the complete authoritative set is present
 */
export function verifyVendoredPackages(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const vendorDirectory = path.resolve(
    options.vendorDirectory ?? path.join(root, 'vendor'),
  );
  const diagnostics = [];
  const manifest = readJson(
    path.join(vendorDirectory, 'manifest.json'),
    'vendor/manifest.json',
    diagnostics,
  );
  const packageJson = readJson(
    path.join(root, 'package.json'),
    'package.json',
    diagnostics,
  );
  const lock = readJson(
    path.join(root, 'package-lock.json'),
    'package-lock.json',
    diagnostics,
  );

  if (
    !manifest ||
    JSON.stringify(Object.keys(manifest)) !==
      JSON.stringify(['schemaVersion', 'packages']) ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.packages)
  ) {
    diagnostics.push(
      'vendor/manifest.json: expected exactly schemaVersion 1 and a packages array',
    );
  } else {
    if (manifest.packages.length !== EXPECTED_PACKAGES.length) {
      diagnostics.push(
        `vendor/manifest.json: expected ${EXPECTED_PACKAGES.length} packages, found ${manifest.packages.length}`,
      );
    }
    for (const [index, expected] of EXPECTED_PACKAGES.entries()) {
      validateEntry(
        manifest.packages[index],
        expected,
        packageJson,
        lock,
        vendorDirectory,
        diagnostics,
      );
    }

    const declaredFiles = manifest.packages
      .map((entry) => entry?.file)
      .filter((file) => typeof file === 'string')
      .sort();
    let actualFiles = [];
    try {
      actualFiles = readdirSync(vendorDirectory)
        .filter((file) => file.endsWith('.tgz'))
        .sort();
    } catch (error) {
      diagnostics.push(`vendor: ${error.message}`);
    }
    if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
      diagnostics.push(
        `vendor: archive set differs from manifest (actual: ${actualFiles.join(', ')}; declared: ${declaredFiles.join(', ')})`,
      );
    }
  }

  const metadata = JSON.stringify({ packageJson, lock });
  for (const forbidden of [
    'file:../schema',
    'file:../template',
    'file:../theme-',
    'local-packages/',
  ]) {
    if (metadata.includes(forbidden)) {
      diagnostics.push(
        `package metadata contains forbidden source reference: ${forbidden}`,
      );
    }
  }

  if (diagnostics.length > 0) {
    throw new Error(
      `Vendored package integrity check failed:\n${diagnostics.join('\n')}`,
    );
  }
}

function isMain() {
  return (
    process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

if (isMain()) {
  verifyVendoredPackages();
  console.log(
    `vendored packages: ${EXPECTED_PACKAGES.length} authoritative archives verified against manifest, package.json, and package-lock.json`,
  );
}

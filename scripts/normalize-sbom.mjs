import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  normalizeSbomDocument,
  serializeSbomDocument,
} from './sbom-normalize.mjs';

const SBOM_PATH = path.resolve('../sbom.cdx.json');
const PACKAGE_JSON_PATH = path.resolve('../package.json');

async function main() {
  const [sbomText, packageJsonText] = await Promise.all([
    readFile(SBOM_PATH, 'utf8'),
    readFile(PACKAGE_JSON_PATH, 'utf8'),
  ]);
  const document = JSON.parse(sbomText);
  const packageJson = JSON.parse(packageJsonText);
  const normalized = normalizeSbomDocument(document, {
    name: packageJson.name,
    version: packageJson.version,
  });
  await writeFile(SBOM_PATH, serializeSbomDocument(normalized), 'utf8');
}

await main();

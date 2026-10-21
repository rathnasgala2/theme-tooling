import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { validateGalaDocument as validateContract3Document } from '@rathnasgala2/schemas';

import { resolveSchemaDir } from './resolve-schema-dir.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';

const THEME_SCHEMA_ID = 'urn:gala:schema:theme-contract:2.0.0';

/** Generation-4 contract versions this check admits (4.1.0 needs template 4.4.0). */
const CONTRACT_4_VERSIONS = ['4.0.0', '4.1.0'];

/**
 * Contract 4 (4.0.0 and 4.1.0) is validated by the resolved Schema package
 * (the exact installed registry version, or `GALA_SCHEMA_DIR` while developing
 * Schema). Import its public entry point rather than reaching into generated
 * validator internals or weakening contract-3's archived registry pin.
 *
 * @returns {Promise<typeof validateContract3Document>} contract-4 validator
 */
async function loadContract4Validator() {
  const entry = path.join(resolveSchemaDir(), 'src', 'index.js');
  const module = await import(pathToFileURL(entry).href);
  if (typeof module.validateGalaDocument !== 'function') {
    throw new TypeError(
      `schema checkout ${entry} does not export validateGalaDocument`,
    );
  }
  return module.validateGalaDocument;
}

async function main() {
  const theme = JSON.parse(
    await readFile(path.join(resolveThemeRoot(), 'theme.json'), 'utf8'),
  );
  const contractVersion = String(theme.contractVersion);
  let schemaId;
  let validateGalaDocument;
  if (/^3\./u.test(contractVersion)) {
    schemaId = THEME_SCHEMA_ID;
    validateGalaDocument = validateContract3Document;
  } else if (CONTRACT_4_VERSIONS.includes(contractVersion)) {
    schemaId = THEME_SCHEMA_ID;
    validateGalaDocument = await loadContract4Validator();
  } else {
    console.error(
      `theme.json declares unsupported contractVersion "${theme.contractVersion}"; supported versions are 3.x, 4.0.0 and 4.1.0.`,
    );
    process.exitCode = 1;
    return;
  }
  const result = validateGalaDocument(schemaId, theme);
  if (!result.valid) {
    console.error(`theme.json failed ${schemaId} validation:`);
    for (const diagnostic of result.diagnostics) {
      console.error(`  ${diagnostic.code} at ${diagnostic.instancePointer}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`theme.json is a valid ${schemaId} document.`);
}

await main();

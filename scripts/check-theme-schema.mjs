import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateGalaDocument } from '@rathnasgala2/schemas';

import { resolveThemeRoot } from './resolve-theme-root.mjs';

async function main() {
  const theme = JSON.parse(
    await readFile(path.join(resolveThemeRoot(), 'theme.json'), 'utf8'),
  );
  const result = validateGalaDocument(
    'urn:gala:schema:theme-contract:2.0.0',
    theme,
  );
  if (!result.valid) {
    console.error('theme.json failed theme-contract:2.0.0 validation:');
    for (const diagnostic of result.diagnostics) {
      console.error(`  ${diagnostic.code} at ${diagnostic.instancePointer}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    'theme.json is a valid urn:gala:schema:theme-contract:2.0.0 document.',
  );
}

await main();

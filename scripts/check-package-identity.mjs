import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveThemeRoot } from './resolve-theme-root.mjs';
import { runIfMain } from './run-if-main.mjs';

/**
 * Pure check: does `theme.json.package` name the exact identity
 * `package.json` declares? Kept separate from `check-theme-schema.mjs`
 * deliberately — that script's bytes are one of `LOCAL_RUNNERS`'
 * `executableDigest` inputs (`generate-theme-digests.mjs`), so every
 * theme would need a `digest:generate` re-run the moment this file
 * changed; this check has nothing to do with the theme-contract schema
 * itself (a syntactically valid `theme.json` can still name the wrong
 * package/version), so it does not belong there anyway.
 *
 * @param {{name: string, version: string}} packageJson parsed `package.json`
 * @param {{package?: unknown}} theme parsed `theme.json`
 * @returns {{ok: true} | {ok: false, message: string}} the check's verdict
 */
export function checkPackageIdentity(packageJson, theme) {
  const expected = `${packageJson.name}@${packageJson.version}`;
  if (theme.package === expected) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `theme.json's "package" field is "${theme.package}", but package.json ` +
      `declares ${expected}. A consumer resolving this theme's identity from ` +
      'theme.json (rather than package.json) would throw ' +
      'THEME_CONTRACT_IDENTITY_MISMATCH. Run `npm run digest:generate` after ' +
      'fixing theme.json\'s "package" field to commit a theme.json whose ' +
      'integrity/evidence digests match.',
  };
}

async function main() {
  const themeRoot = resolveThemeRoot();
  const [packageJson, theme] = await Promise.all([
    readFile(path.join(themeRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(themeRoot, 'theme.json'), 'utf8').then(JSON.parse),
  ]);
  const result = checkPackageIdentity(packageJson, theme);
  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  console.log(
    `theme.json's "package" field matches package.json: ${packageJson.name}@${packageJson.version}.`,
  );
}

await runIfMain(import.meta.url, main);

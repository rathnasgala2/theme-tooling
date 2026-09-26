/**
 * Enforce `theme.json.budgets` against the theme's own real *declared
 * assets* (THD-M3): the ceilings were declared as part of the contract
 * and never checked on either side. Scoped to `theme.json.assets` (the
 * stylesheets), matching the numbers in the 2026-09-25 review
 * ("largest file 8,664 bytes ... largest total 12,081 bytes",
 * "`maximumFiles: 8` leaves room for five more" against three declared
 * assets) — the closed-package README/LICENSE/`package.json` are
 * documentation and license evidence, not themed assets, and are already
 * bounded separately by `package:check`'s closed file set. This is the
 * theme-side half; the template-side half is TPL-H1/TPL-C2, out of scope
 * here.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveThemeRoot } from './resolve-theme-root.mjs';

async function main() {
  const themeRoot = resolveThemeRoot();
  const theme = JSON.parse(
    await readFile(path.join(themeRoot, 'theme.json'), 'utf8'),
  );
  const budgets = theme.budgets;
  const assets = theme.assets;
  if (!budgets || !Array.isArray(assets)) {
    console.error('theme.json has no "budgets" or no "assets" to enforce');
    process.exitCode = 1;
    return;
  }
  const maximumFileBytes = Number(budgets.maximumFileBytes);
  const maximumTotalBytes = Number(budgets.maximumTotalBytes);
  const maximumFiles = Number(budgets.maximumFiles);

  let failed = false;
  let totalBytes = 0;

  for (const asset of assets) {
    const size = Number(asset.byteLength);
    totalBytes += size;
    if (size > maximumFileBytes) {
      console.error(
        `${asset.path} is ${size} bytes, exceeding maximumFileBytes (${maximumFileBytes})`,
      );
      failed = true;
    }
  }
  if (assets.length > maximumFiles) {
    console.error(
      `${assets.length} declared assets exceeds maximumFiles (${maximumFiles})`,
    );
    failed = true;
  }
  if (totalBytes > maximumTotalBytes) {
    console.error(
      `total declared asset size ${totalBytes} bytes exceeds maximumTotalBytes (${maximumTotalBytes})`,
    );
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `within budgets: ${assets.length}/${maximumFiles} assets, ${totalBytes}/${maximumTotalBytes} total bytes.`,
  );
}

await main();

/**
 * Absence runner: no JavaScript/TypeScript/executable/remote-reference
 * construct anywhere in the closed *packed* file set (S2 brief §4:
 * "Forbidden, and enforced by the conformance gate: JavaScript,
 * TypeScript, JSX, HTML templates, server code, WebAssembly, executable
 * binaries, package lifecycle scripts, active SVG, remote imports, ...
 * remote fonts and undeclared network URLs. CSS URLs resolve only to
 * package-owned validated assets through normalized contained paths.").
 *
 * Deliberately scoped to exactly the packed set (derived from the theme's
 * own `package.json`, see `packed-files.mjs`), never the whole repository
 * tree — `tooling/` is dev-only and never packed, and is out of scope for
 * this runner (`check-package-file-set.mjs` independently asserts the
 * packed tarball's own file set is exactly this closed list).
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { loadPackedFileSet } from './packed-files.mjs';
import { resolveThemeRoot } from './resolve-theme-root.mjs';

const CSS_FORBIDDEN_PATTERNS = [
  { pattern: /<script/i, label: '<script' },
  { pattern: /javascript:/i, label: 'javascript: URL scheme' },
  { pattern: /expression\s*\(/i, label: 'expression()' },
  { pattern: /@import/i, label: '@import' },
  { pattern: /-moz-binding/i, label: '-moz-binding' },
  {
    pattern: /url\(\s*['"]?((https?:)?\/\/|data:|blob:)/i,
    label: 'external-origin or data/blob url()',
  },
];

async function main() {
  const themeRoot = resolveThemeRoot();
  const { packedFiles, stylesheets } = await loadPackedFileSet(themeRoot);
  let failed = false;

  for (const relativePath of packedFiles) {
    const filePath = path.join(themeRoot, relativePath);
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      console.error(`${relativePath} is not a regular file`);
      failed = true;
      continue;
    }
    // THD-L3: the source-tree file mode is POSIX-only — a Windows
    // checkout, or a non-022 umask, has no consistent 0644 to assert
    // against, and would fail this gate over something unrelated to the
    // change under review. `check-package-file-set.mjs`'s tarball-member
    // mode check stays unconditional: npm normalizes every packed
    // member's mode to 0644 on every platform, so that check is
    // platform-independent.
    if (process.platform !== 'win32' && (stats.mode & 0o777) !== 0o644) {
      console.error(
        `${relativePath} has mode ${(stats.mode & 0o777).toString(8)}, expected 0644`,
      );
      failed = true;
    }
  }

  for (const stylesheet of stylesheets) {
    const text = await readFile(path.join(themeRoot, stylesheet), 'utf8');
    for (const { pattern, label } of CSS_FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        console.error(`${stylesheet} contains a forbidden construct: ${label}`);
        failed = true;
      }
    }
    if (text.charCodeAt(0) === 0xfeff) {
      console.error(`${stylesheet} begins with a byte-order mark`);
      failed = true;
    }
  }

  const packageJson = JSON.parse(
    await readFile(path.join(themeRoot, 'package.json'), 'utf8'),
  );
  if ('scripts' in packageJson || 'dependencies' in packageJson) {
    console.error(
      'package.json carries a forbidden scripts/dependencies field',
    );
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('no forbidden construct found in the packed file set.');
}

await main();

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCheckScript } from './run-check.mjs';

/**
 * Self-heal a scratch theme's `theme.json.slotHooks` against
 * `check-css-hooks.mjs`'s own THM-M3 diagnostics, re-running until it
 * passes or the failure is not a slotHooks-set mismatch. Used to isolate a
 * test fixture from any pre-existing drift in the real theme it was
 * copied from (a separate, per-theme finding), rather than hand-copying
 * that theme's current `slotHooks` list, which would go stale the moment
 * its own CSS changes.
 *
 * @param {string} scratchRoot the scratch theme root to normalize in place
 * @returns {Promise<void>} resolves once `check-css-hooks.mjs` passes
 */
export async function normalizeSlotHooks(scratchRoot) {
  const themePath = path.join(scratchRoot, 'theme.json');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { passed, output } = await runCheckScript('check-css-hooks.mjs', {
      env: { THEME_ROOT: scratchRoot },
    });
    if (passed) return;
    const declaresUnused = /declares hook\(s\) the CSS never uses: (.+)/.exec(
      output,
    );
    const usesUndeclared = /does not declare: (.+)/.exec(output);
    if (!declaresUnused && !usesUndeclared) {
      throw new Error(
        `check-css-hooks.mjs failed for an unrelated reason:\n${output}`,
      );
    }
    const theme = JSON.parse(await readFile(themePath, 'utf8'));
    if (declaresUnused) {
      const toRemove = new Set(
        declaresUnused[1].split(',').map((s) => s.trim()),
      );
      theme.slotHooks = theme.slotHooks.filter((id) => !toRemove.has(id));
    }
    if (usesUndeclared) {
      const toAdd = usesUndeclared[1].split(',').map((s) => s.trim());
      theme.slotHooks = [...new Set([...theme.slotHooks, ...toAdd])].sort();
    }
    await writeFile(themePath, JSON.stringify(theme, null, 2), 'utf8');
  }
  throw new Error('could not normalize theme.json.slotHooks within 4 attempts');
}

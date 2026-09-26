import path from 'node:path';

/** @type {string} the default sibling-checkout location, relative to
 * this repository's `tooling/` directory (every consumer of this helper
 * runs with `tooling/` as its process cwd — the npm scripts, and `node
 * --test` invoked from `tooling`). */
const DEFAULT_RELATIVE_TEMPLATE_DIR = '../../template';

/**
 * Resolve the `@rathnasgala2/template` checkout this repository's tooling
 * consumes **by path**, not as an npm dependency (independent-review
 * finding on task packet S2-T13: a `file:` dependency on a temporary git
 * worktree is not durable release evidence, and pollutes `npm ls`/SBOM
 * output with that worktree's own unrelated dependency graph).
 *
 * Two environment overrides are honoured, in this order:
 *
 * 1. `GALA_TEMPLATE_DIR` — an absolute or cwd-relative path directly to a
 *    template checkout (unchanged from before `WORKSPACE_ROOT` existed),
 *    for example to point at a specific worktree while the default sibling
 *    checkout's own checked-out branch does not yet carry the template
 *    revision this package's tests need.
 * 2. `WORKSPACE_ROOT` (DEC-015 name; FOLLOW-UP SUPPLY-CHAIN-JS, 2026-09-17)
 *    — the directory containing the sibling repositories, so the template
 *    checkout resolves as `<WORKSPACE_ROOT>/template`. This is the fix for
 *    running from a location where the fixed relative default cannot reach
 *    the sibling, such as a git worktree one level deeper than the real
 *    checkout (LOCAL-38).
 *
 * With neither set, the default `../../template` (the sibling `template`
 * repository checkout, `/Users/anand/ws/galascribe/v2/template` from this
 * repository's own location) is used, unchanged from before either
 * override existed.
 *
 * @returns {string} the absolute, resolved template checkout directory
 */
export function resolveTemplateDir() {
  const templateDirOverride = process.env.GALA_TEMPLATE_DIR;
  if (templateDirOverride && templateDirOverride.length > 0) {
    return path.resolve(templateDirOverride);
  }
  const workspaceRoot = process.env.WORKSPACE_ROOT;
  if (workspaceRoot && workspaceRoot.length > 0) {
    return path.resolve(workspaceRoot, 'template');
  }
  return path.resolve(DEFAULT_RELATIVE_TEMPLATE_DIR);
}

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { runIfMain } from './run-if-main.mjs';

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/u;
const IMMUTABLE_CONTAINER_DIGEST = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/u;

/**
 * Return external action and checkout-repository references that are not
 * pinned to immutable identities.
 *
 * @param {string} source workflow YAML source
 * @param {string} file workflow path used in diagnostics
 * @returns {string[]} stable diagnostics
 */
export function findUnpinnedActionReferences(source, file) {
  const diagnostics = [];
  const flowStepWithUses = /^\s*-\s*\{[^}\n]*(?:uses|"uses"|'uses')\s*:/mu;
  if (flowStepWithUses.test(source)) {
    diagnostics.push(
      `${file}: flow-form step containing uses is unsupported; immutable action reference cannot be verified`,
    );
  }
  const actionReference = /^\s*-?\s*(?:uses|"uses"|'uses'):\s*([^\s#]+).*$/gmu;

  for (const match of source.matchAll(actionReference)) {
    const reference = match[1];
    if (reference === undefined || reference.startsWith('./')) {
      continue;
    }

    if (reference.startsWith('docker://')) {
      if (!IMMUTABLE_CONTAINER_DIGEST.test(reference)) {
        diagnostics.push(
          `${file}: ${reference} is not pinned by sha256 digest`,
        );
      }
      continue;
    }

    const separator = reference.lastIndexOf('@');
    const revision = separator === -1 ? '' : reference.slice(separator + 1);
    if (!FULL_COMMIT_SHA.test(revision)) {
      diagnostics.push(
        `${file}: ${reference} is not pinned to a full commit SHA`,
      );
    }
  }

  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const checkout =
      /^(\s*)(-\s*)?(?:uses|"uses"|'uses'):\s*actions\/checkout@[^\s#]+/u.exec(
        lines[index],
      );
    if (!checkout) continue;

    const usesIndent = checkout[1]?.length ?? 0;
    let stepStart = index;
    let stepIndent;
    if (checkout[2] !== undefined) {
      stepIndent = usesIndent;
    } else {
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const step = /^(\s*)-\s+\S/u.exec(lines[cursor]);
        if (step && (step[1]?.length ?? 0) < usesIndent) {
          stepStart = cursor;
          stepIndent = step[1]?.length ?? 0;
          break;
        }
      }
    }
    if (stepIndent === undefined) {
      diagnostics.push(
        `${file}: actions/checkout step boundary cannot be verified`,
      );
      continue;
    }

    let stepEnd = lines.length;
    for (let cursor = stepStart + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      const trimmed = candidate.trimStart();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      const candidateIndent = /^\s*/u.exec(candidate)?.[0].length ?? 0;
      if (
        candidateIndent < stepIndent ||
        (candidateIndent === stepIndent && trimmed.startsWith('- '))
      ) {
        stepEnd = cursor;
        break;
      }
    }

    const withBlocks = [];
    for (let cursor = stepStart; cursor < stepEnd; cursor += 1) {
      const withBlock = /^(\s*)(?:with|"with"|'with'):\s*(.*?)\s*$/u.exec(
        lines[cursor],
      );
      if (withBlock && (withBlock[1]?.length ?? 0) > stepIndent) {
        withBlocks.push({
          index: cursor,
          indent: withBlock[1]?.length ?? 0,
          suffix: withBlock[2] ?? '',
        });
      }
    }
    if (withBlocks.length > 1) {
      diagnostics.push(
        `${file}: actions/checkout has multiple with mappings; immutable repository ref cannot be verified`,
      );
      continue;
    }
    const withBlock = withBlocks[0];
    if (!withBlock) continue;
    if (withBlock.suffix.length > 0 && !withBlock.suffix.startsWith('#')) {
      diagnostics.push(
        `${file}: actions/checkout uses an unsupported non-block with mapping; immutable repository ref cannot be verified`,
      );
      continue;
    }

    let withEnd = stepEnd;
    for (let cursor = withBlock.index + 1; cursor < stepEnd; cursor += 1) {
      const candidate = lines[cursor];
      const trimmed = candidate.trimStart();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      const candidateIndent = /^\s*/u.exec(candidate)?.[0].length ?? 0;
      if (candidateIndent <= withBlock.indent) {
        withEnd = cursor;
        break;
      }
    }

    const fieldLines = [];
    let fieldIndent = Number.POSITIVE_INFINITY;
    for (let cursor = withBlock.index + 1; cursor < withEnd; cursor += 1) {
      const candidate = lines[cursor];
      const trimmed = candidate.trimStart();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      const candidateIndent = /^\s*/u.exec(candidate)?.[0].length ?? 0;
      fieldIndent = Math.min(fieldIndent, candidateIndent);
      fieldLines.push({ candidate, indent: candidateIndent });
    }

    let repository;
    let ref;
    let unsupportedField = false;
    for (const { candidate, indent } of fieldLines) {
      if (indent !== fieldIndent) continue;
      const field =
        /^\s*(?:([A-Za-z][A-Za-z0-9_-]*)|"([^"]+)"|'([^']+)'):\s*(.*?)\s*$/u.exec(
          candidate,
        );
      if (!field) {
        unsupportedField = true;
        break;
      }
      const key = field[1] ?? field[2] ?? field[3];
      if (key === '<<') {
        unsupportedField = true;
        break;
      }
      if (key !== 'repository' && key !== 'ref') continue;
      const rawValue = field[4] ?? '';
      const value = rawValue.replace(/\s+#.*$/u, '').trim();
      const unquoted =
        value.length >= 2 &&
        ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"')))
          ? value.slice(1, -1)
          : value;
      if (key === 'repository') repository = unquoted;
      if (key === 'ref') ref = unquoted;
    }
    if (unsupportedField) {
      diagnostics.push(
        `${file}: actions/checkout uses unsupported with mapping syntax; immutable repository ref cannot be verified`,
      );
      continue;
    }

    if (repository === undefined || repository.length === 0) continue;
    if (ref === undefined || ref.length === 0) {
      diagnostics.push(
        `${file}: ${repository} checkout is missing a full commit SHA ref`,
      );
    } else if (!FULL_COMMIT_SHA.test(ref)) {
      diagnostics.push(
        `${file}: ${repository} checkout ref ${ref} is not a full commit SHA`,
      );
    }
  }

  return diagnostics;
}

async function main() {
  // `verify` runs with cwd = `tooling/` (`npm --prefix tooling run verify`),
  // but `.github/workflows` lives at the repository root, one level above.
  const workflowDirectory = path.resolve('..', '.github/workflows');
  let entries;
  try {
    entries = await readdir(workflowDirectory, { withFileTypes: true });
  } catch (error) {
    // A repository without workflow files has nothing for this repository-local
    // checker to inspect. Treat "nothing to check" as a pass rather than a
    // crash; any other error (permissions, etc.) still throws.
    if (error && error.code === 'ENOENT') {
      process.stdout.write(
        'Verified 0 workflow file(s): no .github/workflows directory present.\n',
      );
      return;
    }
    throw error;
  }
  const workflowNames = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')),
    )
    .map((entry) => entry.name)
    .sort();

  const diagnostics = [];
  for (const workflowName of workflowNames) {
    const workflowPath = path.join(workflowDirectory, workflowName);
    const source = await readFile(workflowPath, 'utf8');
    diagnostics.push(...findUnpinnedActionReferences(source, workflowPath));
  }

  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join('\n'));
  }

  process.stdout.write(
    `Verified ${workflowNames.length} workflow file(s): all external references are immutable.\n`,
  );
}

await runIfMain(import.meta.url, main);

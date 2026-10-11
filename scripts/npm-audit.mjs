import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runIfMain } from './run-if-main.mjs';

const ALLOWLIST_PATH = path.resolve(
  import.meta.dirname,
  '..',
  'audit-allowlist.json',
);
const GHSA_PATTERN = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function advisoriesIn(report) {
  const advisories = new Map();
  for (const [packageName, vulnerability] of Object.entries(
    report.vulnerabilities ?? {},
  )) {
    for (const via of vulnerability.via ?? []) {
      if (
        typeof via !== 'object' ||
        via === null ||
        typeof via.url !== 'string'
      ) {
        continue;
      }
      const advisory = via.url.split('/').pop() ?? '';
      const existing = advisories.get(advisory) ?? {
        advisory,
        severity: via.severity ?? 'unknown',
        title: via.title ?? '',
        packages: [],
      };
      if (!existing.packages.includes(packageName)) {
        existing.packages.push(packageName);
      }
      advisories.set(advisory, existing);
    }
  }
  return [...advisories.values()];
}

export function evaluateAudit(
  advisories,
  allowlist,
  today,
  level = 'moderate',
) {
  const blocking = [];
  const accepted = [];
  const problems = [];
  const entries = new Map();

  for (const entry of allowlist) {
    if (!GHSA_PATTERN.test(entry.advisory ?? '')) {
      problems.push(`allowlist entry has no GHSA id: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      problems.push(
        `${entry.advisory}: reason must document accepted exposure`,
      );
    }
    if (!Array.isArray(entry.packages) || entry.packages.length === 0) {
      problems.push(
        `${entry.advisory}: packages must name the affected packages`,
      );
    }
    if (!DATE_PATTERN.test(entry.expires ?? '')) {
      problems.push(`${entry.advisory}: expires must be YYYY-MM-DD`);
    } else if (entry.expires < today) {
      problems.push(`${entry.advisory}: allowlist expired on ${entry.expires}`);
    }
    entries.set(entry.advisory, { ...entry, used: false });
  }

  const threshold = SEVERITY_RANK[level] ?? SEVERITY_RANK.moderate;
  for (const advisory of advisories) {
    if (
      (SEVERITY_RANK[advisory.severity] ?? SEVERITY_RANK.critical) < threshold
    ) {
      continue;
    }
    const entry = entries.get(advisory.advisory);
    if (!entry) {
      blocking.push(
        `${advisory.advisory} (${advisory.severity}) ${advisory.title} via ${advisory.packages.join(', ')}`,
      );
      continue;
    }
    entry.used = true;
    const uncovered = advisory.packages.filter(
      (packageName) => !entry.packages.includes(packageName),
    );
    if (uncovered.length > 0) {
      blocking.push(
        `${advisory.advisory} reaches packages not in its allowlist entry: ${uncovered.join(', ')}`,
      );
      continue;
    }
    accepted.push(
      `${advisory.advisory} (${advisory.severity}) accepted until ${entry.expires}: ${entry.reason}`,
    );
  }

  for (const entry of entries.values()) {
    if (!entry.used && GHSA_PATTERN.test(entry.advisory ?? '')) {
      problems.push(`${entry.advisory}: allowlist entry is no longer needed`);
    }
  }
  return { blocking, accepted, problems };
}

function runAudit(level) {
  const result = spawnSync(
    'npm',
    ['audit', '--json', `--audit-level=${level}`],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (!result.stdout) {
    throw new Error(
      `npm audit produced no report: ${result.stderr.slice(0, 300)}`,
    );
  }
  return JSON.parse(result.stdout);
}

async function main() {
  const level = process.env.NPM_AUDIT_LEVEL ?? 'moderate';
  const today = new Date().toISOString().slice(0, 10);
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  if (!Array.isArray(allowlist)) {
    throw new TypeError('audit-allowlist.json must be an array');
  }
  const { blocking, accepted, problems } = evaluateAudit(
    advisoriesIn(runAudit(level)),
    allowlist,
    today,
    level,
  );
  for (const line of accepted) console.log(`npm-audit: ${line}`);
  for (const line of problems) console.error(`npm-audit: ${line}`);
  for (const line of blocking) console.error(`npm-audit: BLOCKING ${line}`);
  if (blocking.length > 0 || problems.length > 0) {
    throw new Error(
      `npm audit blocked: ${blocking.length} advisory(ies), ${problems.length} allowlist problem(s)`,
    );
  }
  console.log(
    `npm-audit: no unaccepted advisories at level ${level} (${accepted.length} time-bounded exception(s))`,
  );
}

await runIfMain(import.meta.url, main);

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const outputPath = 'public/HEAD';

function getCommitFromEnv() {
  const candidates = [
    process.env.CF_PAGES_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.CI_COMMIT_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getCommitFromGit() {
  try {
    const output = execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    const value = output.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

const commit = getCommitFromEnv() ?? getCommitFromGit() ?? `${Date.now()}`;
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${commit}\n`, 'utf8');

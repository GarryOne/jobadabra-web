#!/usr/bin/env node
// Posts the weekly e2e summary (admin/e2e-weekly.js) as one GitHub issue in this repo and one Telegram message on the CI alerts bot (e2e-weekly.yml, Mondays).
//   node jobs/e2e-weekly.mjs [--dry-run]      --dry-run prints the issue and the message instead of posting them
// Reads the snapshot /admin/operations/e2e draws (GET /e2e/data?snapshot=1, SELFHEAL_PUBLISH_KEY), so the page, the issue and Telegram show the same numbers.
// The issue lives in this repo, not the public one: this workflow's token writes issues here only, and the e2e analysis stays private (spec rule D, 28 Oct 2026).
// Replaces the public repo's tools/e2e_weekly.py (its own classifier; retired in the public repo once this posts).
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {issueBody, issueTitle, telegramText, weekly} from '../admin/e2e-weekly.js';
import {tellOwner} from '../admin/ai-refusal.js';

const base = process.env.E2E_INTEL_URL || 'https://www.jobpilotto.top/e2e/data', key = process.env.SELFHEAL_PUBLISH_KEY;
const repo = process.env.ISSUE_REPO || process.env.GITHUB_REPOSITORY || 'GarryOne/jobadabra-web', LABEL = 'e2e-weekly';
const gh = (...args) => execFileSync('gh', args, {encoding: 'utf8'}).trim();

/** Creates this week's issue, or rewrites it when the job runs again the same day; returns its URL. */
function writeIssue(title, body) {
  gh('label', 'create', LABEL, '-R', repo, '--force', '--color', '1D76DB', '--description', 'The weekly e2e summary (jobs/e2e-weekly.mjs)');
  const same = JSON.parse(gh('issue', 'list', '-R', repo, '--label', LABEL, '--state', 'all', '--limit', '20', '--json', 'number,title,url')).find(issue => issue.title === title);
  if (!same) return gh('issue', 'create', '-R', repo, '--title', title, '--label', LABEL, '--body', body);
  gh('issue', 'edit', String(same.number), '-R', repo, '--body', body);
  return same.url;
}

async function main() {
  if (!key) throw new Error('SELFHEAL_PUBLISH_KEY is not set: the snapshot cannot be read');
  const response = await fetch(`${base}?snapshot=1`, {headers: {Authorization: `Bearer ${key}`}});
  if (!response.ok) throw new Error(`the site answered ${response.status} for the e2e snapshot`);
  const s = weekly(await response.json());
  if (process.argv.includes('--dry-run')) { console.log(`# ${issueTitle(s)}\n\n${issueBody(s)}\n\n---\n${telegramText(s)}`); return; }
  const url = writeIssue(issueTitle(s), issueBody(s));
  console.log(`${issueTitle(s)}: ${url}`);
  console.log(`Telegram: ${JSON.stringify(await tellOwner(telegramText(s, url)))}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => { console.error(`::error::${error.message}`); process.exit(1); });

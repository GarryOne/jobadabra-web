#!/usr/bin/env node
// Publishes the What's new entry of every released app version by itself (owner, 18 Oct 2026; changelog-publish.yml: when a release run ends, hourly as backup). A version is a stable release or a build the beta gate approved
// ("Beta-approved:" in its notes); the entry covers the commits since the previous such version, so a stable rolls up the builds in between. The AI (Haiku, DIGEST_ANTHROPIC_KEY) sorts them into new features / improvements /
// bug fixes in plain words; admin/changelog.js checks the answer, the site checks it again (PUT /changelog/data, SELFHEAL_PUBLISH_KEY). A version whose draft fails stays unpublished and is retried at the next run.
//   node jobs/changelog-publish.mjs [--plan] [--backfill] [--dry [--tag desktop-v0.7.28]] [--cost cost.json]   --plan: $0 table of what a run would read and cost; --backfill: also drafts versions older than the newest stored one and the 0.0.1 entry (an automatic run does neither);    --cost: {usd, calls} for desktop/e2e/ai-cost-report.mjs --job changelog-publish; --dry drafts and prints, publishes nothing. Guard: test/admin/changelog-publish.test.js (fake model, fake site).
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {MODEL, ask, zurichHour} from '../admin/build-digest.js';
import {AiRefused, describe, isRefusal, reportRefusal, staysDown} from '../admin/ai-refusal.js';
import {plainEntry} from '../admin/changelog-plain.js';
import {MERGE_PROMPT, MODEL_PROMPT, cleanGroups, problems, versionOf} from '../admin/changelog.js';
import {usageCost} from '../desktop/e2e/lib/vision.mjs';
import {pathToFileURL} from 'node:url';

const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || 'GarryOne/jobadabra';
const base = process.env.CHANGELOG_URL || 'https://www.jobpilotto.top/changelog/data';
// Only what a user can see reaches the AI (owner, 18 Oct 2026: "I have 5000 commits, be careful"): a commit that touches only tests, e2e, fixtures, recordings, scripts, docs, tools or CI is not read at all.
export const PATHSPEC = ['desktop', 'src', 'config', 'extension', 'worker/src', 'requirements.txt', ':(exclude)desktop/e2e', ':(exclude)desktop/test', ':(exclude)desktop/scripts', ':(exclude)desktop/docs',
  ':(exclude,glob)**/fixtures/**', ':(exclude,glob)**/test/**', ':(exclude,glob)**/tests/**', ':(exclude,glob)**/recorded*/**'];
const OLD_PATHS = ['desktop', 'src', 'config', 'tools', 'extension', 'worker/src', 'requirements.txt'];   // what the page read before the filter, only for the dry run's "before" count
const CHUNK = 300, CAP = 0.15;   // subjects per AI call; the run stops past this many dollars
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] ?? '' : ''; };
const out = (cmd, ...args) => execFileSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 26}).trim();
const order = version => versionOf(version).replace(/-alpha\.\d+$/, '').split('.').map(Number);   // 0.4.0-alpha.254 sorts as 0.4.0
const byVersion = (a, b) => { const x = order(a.tagName), y = order(b.tagName); return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]); };

// GitHub releases [{tagName, isPrerelease, isDraft, publishedAt, body}] + what the site has ({version: channel}) -> the work, oldest first:
//   {tag, prev, version, date, channel} to draft, {version, channel: 'stable'} to promote a stored beta. The oldest release is "since" the first commit (`root`, a sha), so the page starts at the project's start (backfill 18 Oct 2026).
export function plan(releases, have = {}, root = '') {
  const published = releases.filter(item => /^desktop-v\d+\.\d+\.\d+(-alpha\.\d+)?$/.test(item.tagName) && !item.isDraft && (!item.isPrerelease || /^Beta-approved/m.test(item.body || ''))).sort(byVersion);
  const draft = [], promote = [];
  published.forEach((item, at) => {
    const version = order(item.tagName).join('.'), channel = item.isPrerelease ? 'beta' : 'stable';
    if (at === 0 && !root) return;
    if (!(version in have)) draft.push({tag: item.tagName, prev: at ? published[at - 1].tagName : root, first: at === 0, version, date: item.publishedAt.slice(0, 10), channel});
    else if (have[version] === 'beta' && channel === 'stable') promote.push({version, channel});
  });
  return {draft, promote};
}

// One version -> {entry} or {hidden: true} (nothing a user would notice) and its cost; throws when the AI's answer is unusable (nothing is published for it).
// The 0.0.1 entry: the project start, dated at the first commit. Fixed words (checked by problems() like any entry), no AI call.
export const startEntry = date => ({version: '0.0.1', date, channel: 'start', groups: [{kind: 'features', items: [{emoji: '🌱', lead: 'Jobadabra begins', text: 'The very first version finds job openings in Switzerland and sends you a daily list.'}]}]});

// An automatic run drafts only versions NEWER than the newest stored one (a missing older version is a backfill: explicit --backfill, owner 18 Oct 2026).
export const newerThanStored = (draft, have) => {
  const compare = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
  const top = Object.keys(have).map(order).sort((x, y) => compare(y, x))[0];
  return top ? draft.filter(item => compare(order(item.version), top) > 0) : draft;
};

export const chunksOf = (subjects, size = CHUNK) => Array.from({length: Math.ceil(subjects.length / size)}, (_, i) => subjects.slice(i * size, (i + 1) * size));

// $0 estimate for the dry run: chunks, tokens in/out and cost, from the subject text (about 4 characters a token; an answer ~200 + 60 tokens per subject, up to 2,400; one merge call over 1 chunk).
export function estimate(subjects) {
  const parts = chunksOf(subjects);
  if (!parts.length) return {chunks: 0, tokensIn: 0, tokensOut: 0, cost: 0};
  const tokensIn = parts.reduce((sum, part) => sum + Math.ceil((MODEL_PROMPT.length + part.join('\n').length + part.length * 3) / 4), 0) + (parts.length > 1 ? Math.ceil(MERGE_PROMPT.length / 4) + parts.length * 400 : 0);
  const tokensOut = parts.reduce((sum, part) => sum + Math.min(2400, 200 + 60 * part.length), 0) + (parts.length > 1 ? 2400 : 0);   // a full answer (18 items) is ~2,000 tokens; measured 18 Oct 2026
  return {chunks: parts.length, tokensIn, tokensOut, cost: 1.3 * (usageCost(MODEL, {input_tokens: tokensIn, output_tokens: tokensOut}) ?? 0)};   // x1.3: some answers are asked twice (cut off, unusable)
}

// One AI call that must answer a checked group list (retried once). Adds its cost to `spend`; never starts a call past the cap.
async function groupsFrom(system, user, {key, fetch: doFetch, spend}) {
  let failure = '', dropped = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    if (spend && spend.total >= spend.cap) throw new Error(`the spend cap of $${spend.cap} is reached`);
    const {text, usage, stopReason} = await ask({system, user}, {key, fetch: doFetch});
    if (spend) spend.total += usageCost(MODEL, usage) ?? 0;
    const cleaned = stopReason === 'max_tokens' ? {error: 'cut off'} : cleanGroups(text);
    if (cleaned.error) { failure = cleaned.error; continue; }
    return {groups: cleaned.groups, dropped: cleaned.dropped};
  }
  return {failure, groups: null, dropped};
}
const lineOf = (group, item) => `- [${group.kind}] ${item.lead}: ${item.text}`;
const union = parts => ['features', 'improvements', 'fixes'].map(kind => ({kind, items: parts.flatMap(groups => groups.filter(group => group.kind === kind).flatMap(group => group.items)).slice(0, 6)})).filter(group => group.items.length);

// One version -> {entry} or {hidden: true} (nothing a user would notice) and its cost; throws when the AI's answer is unusable (nothing is published for it).
// More than CHUNK subjects are read in parts (one call each), then ONE short call joins the parts; a join that fails keeps the parts' own notes, at most 6 per kind.
export async function draftEntry({tag, prev, first, version, date, channel}, {subjects, key, fetch: doFetch, spend = {total: 0, cap: Infinity}}) {
  if (!subjects.length) return {hidden: true, cost: 0, dropped: []};
  const start = spend.total, parts = chunksOf(subjects), since = first ? 'the start of the project' : versionOf(prev), results = [], dropped = [];
  for (const [at, part] of parts.entries()) {
    const user = `Version ${version} (changes since ${since}${parts.length > 1 ? `, part ${at + 1} of ${parts.length}` : ''}):\n${part.map(line => `- ${line}`).join('\n')}`;
    const done = await groupsFrom(MODEL_PROMPT, user, {key, fetch: doFetch, spend});
    if (!done.groups) throw new Error(`${version}: the model's answer was unusable twice (${done.failure})`);
    results.push(done.groups); dropped.push(...done.dropped);
  }
  let groups = results.length === 1 ? results[0] : union(results);
  if (results.length > 1 && groups.length) {
    const lines = results.flatMap(parts => parts.flatMap(group => group.items.map(item => lineOf(group, item)))).join('\n');
    const joined = await groupsFrom(MERGE_PROMPT, `Version ${version}:\n${lines}`, {key, fetch: doFetch, spend});
    if (joined.groups?.length) groups = joined.groups;
    dropped.push(...joined.dropped);
  }
  const cost = spend.total - start;
  if (!groups.length) return {hidden: true, cost, dropped};
  const entry = {version, date, channel, groups}, bad = problems(entry);
  if (bad.length) throw new Error(`${version}: the entry broke a rule (${bad.join(', ')})`);
  return {entry, cost, dropped};
}

// One version -> its entry, whatever the AI does (owner, 24 Oct 2026: a refused AI must never leave the page without the release). `ai` = {down: error|null} is shared by the run: after a refusal that will not clear
// (limit, bad key, rate, overload) no more calls are made. -> {entry, cost, dropped, hidden?, plain?, error?}: `plain` = built without the AI (marked for a redraft), `error` = what to make the run red with.
export async function draftOrPlain(work, {subjects, ai = {down: null}, ...rest}) {
  const fallback = error => { const entry = plainEntry(work, subjects); return entry ? {entry, plain: true, cost: 0, dropped: [], error} : {hidden: true, cost: 0, dropped: [], error}; };
  if (ai.down) return fallback(ai.down);
  try { return await draftEntry(work, {subjects, ...rest}); }
  catch (error) { if (staysDown(error)) ai.down = error; return fallback(error); }
}

const rootOf = () => { const sha = out('git', 'rev-list', '--max-parents=0', 'HEAD').split('\n').pop(); return {sha, date: out('git', 'log', '-1', '--format=%as', sha)}; };
const subjectsOf = ({tag, prev}, paths = PATHSPEC) => out('git', 'log', '--no-merges', '--format=%s', `${prev}..${tag}`, '--', ...paths).split('\n').filter(Boolean);
const siteCall = async (method, body, key) => {
  const response = await fetch(base, {method, headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (!response.ok) throw new Error(`the site answered ${response.status} to ${method} /changelog/data: ${(await response.text()).slice(0, 300)}`);
  return response.json();
};

// $0: per version the commits before and after the filter, the chunks, the estimated tokens and cost. No AI key, no site call.
function printPlan(draft, root) {
  let total = 0;
  console.log('version | date | commits before filter | after | chunks | tokens in | tokens out | est. $');
  for (const work of draft) {
    const before = subjectsOf(work, OLD_PATHS).length, subjects = subjectsOf(work), {chunks, tokensIn, tokensOut, cost} = estimate(subjects);
    total += cost;
    console.log(`${work.version} | ${work.date} | ${before} | ${subjects.length} | ${chunks} | ${tokensIn} | ${tokensOut} | $${cost.toFixed(4)}`);
  }
  console.log(`${draft.length} versions + the 0.0.1 start entry (${root.date}, no AI); estimated total $${total.toFixed(4)}; hard stop at $${CAP}`);
}

async function main() {
  const dry = process.argv.includes('--dry'), backfill = process.argv.includes('--backfill'), planOnly = process.argv.includes('--plan'), aiKey = process.env.DIGEST_ANTHROPIC_KEY, siteKey = process.env.SELFHEAL_PUBLISH_KEY;
  if (!dry && !planOnly && !siteKey) { console.error('::error::SELFHEAL_PUBLISH_KEY is not set: nothing published.'); process.exit(1); }
  const releases = JSON.parse(out('gh', 'release', 'list', '-R', repo, '-L', '200', '--json', 'tagName,isPrerelease,isDraft,publishedAt'));
  for (const item of releases.filter(release => release.isPrerelease)) item.body = JSON.parse(out('gh', 'release', 'view', item.tagName, '-R', repo, '--json', 'body')).body;
  const site = planOnly && !siteKey ? {have: {'0.7.16': 'stable'}} : dry ? {have: {}} :   // --plan without the site key: 0.7.16 is the one version stored today
     await siteCall('GET', null, siteKey), have = site.have, plainVersions = site.plain || [];
  const root = rootOf();
  let {draft, promote} = plan(releases, have, root.sha);
  if (arg('tag')) draft = plan(releases, {}, root.sha).draft.filter(item => item.tag === arg('tag'));
  else if (!backfill) draft = newerThanStored(draft, have);
  if (process.argv.includes('--plan')) return printPlan(draft, root);
  const entries = [], hidden = [], redraft = [], failures = [], ai = {down: !aiKey && !planOnly ? new AiRefused(401, 'DIGEST_ANTHROPIC_KEY is not set in this run') : null};
  if (backfill && !arg('tag') && !('0.0.1' in have)) entries.push(startEntry(root.date));
  const spend = {total: 0, cap: CAP};
  // Versions stored WITHOUT the AI wait for words: they are drafted again like new ones (a stored plain body is replaced once, never an AI one).
  const again = dry ? [] : plan(releases, {}, root.sha).draft.filter(item => plainVersions.includes(item.version) && !draft.some(next => next.version === item.version)).map(item => ({...item, redraft: true}));
  let spent = 0, calls = 0;
  for (const work of [...draft, ...again]) {
    if (spend.total >= spend.cap && !ai.down) ai.down = new Error(`the spend cap of $${CAP} is reached`);
    const done = await draftOrPlain(work, {subjects: subjectsOf(work), ai, key: aiKey, spend});
    spent += done.cost; calls += done.cost > 0 ? 1 : 0;
    const why = done.error && (isRefusal(done.error) ? describe(done.error) : done.error.message);
    if (done.error) { failures.push(`${work.version}: ${why}`); console.log(`::error::${work.version}: ${why}${done.plain ? ' (published as a plain entry, written again at the next run that can reach the AI)' : work.redraft ? ' (stays plain)' : ' (not published; retried at the next run)'}`); }
    console.log(`${work.tag}: ${done.entry ? `${done.entry.groups.map(group => `${group.kind} ${group.items.length}`).join(', ')}${done.plain ? ' [plain, no AI]' : ''}` : 'nothing a user would notice (hidden)'}, ${done.dropped.length} dropped by the word floor, $${done.cost.toFixed(4)}`);
    for (const line of done.dropped) console.log(`  dropped: ${line}`);
    if (work.redraft) { if (done.entry && !done.plain) redraft.push(done.entry); }
    else if (done.entry) entries.push(done.entry);
    else if (!done.error) hidden.push({version: work.version, date: work.date, channel: work.channel});
    if (dry) console.log(JSON.stringify(done.entry || {hidden: true}, null, 2));
  }
  if (!dry && (entries.length || hidden.length || promote.length || redraft.length)) {
    const result = await siteCall('PUT', {entries, hidden, redraft, channels: Object.fromEntries(promote.map(item => [item.version, item.channel]))}, siteKey);
    console.log(`published: ${result.stored} entries (${entries.filter(entry => entry.plain).length} plain), ${redraft.length} written again, ${result.hidden} hidden, ${promote.length} promoted to stable; AI cost $${spent.toFixed(4)}`);
  } else console.log(`nothing to publish${dry ? ' (dry run)' : ''}; AI cost $${spent.toFixed(4)}`);
  if (arg('cost')) writeFileSync(arg('cost'), JSON.stringify({usd: spent, calls}));
  if (ai.down && isRefusal(ai.down)) await reportRefusal(ai.down, {job: 'Changelog publish', effect: `${entries.filter(entry => entry.plain).length} plain What's new entries went out without the AI; the next run that can reach it writes them again.`, workflow: 'changelog-publish.yml', zurichHour: zurichHour(new Date()), run: out});
  if (failures.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => { console.error(`::error::${error.message}`); process.exit(1); });

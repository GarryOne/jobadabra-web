// The old bot Worker's on-time starts, run by the site Worker (owner, 1 Nov 2026: "Timers to site Worker, delete bot"). The RULES stay in the public repo's app-core/src/scheduler.js (CRONS, jobsFor,
// NIGHT_SLOTS, runScheduled) and watchdog.js (fires, LABEL, TITLE), where the GitHub-side watchdog and the workflows' run-name tests read them; this file only decides which of those crons a
// site trigger stands for. Triggers: the */5 one stands for every CRONS entry that fires at its tick (nightly hours, ten-minute sweep, stats, night passes: all on :00/:05/:30/:40 minutes), and
// OWN_CRON ('47 21,23,1 * * *', the three-a-day e2e) is a trigger of its own because :47 is on no 5-minute tick (a8, 1 Nov 2026: Option A, CRONS unchanged).
// Dormant until env.TIMERS === 'on'; the dispatch token is TIMERS_GITHUB_TOKEN, the repo env.TIMERS_REPO (a var, so the org move is one edit, 1 Nov 2026): repo and token travel together (as shared/intel-start.js), the site GITHUB_TOKEN is never sent there.
// A failed start fails the trigger after every job had its try; no Telegram any more (the bot is retired): the failure goes to the watchdog's GitHub issue and Cloudflare's cron history.
import {CRONS, runScheduled} from '../app-core/src/scheduler.js';
import {LABEL, TITLE, fires} from '../app-core/src/watchdog.js';
import {githubFetch} from '../app-core/src/github-fetch.js';

export const TICK = '*/5 * * * *';
export const OWN_CRON = '47 21,23,1 * * *';

/** The CRONS entries a site trigger event stands for: the tick's every firing entry (but OWN_CRON, which has its own trigger), OWN_CRON itself, or none for any other trigger. */
export function cronsAt(event) {
  const date = new Date(event?.scheduledTime || Date.now());
  if (event?.cron === TICK) return CRONS.filter(cron => cron !== OWN_CRON && fires(cron, date));
  return event?.cron === OWN_CRON && CRONS.includes(OWN_CRON) ? [OWN_CRON] : [];
}

/** A refused start as a comment on the watchdog's open issue, or that issue opened (as the bot Worker did, app-core/src/index.js reportStart). Best effort, the caller ignores a failure. */
export async function reportStart(env, text, fetcher = githubFetch) {
  const call = (path, init = {}) => fetcher(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {...init, headers: {Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'jobadabra-web', 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? {'Content-Type': 'application/json'} : {})}});
  const open = await call(`issues?labels=${LABEL}&state=open&per_page=1`);
  const [issue] = open.ok ? await open.json() : [];
  const body = `${text}\n\n<sub>Reported by the site Worker (shared/timers.js, rules in app-core/src/scheduler.js).</sub>`;
  if (issue) await call(`issues/${issue.number}/comments`, {method: 'POST', body: JSON.stringify({body})});
  else await call('issues', {method: 'POST', body: JSON.stringify({title: TITLE, body, labels: [LABEL]})});
}

/**
 * Starts the workflows the event's crons are due for. `dispatch(env, inputs, workflow)` is the site Worker's; `report(text)` defaults to reportStart on the scoped env.
 * Resolves to the workflows started ([] when dormant or nothing is due); throws, after every job had its try, when any start failed or the token is missing on a due tick.
 */
export async function runTimers(event, env, {dispatch, report, now = new Date(event?.scheduledTime || Date.now())}) {
  if (env.TIMERS !== 'on') return [];
  const crons = cronsAt(event);
  if (!crons.length) return [];
  if (!env.TIMERS_GITHUB_TOKEN) throw new Error('TIMERS_GITHUB_TOKEN is not set (the site GITHUB_TOKEN is not sent to the public repo in its place)');
  if (!env.TIMERS_REPO) throw new Error('TIMERS_REPO is not set (the public repo as owner/name, a var in wrangler.toml; never a literal in code)');
  const scoped = {...env, GITHUB_REPO: env.TIMERS_REPO, GITHUB_TOKEN: env.TIMERS_GITHUB_TOKEN};
  const tell = report || (text => reportStart(scoped, text));
  const started = [], failed = [];
  for (const cron of crons) {
    try { started.push(...await runScheduled({cron, scheduledTime: now.getTime()}, scoped, {dispatch, report: tell, now})); }
    catch (error) { failed.push(error.message); }
  }
  if (failed.length) throw new Error(failed.join('; '));
  return started;
}

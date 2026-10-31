// Grey lane lifecycle, shared by the page and weekly summary (owner, 30 Oct 2026: page + weekly + expiry).
// Only observed suite results count as nights; absent suite jobs never imply green. No D1 reads here.
// Guards: test/admin/e2e-{intel,page,weekly}.test.js.
const DAY = 86400000;
const dayOf = value => new Date(value).toISOString().slice(0, 10);
const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && dayOf(value) === value;
const text = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const suiteName = value => typeof value === 'string' && /^[\w.+-]{1,80}$/.test(value);
const nightly = row => ['nightly', 'scheduled'].includes(row.kind);
const rate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const percent = value => `${Math.round(value * 100)}%`;
// The reason words the public repo's one writer (desktop/e2e/lib/grey-record.mjs, called by flaky-proof.mjs --grey) puts in a job's "grey-<suite>" artifact: timing (every failure
// of both tries was timing) or picker (the PR's picked step no longer exists). The other words are the PR verdict's (main, tolerant, suspended, ai-credit, runner, install):
// accepted here so a later writer needs no site change, but a reason nobody records is never counted as zero (the card draws only reasons seen).
export const GREY_REASONS = {main: "main's own red", runner: 'runner', 'ai-credit': 'AI credit', install: 'install', tolerant: 'tolerant', suspended: 'suspended', timing: 'timing', environment: 'environment', picker: 'picker'};
// The run kinds jobs/e2e-intel-rows.mjs kindOf names: the collector stamps a record's kind, run and day from the run it was read in, never from the artifact.
const GREY_KINDS = ['pr', 'after-merge', 'scheduled', 'nightly', 'beta', 'soak', 'canary', 'harness'];

/** Public main's registry -> bounded lane data, or null for an unreadable registry; an empty suites object is a valid read. */
export function cleanLanes(value) {
  if (!value?.suites || typeof value.suites !== 'object' || Array.isArray(value.suites)) return null;
  return {suites: Object.fromEntries(Object.entries(value.suites).slice(0, 300).filter(([name, row]) => suiteName(name) && row && ['tolerant', 'suspended', 'retired'].includes(row.lane)).map(([name, row]) => [name, {
    lane: row.lane, input: text(row.input, 80), since: isDay(row.since) ? row.since : '', why: text(row.why), ...(row.returns ? {returns: text(row.returns)} : {})
  }]))};
}

const cleanBands = bands => Object.fromEntries(Object.entries(bands || {}).filter(([suite, metrics]) => suiteName(suite) && metrics && typeof metrics === 'object').map(([suite, metrics]) => [suite,
  Object.fromEntries(Object.entries(metrics).filter(([name, band]) => suiteName(name) && rate(band?.lower) && rate(band?.upper) && band.lower <= band.upper).map(([name, band]) => [name, {lower: band.lower, upper: band.upper}]))]));

/** Merge bounded observations into the existing snapshot, not another table. Failed/omitted registry reads retain the last successful read. */
export function greyData(previous = {}, data = {}, now = new Date()) {
  const from = dayOf(now.getTime() - 29 * DAY), to = dayOf(now), observations = new Map();
  for (const row of [...(previous.suiteNights || []), ...(Array.isArray(data.suiteNights) ? data.suiteNights.slice(0, 10000) : [])]) {
    if (!isDay(row?.day) || row.day < from || row.day > to || !nightly(row) || !suiteName(row.suite) || !['mac', 'windows'].includes(row.platform)
      || !Number.isInteger(row.runId) || row.runId <= 0 || typeof row.green !== 'boolean') continue;
    observations.set(`${row.runId}:${row.suite}:${row.platform}`, {runId: row.runId, day: row.day, kind: row.kind, suite: row.suite, platform: row.platform, green: row.green,
      ...(row.rates && typeof row.rates === 'object' ? {rates: Object.fromEntries(Object.entries(row.rates).filter(([name, value]) => suiteName(name) && rate(value)))} : {})});
  }
  const lanes = cleanLanes(data.lanes) || cleanLanes(previous.lanes), ledger = new Map();
  // One row per e2e run and suite (a later read replaces an earlier reason); validated again here, whatever the artifact said.
  for (const row of [...(previous.greyJobs || []), ...(Array.isArray(data.greyJobs) ? data.greyJobs.slice(0, 2000) : [])]) {
    if (isDay(row?.day) && row.day >= from && row.day <= to && Object.hasOwn(GREY_REASONS, row.reason) && GREY_KINDS.includes(row.kind) && suiteName(row.suite) && Number.isInteger(row.runId) && row.runId > 0)
      {
      const suite = row.suite.replace(/-\d+of\d+$/, '');   // shards are one suite, as on the nights rows
      ledger.set(`${row.runId}:${suite}`, {runId: row.runId, day: row.day, kind: row.kind, suite, reason: row.reason});
    }
  }
  return {...(lanes ? {lanes} : {}), ...((Array.isArray(data.greyJobs) || Array.isArray(previous.greyJobs)) ? {greyJobs: [...ledger.values()].sort((a, b) => b.day.localeCompare(a.day) || b.runId - a.runId).slice(0, 2000)} : {}),
    suiteNights: [...observations.values()].sort((a, b) => b.day.localeCompare(a.day) || b.runId - a.runId).slice(0, 10000),
    ...((data.mainBands || previous.mainBands) ? {mainBands: cleanBands(data.mainBands || previous.mainBands)} : {})};
}

function nightsOf(snapshot, suite, now) {
  const byDay = new Map(), to = dayOf(now), from = dayOf(now.getTime() - 29 * DAY);
  const add = row => {
    if (!isDay(row.day) || row.day < from || row.day > to) return;
    const night = byDay.get(row.day) || {day: row.day, green: null, rates: {}};
    if (row.green === false) night.green = false;
    else if (row.green === true && night.green === null) night.green = true;
    // Multiple platforms/runs on one night: show the lowest measured rate, rather than hiding a regression with another green.
    for (const [name, value] of Object.entries(row.rates || {})) if (rate(value)) night.rates[name] = Math.min(night.rates[name] ?? 1, value);
    byDay.set(row.day, night);
  };
  for (const row of snapshot.suiteNights || []) if (row.suite.replace(/-\d+of\d+$/, '') === suite && nightly(row)) add(row);
  // Old snapshots prove reds only; quality counts prove this suite ran even before suite outcomes were collected.
  for (const row of snapshot.fails || []) if (row.suite.replace(/-\d+of\d+$/, '') === suite && nightly(row)) add({...row, green: false});
  if (suite === 'quality') for (const row of snapshot.quality || []) if (row.pairs > 0) add({...row, green: null, rates: {agree: row.within8 / row.pairs}});
  const bands = snapshot.mainBands?.[suite] || {};
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7).map(night => ({...night,
    comparisons: Object.entries(night.rates).filter(([name]) => rate(bands[name]?.lower) && rate(bands[name]?.upper)).map(([metric, value]) => ({metric, rate: value, ...bands[metric], below: value < bands[metric].lower}))}));
}

/** Suite x reason counts with each cell's newest run (day, then run id): the rows the card and the weekly both tell. */
function trendOf(week) {
  const bySuite = new Map();
  for (const row of week) {
    const cells = bySuite.get(row.suite) || {}, cell = cells[row.reason] || {n: 0, runId: 0, day: ''};
    cells[row.reason] = {n: cell.n + 1, runId: row.day > cell.day || (row.day === cell.day && row.runId > cell.runId) ? row.runId : cell.runId, day: row.day > cell.day ? row.day : cell.day};
    bySuite.set(row.suite, cells);
  }
  const rows = [...bySuite].map(([suite, cells]) => ({suite, cells: Object.fromEntries(Object.entries(cells).map(([reason, {n, runId}]) => [reason, {n, runId}])), total: Object.values(cells).reduce((sum, {n}) => sum + n, 0),
    newestRunId: Object.values(cells).reduce((newest, cell) => (cell.day > newest.day || (cell.day === newest.day && cell.runId > newest.runId) ? cell : newest)).runId}))
    .sort((a, b) => b.total - a.total || a.suite.localeCompare(b.suite));
  return {rows, reasons: Object.keys(GREY_REASONS).filter(reason => week.some(row => row.reason === reason))};
}

/** One shared count for HTML and weekly text: UTC calendar age, seven observed nights and optional PR reasons/main bands. */
export function greySummary(snapshot, now = new Date()) {
  const lanes = cleanLanes(snapshot?.lanes), today = dayOf(now);
  const rows = Object.entries(lanes?.suites || {}).filter(([, row]) => ['tolerant', 'suspended'].includes(row.lane)).sort(([a], [b]) => a.localeCompare(b)).map(([suite, row]) => {
    const age = row.since ? Math.max(0, Math.round((Date.parse(today) - Date.parse(row.since)) / DAY)) : null;
    const nights = nightsOf(snapshot, suite, now), three = nights.slice(0, 3);
    const consecutive = three.length === 3 && three.every((night, i) => !i || Date.parse(three[i - 1].day) - Date.parse(night.day) === DAY);
    const below = consecutive && three[0].comparisons.some(({metric}) => three.every(night => night.comparisons.some(c => c.metric === metric && c.below)));
    return {suite, ...row, age, ageText: age === null ? 'age unknown' : `${age} day${age === 1 ? '' : 's'}`, returns: row.returns || 'no exit condition yet', nights, expired: age > 14, below};
  });
  // Absent evidence is never zero: no stored ledger -> trend is null.
  const from = dayOf(now.getTime() - 6 * DAY), week = Array.isArray(snapshot?.greyJobs) ? snapshot.greyJobs.filter(row => row.day >= from && row.day <= today && Object.hasOwn(GREY_REASONS, row.reason)) : null;
  return {read: Boolean(lanes), rows, trend: week && trendOf(week)};
}

/** Shared wording for one observed night; rates appear only beside an available measured main band. */
export function greyNightText(night) {
  return `${night.day} ${night.green === null ? 'result not stored' : night.green ? 'green' : 'red'}${night.comparisons.map(c => `; ${c.metric} ${percent(c.rate)} vs main ${percent(c.lower)}–${percent(c.upper)}`).join('')}`;
}

export const GREY_TREND_TITLE = 'Greys, last 7 days: suite × reason';
/** The card's table as lines for the weekly: heading, one line per suite (at most `limit`), or the absence said plainly. */
export function greyTrendLines(grey, limit = Infinity) {
  if (!grey.trend) return [GREY_TREND_TITLE, 'Grey jobs not recorded yet; counts unavailable.'];
  if (!grey.trend.rows.length) return [GREY_TREND_TITLE, 'No grey jobs recorded in the last 7 days.'];
  const shown = grey.trend.rows.slice(0, limit);
  return [GREY_TREND_TITLE, ...shown.map(row => `${row.suite} · ${grey.trend.reasons.filter(reason => row.cells[reason]).map(reason => `${GREY_REASONS[reason]} ${row.cells[reason].n}`).join(' · ')} · newest run #${row.newestRunId}`),
    ...(grey.trend.rows.length > shown.length ? [`…and ${grey.trend.rows.length - shown.length} more suites`] : [])];
}

/** Weekly issue and Telegram use the page's computed rows and night wording, without another count. */
export function greyLines(grey) {
  return ['Grey', ...(!grey.read ? ['lane registry not read yet'] : !grey.rows.length ? ['No tolerant or suspended suites.'] : grey.rows.map(row =>
    `${row.suite} · ${row.lane} · ${row.input || 'input not named'} · ${row.why || 'reason not named'} · since ${row.since || 'unknown'} (${row.ageText}) · ${row.returns}\n${row.nights.map(greyNightText).join(' | ') || 'No suite nights stored yet.'}`)), ...greyTrendLines(grey)];
}

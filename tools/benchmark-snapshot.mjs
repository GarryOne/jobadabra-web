// Builds an allowlisted public snapshot from already judged benchmark files; never calls a model or publishes applicant/listing content.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const SEARCH = {ours: 'Jobadabra', jobspy: 'JobSpy', eures: 'EURES', adzuna: 'Adzuna', 'career-ops': 'career-ops', 'career-ops-docs': 'career-ops (docs setup)'};
const FORM = {extension: 'Jobadabra', 'browser-use': 'Browser Use', nanobrowser: 'Nanobrowser', stagehand: 'Stagehand'};
const count = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid count');
  return value;
};
const empty = () => ({found: 0, role: 0, place: 0, remote: 0, no: 0, unknown: 0, relevant: 0});

/** Aggregate judged search rows; absent tool/persona pairs remain absent rather than becoming measured zeroes. */
export function searchSnapshot(judged) {
  if (!judged.length) throw new Error('No judged search files');
  const totals = new Map(), personas = [];
  let judgedJobs = 0, returnedRows = 0;
  for (const file of judged) {
    judgedJobs += count(file.judged_jobs);
    const tools = {};
    for (const row of file.rows) {
      if (!SEARCH[row.tool] || !['yes', 'no', 'unknown'].includes(row.role) || !['yes', 'no', 'remote', 'unknown'].includes(row.place)) throw new Error('Invalid tool or verdict');
      const t = (tools[row.tool] ||= empty());
      t.found++;
      t.role += Number(row.role === 'yes');
      t.place += Number(row.place === 'yes');
      t.remote += Number(row.place === 'remote');
      t.no += Number(row.place === 'no');
      t.unknown += Number(row.place === 'unknown');
      t.relevant += Number(row.role === 'yes' && row.place === 'yes');
      returnedRows++;
    }
    for (const [key, t] of Object.entries(tools)) {
      const total = totals.get(key) || {key, name: SEARCH[key], ...empty(), observedPersonas: 0};
      total.observedPersonas++;
      for (const metric of Object.keys(empty())) total[metric] += t[metric];
      totals.set(key, total);
    }
    personas.push({title: String(file.persona.title), city: String(file.persona.city), country: String(file.persona.country), judgedJobs: file.judged_jobs, tools});
  }
  return {judgedJobs, returnedRows, tools: [...totals.values()].sort((a, b) => b.found - a.found), personas};
}

/** Recompute scores from saved per-repeat counts; one observation never becomes a variability estimate. */
export function formSnapshot(scores) {
  const tools = Object.entries(scores).map(([key, saved]) => {
    if (!FORM[key] || !saved.runs?.length) throw new Error('Invalid tool or missing runs');
    const runs = saved.runs.map(r => {
      const [right, wrong, empty, notReached, forms] = ['right', 'wrong', 'emptyAnswerable', 'notReached', 'forms'].map(k => count(r[k]));
      const total = right + wrong + empty + notReached;
      if (!total || !forms) throw new Error('Empty scored run');
      return {right, wrong, empty, notReached, forms, score: Math.round(1000 * right / total) / 10};
    });
    const score = Math.round(10 * runs.reduce((sum, r) => sum + r.score, 0) / runs.length) / 10;
    return {key, name: FORM[key], score, repeats: runs.length, forms: runs[0].forms,
      spread: runs.length > 1 ? [Math.min(...runs.map(r => r.score)), Math.max(...runs.map(r => r.score))] : null,
      ...Object.fromEntries(['right', 'wrong', 'empty', 'notReached'].map(k => [k, runs.reduce((sum, r) => sum + r[k], 0)]))};
  });
  if (!tools.length) throw new Error('No scored tools');
  return {tools: tools.sort((a, b) => b.score - a.score)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [searchDir, scoreFile, out] = process.argv.slice(2);
  if (!searchDir || !scoreFile || !out) throw new Error('Usage: benchmark-snapshot.mjs <search-result-dir> <saved-score.json> <output.json>');
  const files = fs.readdirSync(searchDir).filter(name => /^persona-\d+\.json$/.test(name)).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const digest = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const snapshot = {schema: 1, date: '2026-10-27',
    search: {...searchSnapshot(files.map(f => read(path.join(searchDir, f)))), sources: files.map(f => ({file: f, sha256: digest(path.join(searchDir, f))}))},
    forms: {...formSnapshot(read(scoreFile)), runId: '40506831190', benchmarkCommit: '893082e8099f3b50d272b0b95b13fc680d727e9c',
      productBuild: 'ffb105dd6', round: '2026-W44', model: 'claude-haiku-5-5', sourceSha256: digest(scoreFile),
      newerUnjudgedRuns: ['40550905815', '40551759123']}};
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('benchmark snapshot: ' + snapshot.search.returnedRows + ' search rows; ' + snapshot.forms.tools.length + ' scored form tools');
}

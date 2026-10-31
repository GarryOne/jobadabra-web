// Reads the grey records of the e2e runs the hourly collector is reading: each grey job of the public repo uploads one tiny artifact "grey-<suite>" holding grey.json
// ({suite, reason}); desktop/e2e/lib/grey-record.mjs there is the one writer, flaky-proof.mjs --grey the one caller. The run, its day and its kind are stamped HERE from the run
// being read, never trusted from the artifact. Invariants: a run whose artifact list could not be read is returned in `failed` (the collector leaves it unsettled and reads it
// again next hour: a settled run is never read twice, so a silent miss would be lost for good); no run read at all gives rows undefined (unknown, never an empty ledger).
// Guard: test/admin/e2e-grey-ledger.test.js.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const execAsync = promisify(execFile);
export const PREFIX = 'grey-', FILE = 'grey.json';

/** runs: [{databaseId, createdAt, kind}]; deps list(runId) -> artifacts [{id, name, expired}], read(artifactId) -> parsed grey.json. Returns {rows, failed: Set<runId>}. */
export async function readGreyJobs(runs, {list, read}) {
  const rows = [], failed = new Set();
  let looked = 0;
  for (let at = 0; at < runs.length; at += 8) {
    await Promise.all(runs.slice(at, at + 8).map(async run => {
      try {
        const found = (await list(run.databaseId)).filter(item => typeof item?.name === 'string' && item.name.startsWith(PREFIX) && !item.expired);
        for (const item of found) {
          const record = await read(item.id);
          if (record && typeof record === 'object') rows.push({runId: run.databaseId, day: String(run.createdAt).slice(0, 10), kind: run.kind, suite: record.suite, reason: record.reason});
        }
        looked += 1;
      } catch { failed.add(run.databaseId); }
    }));
  }
  return {rows: looked ? rows : undefined, failed};
}

/** The GitHub transport: a run's artifacts, and one artifact's grey.json out of its zip (unzip -p; the zip stays in a temp folder). */
export function githubLedger(repo) {
  return {
    list: async runId => JSON.parse((await execAsync('gh', ['api', `repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`], {maxBuffer: 1 << 24, timeout: 60000})).stdout).artifacts || [],
    read: async id => {
      const dir = mkdtempSync(path.join(tmpdir(), 'grey-records-'));
      try {
        writeFileSync(path.join(dir, 'a.zip'), (await execAsync('gh', ['api', `repos/${repo}/actions/artifacts/${id}/zip`], {encoding: 'buffer', maxBuffer: 1 << 24, timeout: 60000})).stdout);
        return JSON.parse((await execAsync('unzip', ['-p', path.join(dir, 'a.zip'), FILE], {maxBuffer: 1 << 24})).stdout);
      } finally { rmSync(dir, {recursive: true, force: true}); }
    }
  };
}

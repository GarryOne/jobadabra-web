// The collector's read of the public repo's "grey-<suite>" artifacts (jobs/e2e-grey-ledger.mjs): the run, day and kind come from the run read, a failed read leaves the run unsettled.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readGreyJobs} from '../../jobs/e2e-grey-ledger.mjs';

const run = (databaseId, kind = 'pr', createdAt = '2026-11-01T10:00:00Z') => ({databaseId, kind, createdAt});
const art = (id, name, extra = {}) => ({id, name, expired: false, ...extra});

test('each grey artifact becomes a row stamped with its run, day and kind; other artifacts and expired ones are ignored', async () => {
  const files = {11: {suite: 'apply', reason: 'timing', runId: 999, kind: 'beta', day: '2020-01-01'}, 12: {suite: 'settings', reason: 'picker'}};
  const {rows, failed} = await readGreyJobs([run(1), run(2, 'scheduled', '2026-11-02T01:00:00Z')], {
    list: async id => (id === 1 ? [art(11, 'grey-apply'), art(13, 'e2e-artifacts-apply'), art(14, 'grey-old', {expired: true})] : [art(12, 'grey-settings')]), read: async id => files[id]});
  assert.deepEqual(rows, [{runId: 1, day: '2026-11-01', kind: 'pr', suite: 'apply', reason: 'timing'}, {runId: 2, day: '2026-11-02', kind: 'scheduled', suite: 'settings', reason: 'picker'}],
    'run, day and kind never come from the artifact');
  assert.equal(failed.size, 0);
});

test('a run with no grey artifact was looked at: [] is evidence of none for it; reading nothing at all is unknown (undefined)', async () => {
  assert.deepEqual((await readGreyJobs([run(1)], {list: async () => [art(1, 'e2e-artifacts-apply')], read: async () => ({})})).rows, []);
  assert.equal((await readGreyJobs([], {list: async () => [], read: async () => ({})})).rows, undefined);
});

test('a run whose artifacts could not be read is reported failed, never counted as having none', async () => {
  const {rows, failed} = await readGreyJobs([run(1), run(2)], {list: async id => { if (id === 1) throw new Error('rate limit'); return []; }, read: async () => ({})});
  assert.deepEqual([...failed], [1]);
  assert.deepEqual(rows, []);
  const allFailed = await readGreyJobs([run(1)], {list: async () => { throw new Error('x'); }, read: async () => ({})});
  assert.equal(allFailed.rows, undefined, 'nothing read: unknown');
  const unreadable = await readGreyJobs([run(1)], {list: async () => [art(1, 'grey-apply')], read: async () => { throw new Error('download'); }});
  assert.deepEqual([...unreadable.failed], [1], 'an artifact that cannot be downloaded fails its run: it is read again');
});

test('an artifact whose content can never parse is skipped and logged: its run settles and its other records are kept (Gitar, #237)', async () => {
  const never = () => Object.assign(new Error('no readable grey.json'), {transient: false});
  const {rows, failed} = await readGreyJobs([run(1)], {list: async () => [art(1, 'grey-bad'), art(2, 'grey-good')], read: async id => { if (id === 1) throw never(); return {suite: 'apply', reason: 'timing'}; }});
  assert.equal(failed.size, 0, 'a permanent parse failure never leaves the run unsettled');
  assert.deepEqual(rows.map(row => row.suite), ['apply']);
});

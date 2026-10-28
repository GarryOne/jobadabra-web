// /about-you lists exactly the live AI steps of the public export (docs/about-you-readers.json) and marks a part read only where the export says so; "the site has everything public lists" (owner, 21 Oct 2026).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {readersTable} from '../../tools/readers-page.mjs';

const page = readFileSync(new URL('../../web/public/about-you.html', import.meta.url), 'utf8');
const data = JSON.parse(readFileSync(new URL('../../docs/about-you-readers.json', import.meta.url), 'utf8'));
const live = data.readers.filter(reader => reader.live);

test('the page holds the table drawn from the public export (run tools/readers-page.mjs after a step ships)', () => {
  assert.ok(live.length >= 2, 'positive control: the export has live steps');
  const drawn = page.match(/<!-- readers:start -->\n([\s\S]*?)\n<!-- readers:end -->/)[1];
  assert.equal(drawn, readersTable(data));
});

test('every live step has a row, no step that is not live does, and a dot is "on" only for a part in its `through`', () => {
  const rows = [...page.matchAll(/<tr data-step="([a-z_]+)">([\s\S]*?)<\/tr>/g)];
  assert.deepEqual(rows.map(row => row[1]), live.map(reader => reader.key));
  for (const [, key, body] of rows) {
    const reader = live.find(each => each.key === key);
    const on = [...body.matchAll(/aria-label="Reads ([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(on, data.parts.filter(part => reader.through.includes(part.key)).map(part => part.label), key);
  }
  for (const reader of data.readers.filter(each => !each.live)) assert.ok(!page.includes(`data-step="${reader.key}"`), `${reader.key} is not live`);
});

test('the Intelligence page links to it', () => {
  assert.match(readFileSync(new URL('../../web/public/intelligence.html', import.meta.url), 'utf8'), /href="\/about-you"/);
});

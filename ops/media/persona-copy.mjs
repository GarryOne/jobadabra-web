// The temp folder one recording runs on (media): desktop/demo, the persona's own files laid over it, and every date moved to the
// recording's week, so a calendar shows near-future interviews whenever main re-records. Pure parts guarded by desktop/test/media-persona.test.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days from the persona's anchor day (media.json "today") to `now`, in whole weeks: weekday names in its text ("Tue 13 Oct") stay right.
export function weekShift(anchor, now = new Date()) {
  if (!anchor) return 0;
  const days = (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(`${anchor}T00:00:00Z`)) / DAY;
  return Math.round(days / 7) * 7;
}

const moved = (year, month, day, days) => new Date(Date.UTC(year, month, day) + days * DAY);

// Every date in a text moved by `days`: ISO days (2026-10-12, also inside a timestamp) and "12 Oct" (read in `year`).
export function shiftDates(text, days, year) {
  if (!days) return text;
  return String(text)
    .replace(/\b(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (_, y, m, d) => moved(Number(y), Number(m) - 1, Number(d), days).toISOString().slice(0, 10))
    .replace(new RegExp(`\\b(\\d{1,2}) (${MONTHS.join('|')})\\b`, 'g'), (_, d, month) => {
      const date = moved(year, MONTHS.indexOf(month), Number(d), days);
      return `${String(date.getUTCDate()).padStart(d.length, '0')} ${MONTHS[date.getUTCMonth()]}`;
    });
}

// A moment's record edits over one file's JSON (owner, 24 Oct 2026: the same person "2 weeks later" for the Track clip). edits: {<key>: {<id>: fields}}, where
// <key> names a list ("." = the file itself is the list, e.g. runs.json), a map of records by id, or one record (found by its own id). A list record is found
// by its id, page_id or code; a field set to null is removed; _first moves it to the front, _drop removes it, _add creates it (round 2: the e-mail check
// run Track opens on). Pure.
const idOf = id => (/^\d+$/.test(id) ? Number(id) : id);
const merged = (old, set) => { const record = {...old, ...set}; for (const [field, value] of Object.entries(set)) if (value === null) delete record[field]; return record; };
export function applyEdits(json, edits) {
  const out = structuredClone(json);
  for (const [key, byId] of Object.entries(edits)) {
    const target = key === '.' ? out : out[key];
    if (target && !Array.isArray(target) && typeof target === 'object') {   // a map of records by id, or a single record
      for (const [id, fields] of Object.entries(byId)) {
        const {_add, ...set} = fields;
        if (target.id != null && String(target.id) === id) {
          Object.assign(target, set);
          for (const [field, value] of Object.entries(set)) if (value === null) delete target[field];
        } else if (target[id] || _add) target[id] = merged(target[id] || {}, set);
        else throw new Error(`media: moment: no record ${id} in ${key}`);
      }
      continue;
    }
    if (!Array.isArray(target)) throw new Error(`media: moment: ${key} is not a list`);
    let list = target;
    for (const [id, fields] of Object.entries(byId)) {
      const {_first, _drop, _add, ...set} = fields;
      let at = list.findIndex(record => [record.id, record.page_id, record.code].some(value => value != null && String(value) === id));
      if (at < 0 && _add) { list = [...list, ['id', 'page_id', 'code'].some(field => field in set) ? {} : {id: idOf(id)}]; at = list.length - 1; }
      if (at < 0) throw new Error(`media: moment: no record ${id} in ${key}`);
      if (_drop) { list = list.filter((_, i) => i !== at); continue; }
      const record = merged(list[at], set);
      list = _first ? [record, ...list.filter((_, i) => i !== at)] : list.map((old, i) => (i === at ? record : old));
    }
    if (key === '.') return list;
    out[key] = list;
  }
  return out;
}

// -> the temp folder: the app's demo files, then the persona's (a persona lists only what it changes), dates shifted. media.json and moments/ stay out;
// `moment` lays <persona>/moments/<moment>.json (record edits per file, applyEdits) over the copy, its dates shifted the same way.
export function personaCopy({folder, today}, {demo, now = new Date(), moment = null}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-media-'));
  const days = weekShift(today, now), year = Number(String(today || '').slice(0, 4)) || now.getFullYear();
  for (const source of [...new Set([path.resolve(demo), path.resolve(folder)])]) {
    for (const file of fs.readdirSync(source)) {
      const from = path.join(source, file);
      if (file === 'media.json' || file === 'moments') continue;
      if (fs.statSync(from).isDirectory()) { fs.cpSync(from, path.join(data, file), {recursive: true}); continue; }   // config/: the engine's settings
      if (/\.(json|jsonl|md)$/.test(file)) fs.writeFileSync(path.join(data, file), shiftDates(fs.readFileSync(from, 'utf8'), days, year));
      else fs.copyFileSync(from, path.join(data, file));
    }
  }
  if (moment) {
    const file = path.join(folder, 'moments', `${moment}.json`);
    if (!fs.existsSync(file)) { fs.rmSync(data, {recursive: true, force: true}); throw new Error(`media: ${path.basename(folder)} has no moment ${moment} (moments/${moment}.json)`); }
    for (const [name, edits] of Object.entries(JSON.parse(shiftDates(fs.readFileSync(file, 'utf8'), days, year)))) {
      const target = path.join(data, name);
      fs.writeFileSync(target, `${JSON.stringify(applyEdits(JSON.parse(fs.readFileSync(target, 'utf8')), edits), null, 1)}\n`);
    }
  }
  return data;
}

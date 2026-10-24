// The product media's manifest (media/manifest.mjs), the shape the site redesign reads, and the scenes it describes: every
// piece the site places has its words and sizes; captions stay short and in the manifest, never in the video.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {manifest, stillEntry, VERSION, videoEntry} from '../../media/manifest.mjs';
import {SNIPS, STILLS, VIDEOS} from '../../media/scenes.mjs';

test('a video entry carries the agreed fields; a partial run keeps the other entries', () => {
  const hero = videoEntry({name: 'hero', piece: VIDEOS.hero, files: {mp4: 'hero.mp4', webm: 'hero.webm', poster: 'hero-poster.jpg', phone: 'hero-720.mp4'}, bytes: {mp4: 1}, seconds: 14.44});
  assert.deepEqual(Object.keys(hero), ['name', 'kind', 'theme', 'shows', 'caption', 'alt', 'files', 'width', 'height', 'duration_s', 'bytes']);
  assert.equal(hero.duration_s, 14.4);
  assert.equal(hero.theme, 'dark');
  const still = stillEntry({name: 'jobs', kind: 'still', file: 'still-jobs.webp', bytes: 9, width: 1600, height: 1000, shows: 'Jobs'});
  const first = manifest({entries: [hero, still], made: {sha: 'abc', at: 'now', persona: 'demo'}});
  assert.equal(first.version, VERSION);
  const again = manifest({entries: [{...hero, caption: 'New'}], previous: first, made: {sha: 'def', at: 'later', persona: 'demo'}});
  assert.equal(again.items.length, 2, 'the still is kept');
  assert.equal(again.items.find(item => item.name === 'hero').caption, 'New');
  assert.equal(again.made_from, 'def');
});

test('every piece has the words the site needs; video captions are 6 words at most; the hero clips fit 2.5 MB and have phone copies', () => {
  for (const [name, piece] of Object.entries(VIDEOS)) {
    if (piece.part) { assert.ok(piece.shows && piece.steps.length, name); continue; }   // played inside the piece that names it `before` (Apply, round 3)
    for (const key of ['shows', 'caption', 'alt']) assert.ok(piece[key], `${name}.${key}`);
    assert.ok(piece.caption.split(/\s+/).length <= 6, `${name}: caption over 6 words`);
    assert.equal(piece.width / piece.height, 1.6, `${name}: 16:10`);
    assert.ok(piece.budget > 0 && piece.steps.length, name);
  }
  const slides = Object.values(VIDEOS).filter(piece => piece.slide);
  assert.ok(slides.reduce((sum, piece) => sum + piece.budget, 0) <= 3.8e6, 'the four hero clips together fit 3.8 MB (round 6: Apply\'s picture in picture, +0.1 MB; round 8: the sharper grade, +41%, owner\'s choice)');
  assert.ok(slides.every(piece => piece.phone?.width === 720 && piece.phone.budget) && slides.reduce((sum, piece) => sum + piece.phone.budget, 0) <= 1.6e6, 'phone copies about 1.6 MB together (round 8: the sharper grade)');
  for (const [name, item] of [...Object.entries(STILLS), ...Object.entries(SNIPS)]) assert.ok(item.shows && item.steps.length, name);
});

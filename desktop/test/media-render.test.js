// A render that ends short never passes as done (round 9, 24 Oct 2026: the phone copy's renderer quit 17 frames in with exit 0 on a Mac low on
// memory; the clip came out 0.4 s long and only a missing poster stopped the run): runRender counts the frames it got and renders again once.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

const read = file => fs.readFileSync(new URL(`../../media/${file}`, import.meta.url), 'utf8');

test('runRender checks the frame count of what it made against the job, renders once more, then stops the piece', () => {
  const media = read('media.mjs');
  assert.match(media, /const made = fs\.existsSync\(job\.out\) \? framesIn\(job\.out\) : 0;\n\s+if \(made === job\.frames\.length\) return job\.out;/);
  assert.match(media, /if \(attempt >= tries\) throw new Error\(`media: \$\{name\}: \$\{path\.basename\(job\.out\)\} has \$\{made\} of/);
});

test('a renderer that is gone fails the render instead of ending it', () => {
  assert.match(read('render.cjs'), /win\.webContents\.on\('render-process-gone', [^\n]*app\.exit\(1\)/);
});

test('framesIn counts a video\'s frames', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-in-')), file = path.join(dir, 'clip.mp4');
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x48:r=30:d=0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
    const {framesIn} = await import('../../media/encode.mjs');
    assert.equal(framesIn(file), 12);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// Speed (round 9, owner: "Is there anyway we can speed up the recording process? ... can we parallelize it more?"): renders were ~80% of a redo,
// one copy at a time on one core. Every take is recorded and checked first, then every copy renders, a few at once.
test('the render queue runs at most n jobs at once and every job ends', async () => {
  const {limiter} = await import('../../media/renders.mjs');
  const run = limiter(3);
  let now = 0, most = 0;
  const job = ms => run(async () => { now++; most = Math.max(most, now); await new Promise(resolve => setTimeout(resolve, ms)); now--; return ms; });
  const done = await Promise.all([30, 10, 20, 5, 15, 25, 10, 5].map(job));
  assert.deepEqual(done, [30, 10, 20, 5, 15, 25, 10, 5]);
  assert.equal(most, 3);
  await assert.rejects(run(async () => { throw new Error('bad'); }), /bad/);
  assert.equal(await job(1), 1, 'a failed job frees its slot');
});

test('every check runs before any render: a clip and picture in picture return a finish(), main renders all pieces after all takes', () => {
  const media = read('media.mjs');
  const clip = media.slice(media.indexOf('async function recordClip'), media.indexOf('function edgesOk'));
  const checks = clip.indexOf('checked();'), plan = clip.indexOf('planStrays(', checks), finish = clip.indexOf('// -> finish()', plan);
  assert.ok(checks > 0 && plan > checks && finish > plan && finish < clip.indexOf('await Promise.all([render(main'), 'recordClip: checks, the plan\'s stray frames (prestray.mjs), then renders');
  const pip = media.slice(media.indexOf('async function recordPip'), media.indexOf('function joined'));
  assert.ok(pip.indexOf('edgesOk(rec.name') < pip.indexOf('await Promise.all([compose('), 'recordPip: checks, then renders');
  assert.match(media, /const finishes = await settled\(options\.pieces[^\n]*makeVideo\(/);
  assert.match(media, /entries\.push\(\.\.\.await settled\(finishes\.map\(finish => finish\(\)\)\)\)/);
  assert.match(media, /return renderQueue\(async \(\) => \{ for \(let attempt = 1; ; attempt\+\+\) \{\n\s+const run = await runChild\(/, 'every render goes through the queue');
});

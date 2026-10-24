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

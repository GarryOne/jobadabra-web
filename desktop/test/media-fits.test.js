// The desktop hero's depth gate (media/fits.mjs; owner, 25 Oct 2026: "zoom deeper, about 1.5x"): a look that ends below 1.5x stops the piece.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MIN_ZOOM, shallowLooks, widestAt} from '../../media/fits.mjs';
import {VIDEOS} from '../../media/scenes.mjs';

const viewport = {w: 1440, h: 900};
const logOf = (width, extra = {}) => ({viewport, frames: [{t: 0, file: 'a'}, {t: 3, file: 'b'}], events: [{t: 0, type: 'hold', look: 'x', s: 3, zoom: 2.2, box: {x: 20, y: 300, width, height: 120}, ...extra}]});

test('a look wider than 1.5x shows is named with the width that fits', () => {
  const [hit] = shallowLooks(logOf(1100));
  assert.equal(hit.look, 'x');
  assert.ok(hit.used < MIN_ZOOM && hit.fits === widestAt(MIN_ZOOM, viewport), `${hit.used} ${hit.fits}`);
});

test('a look that fits 1.5x, or says wide, passes', () => {
  assert.deepEqual(shallowLooks(logOf(widestAt(MIN_ZOOM, viewport) - 2)), []);
  assert.deepEqual(shallowLooks(logOf(1300, {wide: true})), []);
});

// The class: no desktop look in a scene asks below the bar unless it says wide (a look that asks 1.3 can never end deeper).
test('every hero look asks at least MIN_ZOOM, unless it is a whole-screen look', () => {
  for (const [name, piece] of Object.entries(VIDEOS)) {
    for (const step of piece.steps.filter(each => each.hold && each.look && each.zoom && each.zoom !== 1)) {
      assert.ok(step.zoom >= MIN_ZOOM || step.wide, `${name}: ${step.beat || JSON.stringify(step.look)} asks ${step.zoom}: ask ${MIN_ZOOM}+ or say wide: true`);
    }
  }
});

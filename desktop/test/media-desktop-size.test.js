// Guards the hero's bigger desktop text (owner, 25 Oct 2026: "lower the window size, so that we can have bigger text. And/or to zoom in more
// agressively where the click goes"): every hero piece that records the app runs it at text size 1 (a 1440-px page, not 1800), and every hero
// click zooms in to TAP_ZOOM. Loops over the scenes, so a new hero piece or tap is checked too.
import assert from 'node:assert/strict';
import test from 'node:test';

test('every hero app take runs the app at desktop text size 1; the phone take keeps its own; other media are untouched (hold.mjs desktopTake)', async () => {
  const {VIDEOS} = await import('../../media/scenes.mjs');
  const {desktopTake, phoneTake} = await import('../../media/hold.mjs');
  const hero = Object.entries(VIDEOS).filter(([name, piece]) => name.startsWith('hero') && piece.source === 'app');
  assert.ok(hero.length >= 5, `${hero.length} hero app pieces`);
  for (const [name, piece] of hero) {
    assert.equal(desktopTake(piece).settings?.zoom, 1, `${name}: desktop text size`);
    for (const [key, value] of Object.entries(piece.settings || {})) assert.equal(desktopTake(piece).settings[key], value, `${name}: keeps ${key}`);
    if (typeof piece.phone === 'object') assert.equal(phoneTake(piece, piece.phone).settings.zoom, piece.phone.zoom, `${name}: the phone take keeps its own size`);
  }
  for (const [name, piece] of Object.entries(VIDEOS).filter(([n, p]) => !n.startsWith('hero') || p.source !== 'app')) assert.equal(desktopTake(piece), piece, `${name}: untouched`);
});

test('a hero click zooms in to TAP_ZOOM wherever its part still has its one deliberate move (scenes.mjs, camera.mjs)', async () => {
  const {VIDEOS, partsOf, TAP_ZOOM} = await import('../../media/scenes.mjs');
  const {MAX_ZOOM} = await import('../../media/camera.mjs');
  assert.ok(TAP_ZOOM <= MAX_ZOOM && TAP_ZOOM >= 2.8);
  let zoomed = 0;
  for (const name of ['hero-onboarding', 'hero', 'hero-fill', 'hero-track']) for (const part of partsOf(name)) {
    const steps = VIDEOS[part].steps, lookMoves = steps.filter(step => step.look).slice(1).filter(step => !step.cut).length;
    const taps = steps.filter(step => step.tap && !step.then?.toString().includes('jump'));   // a tap that cuts away at once shows no zoom
    for (const step of steps.filter(step => step.tap && step.zoom)) { assert.equal(step.zoom, TAP_ZOOM, `${part}: tap ${step.tap}`); zoomed++; }
    if (lookMoves === 0 && taps.length) assert.ok(taps.some(step => step.zoom === TAP_ZOOM), `${part}: its one move is free, so a click zooms`);
  }
  assert.ok(zoomed >= 2, `${zoomed} clicks zoom`);
});

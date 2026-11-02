// A words-only redo of the hero (media; owner, 24 Oct 2026: "you should have rerecord just one 1/4 clips"): the captions, tags and title cards are
// drawn on the recorded frames, so a change of words needs no new recording. rewordLog puts the scenes' current words on a kept recording's log
// (<set>/.work/<piece>/log.json, hero.sh keeps it), hold by hold; a changed look or step count means the recording no longer fits: record again.
// Used by media.mjs --words <set dir>. Pure. Guard: desktop/test/media-words.test.js.

const WORDS = ['say', 'tag', 'card'];

// The log with each hold's words from the piece's hold steps (in order). -> the log; throws when the steps changed beyond words.
export function rewordLog(log, piece, name = 'piece') {
  const holds = log.events.filter(event => event.type === 'hold'), steps = piece.steps.filter(step => step.hold);
  if (holds.length !== steps.length) throw new Error(`media: ${name}: ${steps.length} holds in scenes.mjs, ${holds.length} in the kept recording: the steps changed beyond words, record it again`);
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  steps.forEach((step, k) => {
    if (!same(step.look, holds[k].look)) throw new Error(`media: ${name}: hold ${k + 1} looks at ${JSON.stringify(step.look)} now, ${JSON.stringify(holds[k].look)} when recorded: record it again`);
  });
  let k = 0;
  const events = log.events.map(event => {
    if (event.type !== 'hold') return event;
    const step = steps[k++], out = {...event};
    for (const word of WORDS) delete out[word];
    if (step.say) out.say = step.say;
    if (step.tag) out.tag = step.tag;
    if (out.into === 'card') out.card = {tag: step.tag || '', text: step.card || ''};
    return out;
  });
  return {...log, events};
}

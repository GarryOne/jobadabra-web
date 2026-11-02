// The hero's on-video captions (round 3, owner 24 Oct 2026: "we need to explain the journey better"): a scene step's `say` shows from that step's
// moment (a cut look's from its cut) until the next caption, as a band the renderer draws (render.cjs). A step's `tag` (round 4, owner 24 Oct 2026: "we need to
// highlight each of the steps") names where the frame is (SET UP 1/5, JOBS, CHROME) in the same band, kept until a step names another. Pure.
// Guard: desktop/test/media-captions.test.js.
import {cutTime} from './cuts.mjs';

export const SAY_MAX = 44;     // characters: one line, read in about a second
export const SAY_FADE = 0.25;  // recorded seconds a caption fades in
export const TAG_MAX = 12;     // characters: a place's name or a step count, never a sentence

// log (after dropChanges) -> [{t, say, tag?}] in time order, each with the latest tag so far. Pure.
export function captionTimes(log) {
  let tag;
  return log.events.map((event, i) => (event.say ? {t: event.type === 'hold' && event.cut ? cutTime(log, i) : event.t, say: event.say, tag: event.tag} : null))
    .filter(Boolean).sort((a, b) => a.t - b.t)
    .map(({tag: own, ...caption}) => { tag = own || tag; return tag ? {...caption, tag} : caption; });
}

// The caption on screen at recorded time t: {say, sayAge} or {} before the first. Pure.
export function captionAt(list, t) {
  const on = list.filter(caption => caption.t <= t + 1e-9).at(-1);
  return on ? {say: on.say, sayAge: Number((t - on.t).toFixed(3)), ...(on.tag ? {tag: on.tag} : {})} : {};
}

// The caption's size in output pixels: the desktop copy is seen at about 70% of its width, the phone copy at about 54% (390 of 720 px). Pure.
export const captionSize = (width, phone) => Math.round(width * (phone ? 0.056 : 0.0175));

// Phones show the captions under the video, not on it (round 9, owner 24 Oct 2026: "move the subtitles/captions out of the video ... at least on
// mobile, they hide some buttons/actions"): the phone copy is drawn without them (media.mjs), and the site reads them from a WebVTT file beside the
// clip (<track kind="metadata">, web/public/hero-stage.js). sayTrack reads the desktop copy's drawn frames: each change of caption, in played seconds.
// frames: [{say?, tag?}] at `fps` in recorded time; speed: how much faster the clip plays. -> [{t, say, tag?}]. Pure.
export function sayTrack(frames, fps, speed = 1) {
  const out = [];
  frames.forEach((frame, i) => {
    const say = frame.say || null, tag = (say && frame.tag) || null, last = out.at(-1);
    if (last ? last.say === say && (last.tag || null) === tag : !say) return;
    out.push({t: Number((i / fps / speed).toFixed(3)), say, ...(tag ? {tag} : {})});
  });
  return out;
}

const stamp = s => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = (ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`; };
// The track as WebVTT: one cue per caption until the next (or the clip's end), its text the JSON {say, tag}. -> string. Pure.
export function vttOf(track, seconds) {
  const cues = track.map((cue, i) => ({...cue, end: track[i + 1]?.t ?? seconds})).filter(cue => cue.say && cue.end > cue.t);
  return `WEBVTT\n\n${cues.map(cue => `${stamp(cue.t)} --> ${stamp(cue.end)}\n${JSON.stringify(cue.tag ? {tag: cue.tag, say: cue.say} : {say: cue.say})}`).join('\n\n')}\n`;
}

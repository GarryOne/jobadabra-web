// The demo's grade (owner, 24 Oct 2026: "it looks washed, it doesn't have a high contrast"; option C of three shown side by side): the recording is
// the app's exact pixels (card #121a23 captured 19,26,34), but its dark cards sit close to the page and the camera's zoom softens the text. Deeper
// blacks and brighter grey text, a little more colour, sharper text: applied by render.cjs to the APP's pixels only, before the captions, step tags,
// title cards and cursor are drawn (a whole-frame grade turned the brand amber 255,178,36 into 255,204,0). Pure. Guard: desktop/test/media-grade.test.js.

// ffmpeg's curves=all='0/0 0.06/0.03 0.25/0.24 0.6/0.7 1/1' (the approved option C), sampled at 17 even steps: an SVG table interpolates between them.
export const GRADE = {
  table: [0, 0.031, 0.086, 0.157, 0.243, 0.329, 0.42, 0.506, 0.588, 0.659, 0.722, 0.78, 0.835, 0.882, 0.922, 0.961, 1],
  saturate: 1.25,
  sharpen: 0.22,   // a 3x3 unsharp: the centre 1 + 4a, its four neighbours -a
};

// The SVG filter render.cjs puts in its page and draws the app's pixels through (ctx.filter = 'url(#grade)'). sRGB: the app's CSS colours. -> markup.
export function gradeSvg(grade = GRADE) {
  const table = grade.table.join(' '), a = grade.sharpen, funcs = ['R', 'G', 'B'].map(c => `<feFunc${c} type="table" tableValues="${table}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><filter id="grade" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">`
    + `<feComponentTransfer>${funcs}</feComponentTransfer><feColorMatrix type="saturate" values="${grade.saturate}"/>`
    + `<feConvolveMatrix order="3" kernelMatrix="0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0" edgeMode="duplicate" preserveAlpha="true"/></filter></svg>`;
}

// One flat colour through the table and the saturation, as the SVG spec computes them (no sharpening: a flat area has no edge). [r, g, b] 0-255. Pure.
export function gradeColour([r, g, b], grade = GRADE) {
  const n = grade.table.length - 1;
  const curve = v => { const x = v / 255 * n, i = Math.min(n - 1, Math.floor(x)); return grade.table[i] + (grade.table[i + 1] - grade.table[i]) * (x - i); };
  const [R, G, B] = [r, g, b].map(curve), s = grade.saturate;
  const out = [
    (0.213 + 0.787 * s) * R + (0.715 - 0.715 * s) * G + (0.072 - 0.072 * s) * B,
    (0.213 - 0.213 * s) * R + (0.715 + 0.285 * s) * G + (0.072 - 0.072 * s) * B,
    (0.213 - 0.213 * s) * R + (0.715 - 0.715 * s) * G + (0.072 + 0.928 * s) * B];
  return out.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255));
}

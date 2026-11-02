// The form states a `review` step sends the app (media): one more field filled each time, as the extension reports a fill (extension/review.js),
// the last one Ready to submit. record-app.mjs sends each over the app's own 'review' message; the Applying page's form card follows. Pure.
// Guarded by desktop/test/media-live-review.test.js.

// {id, url, fields: [label...], every?} -> [{id, url, left, total, ready, filled: [{label, at}], missing, pending, states, proposals, optional}]
export function liveStates({id, url = '', fields, start = 0, every = 300}) {
  if (!id || !fields?.length) throw new Error('media: a review step names its session id and the fields it fills (scenes.mjs)');
  const total = fields.length;
  return fields.map((_, i) => {
    const filled = fields.slice(0, i + 1).map((label, j) => ({label, at: start + j * every}));
    const left = fields.slice(i + 1);
    return {id, url, left: left.length, total, ready: !left.length, filled, missing: left, pending: left, states: {}, proposals: [], optional: []};
  });
}

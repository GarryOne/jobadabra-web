// Refuses a Codex reply that could carry the login out: the last layer when a prompt injection (PR text, a screenshot) talks the model into printing a credential.
// Why (28 Oct 2026, Gitar on #2375): a read-only sandbox blocks writes, not reads; shell tool off + unprivileged user + egress list + this refusal are the layers.
const MAX_REPLY = 20000;
// Token-shaped: a JWT (eyJ.xxx.yyy), a long unbroken base64/url-safe run, or the login file's own field names.
const SHAPES = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/, 'a JWT'],
  [/[A-Za-z0-9+/_-]{100,}={0,2}/, 'a long base64 run'],
  [/"?(refresh_token|access_token|id_token|OPENAI_API_KEY)"?\s*[:=]/i, 'a login field name'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API key'],
];

/** Takes the reply text; returns null when it is fine, else the reason word the job shows ("reply-refused: <why>"). Never returns the matched text. */
export function refuseReply(text) {
  const s = String(text ?? '');
  if (s.length > MAX_REPLY) return `reply-refused: over ${MAX_REPLY} characters`;
  for (const [shape, what] of SHAPES) if (shape.test(s)) return `reply-refused: looks like ${what}`;
  return null;
}

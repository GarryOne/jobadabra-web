// "Connect with Notion" for the desktop app (Notion's public-connection OAuth). The app never holds the
// connection's secret: it opens /api/notion/start with a random session id, Notion sends the user back to
// /api/notion/callback, this Worker trades the one-time code for the user's token and keeps it in KV for 10
// minutes under a hash of the session id; the app then collects it once with POST /api/notion/token (deleted
// on read). Configuration: NOTION_CLIENT_ID (var) and NOTION_CLIENT_SECRET (secret); see workers/www/wrangler.toml. With the
// connection's template URL set, Notion copies the Jobadabra template for the user and the token carries
// duplicated_template_id, which the app builds on (desktop/lib/notion-workspace.js).
import {cardPage} from '../shared/card-page.js';
const TTL = 600;
const SESSION = /^[A-Za-z0-9_-]{32,128}$/;
export const CALLBACK = '/api/notion/callback';

const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const page = (title, text, ok) => cardPage({title, body: `<p>${text}</p>`, tone: ok ? 'ok' : 'bad', status: ok ? 200 : 400});   // the site's one card (shared/card-page.js)
const configured = env => env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET && env.WAITLIST;

// GET /api/notion/start?session=… -> Notion's consent page.
export function start(request, env) {
  const url = new URL(request.url);
  const session = url.searchParams.get('session') || '';
  if (!configured(env)) return page('Not available yet', 'Connect with Notion isn\'t set up on this server. In the app, use "Paste a token instead".', false);
  if (!SESSION.test(session)) return page('Something went wrong', 'Start again from the Jobadabra app.', false);
  const authorize = new URL('https://api.notion.com/v1/oauth/authorize');
  authorize.search = new URLSearchParams({client_id: env.NOTION_CLIENT_ID, response_type: 'code', owner: 'user',
    redirect_uri: url.origin + CALLBACK, state: session}).toString();
  return Response.redirect(authorize.toString(), 302);
}

// GET /api/notion/callback?code=…&state=… (from Notion) -> the token, kept for the app to collect.
export async function callback(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const session = url.searchParams.get('state') || '';
  if (url.searchParams.get('error')) return page('Not connected', 'You cancelled on Notion\'s page. Go back to Jobadabra and try again.', false);
  if (!configured(env) || !SESSION.test(session) || !url.searchParams.get('code')) return page('Something went wrong', 'Start again from the Jobadabra app.', false);
  const response = await fetcher('https://api.notion.com/v1/oauth/token', {method: 'POST', headers: {
    Authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28'},
    body: JSON.stringify({grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: url.origin + CALLBACK})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) return page('Not connected', `Notion said: ${String(data.message || data.error || response.status).slice(0, 200)}. Try again from the app.`, false);
  const keep = {access_token: data.access_token, workspace_name: data.workspace_name || '', workspace_id: data.workspace_id || '',
    duplicated_template_id: data.duplicated_template_id || null, ...(data.refresh_token ? {refresh_token: data.refresh_token} : {})};
  await env.WAITLIST.put(`notion:${await sha256(session)}`, JSON.stringify(keep), {expirationTtl: TTL});
  return page('Connected to Notion ✓', `${data.workspace_name ? `${data.workspace_name} is connected. ` : ''}Go back to Jobadabra: it takes it from here. You can close this tab.`, true);
}

// POST /api/notion/token {session} -> {ok, pending} until the user has approved, then the token (once).
export async function collect(request, env) {
  if (request.method !== 'POST') return json(405, {ok: false, error: 'Use POST'});
  let body = {};
  try { body = await request.json(); } catch {}
  if (!SESSION.test(String(body.session || ''))) return json(400, {ok: false, error: 'Bad session'});
  if (!configured(env)) return json(503, {ok: false, error: 'Connect with Notion is not set up on this server'});
  const key = `notion:${await sha256(body.session)}`;
  const kept = await env.WAITLIST.get(key);
  if (!kept) return json(200, {ok: false, pending: true});
  await env.WAITLIST.delete(key);
  return json(200, {ok: true, ...JSON.parse(kept)});
}

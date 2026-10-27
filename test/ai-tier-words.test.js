// The site explains the Free/Pro AI quality distinction and the final sketch matches the shipped routing and measured credit estimate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {PRO_ROUTES} from '../shared/pro-claude.js';
import {purchaseCreditWords} from '../shared/credit-purchase-words.js';
import {applicationsFor, APPLICATION_RAW_USD} from '../desktop/renderer/credit-buys.js';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pages = ['pricing', 'faq', 'index', 'download', 'intelligence', 'platforms', 'compare', 'trust', 'friends', 'terms'];

test('each Free tier explanation names the weaker AI quality', () => {
  for (const page of pages) assert.ok(read(`web/public/${page}.html`).includes('a bit weaker than Pro AI'), page);
});

test('the primary upgrade explanations tie smarter in-house AI to available credit', () => {
  for (const page of ['pricing', 'faq', 'index', 'download', 'intelligence']) {
    assert.match(read(`web/public/${page}.html`), /smarter in-house AI while you have credit/i, page);
  }
  assert.match(purchaseCreditWords('pro-ai'), /smarter in-house AI while you have credit/i);
  assert.equal(purchaseCreditWords('pro'), '', 'Pro alone does not grant AI credit');
});

test('the final sketch lists current routes and shared credit counts without a universal quality percentage', () => {
  const html = read('preview/ai-tier-final.html');
  for (const [action, route] of Object.entries(PRO_ROUTES)) assert.ok(html.includes(`data-action="${action}" data-model="${route.model}"`), action);
  for (const amount of [5, 10, 20]) assert.ok(html.includes(`€${amount}: about ${applicationsFor(amount)} applications`));
  assert.ok(html.includes(`$${APPLICATION_RAW_USD.toFixed(4)}`), 'the cost matches measured tokens');
  assert.match(html, /Owner choice/);
  assert.match(html, /Judge bias/);
  assert.match(html, /Production validation was not performed/);
  assert.doesNotMatch(html, /\d+% smarter|2\.4x|Opus on cover letters/);
});

// Intelligence was three pages and an Overview; the owner spread them out (2 Nov 2026: "Intelligence is very thin, let's spread the tabs/pages in Intelligence to others...
// Probably most of them will go in Growth"; preview pick "AI cost into Growth too"). Insights, Product Brain and AI cost live in Growth. The old addresses still answering are asserted in test/admin/admin-urls.test.js (the one file allowed to name them).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GROUPS, PAGES} from '../../admin/admin.js';
import {HEADLINES} from '../../admin/headlines.js';
import {headlinePages} from '../../admin/section-overview.js';

test('there is no Intelligence group; Insights, Product Brain and AI cost are Growth pages at /admin/growth/…', () => {
  assert.ok(!GROUPS.some(([name]) => name === 'Intelligence'), 'the group is gone');
  assert.ok(!PAGES.some(page => page.group === 'Intelligence' || page.path.split('/')[2] === 'intelligence'), 'no page keeps the old group');
  for (const slug of ['insights', 'brain', 'ai-cost']) assert.equal(PAGES.find(page => page.path === `/admin/growth/${slug}`)?.group, 'Growth', slug);
  assert.equal(PAGES.filter(page => page.group === 'Growth').length, 10);
});

test('Growth\'s Overview has a tile for each of the moved pages', () => {
  const paths = headlinePages('Growth').map(page => page.path);
  for (const slug of ['insights', 'brain', 'ai-cost']) assert.ok(paths.includes(`/admin/growth/${slug}`) && typeof HEADLINES[`/admin/growth/${slug}`] === 'function', slug);
  assert.ok(!Object.keys(HEADLINES).some(path => path.split('/')[2] === 'intelligence'), 'no headline keeps the old group');
});

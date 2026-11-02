// Intelligence was three pages and an Overview; the owner spread them out (2 Nov 2026: "Intelligence is very thin, let's spread the tabs/pages in Intelligence to others...
// Probably most of them will go in Growth"; preview pick "AI cost into Growth too"). Insights, Product Brain and AI cost live in Growth; every old address keeps answering.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GROUPS, PAGES, movedTo, oldPaths} from '../../admin/admin.js';
import {HEADLINES} from '../../admin/headlines.js';
import {headlinePages} from '../../admin/section-overview.js';

test('there is no Intelligence group; Insights, Product Brain and AI cost are Growth pages at /admin/growth/…', () => {
  assert.ok(!GROUPS.some(([name]) => name === 'Intelligence'), 'the group is gone');
  assert.ok(!PAGES.some(page => page.group === 'Intelligence' || page.path.startsWith('/admin/intelligence')), 'no page keeps the old group');
  for (const slug of ['insights', 'brain', 'ai-cost']) assert.equal(PAGES.find(page => page.path === `/admin/growth/${slug}`)?.group, 'Growth', slug);
  assert.equal(PAGES.filter(page => page.group === 'Growth').length, 10);
});

test('every Intelligence address, old and new, is one hop from a live Growth address', () => {
  const expect = {'/admin/intelligence/insights': '/admin/growth/insights', '/admin/intelligence/brain': '/admin/growth/brain', '/admin/intelligence/ai-cost': '/admin/growth/ai-cost',
    '/admin/insights': '/admin/growth/insights', '/intel': '/admin/growth/insights', '/admin/brain': '/admin/growth/brain', '/admin/ai-cost': '/admin/growth/ai-cost', '/ai-cost': '/admin/growth/ai-cost',
    '/admin/intelligence/overview': '/admin/growth/overview', '/admin/intelligence-overview': '/admin/growth/overview', '/admin/intelligence': '/admin/growth/overview'};
  for (const [old, now] of Object.entries(expect)) assert.equal(movedTo(old), now, old);
  for (const old of Object.keys(expect)) assert.ok(old === '/admin/intelligence' || oldPaths().includes(old), `${old} is listed as an old address`);
});

test('Growth\'s Overview has a tile for each of the moved pages', () => {
  const paths = headlinePages('Growth').map(page => page.path);
  for (const slug of ['insights', 'brain', 'ai-cost']) assert.ok(paths.includes(`/admin/growth/${slug}`) && typeof HEADLINES[`/admin/growth/${slug}`] === 'function', slug);
  assert.ok(!Object.keys(HEADLINES).some(path => path.startsWith('/admin/intelligence')), 'no headline keeps the old group');
});

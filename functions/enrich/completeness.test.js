import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsEnrichment } from './completeness.js';

const full = { title: 'T', creator: ['A'], date: '1900', repository: 'R', sourceType: 'book' };

test('complete record needs nothing', () => assert.equal(needsEnrichment(full), false));
test('missing title, date or holder triggers', () => {
  assert.equal(needsEnrichment({ ...full, title: ' ' }), true);
  assert.equal(needsEnrichment({ ...full, date: '' }), true);
  assert.equal(needsEnrichment({ ...full, repository: '' }), true);
  assert.equal(needsEnrichment({ ...full, repository: '', publisher: 'P' }), false);
});
test('creator matters only for book, image, website', () => {
  assert.equal(needsEnrichment({ ...full, creator: [] }), true);
  assert.equal(needsEnrichment({ ...full, creator: undefined, author: 'Smith' }), false);
  assert.equal(needsEnrichment({ ...full, sourceType: 'image', creator: [] }), true);
  assert.equal(needsEnrichment({ ...full, sourceType: 'census', creator: [] }), false);
  assert.equal(needsEnrichment({ ...full, sourceType: 'database', creator: [] }), false);
});
test('null or empty input needs enrichment', () => {
  assert.equal(needsEnrichment(null), true);
  assert.equal(needsEnrichment({}), true);
});

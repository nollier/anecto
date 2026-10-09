// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/wikipedia.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireAxe, ordreAxes } from './wikipedia.ts';

test('les axes tournent à partir de celui du lot', () => {
  assert.deepEqual(ordreAxes('patrimoine'), ['patrimoine', 'personnalites', 'histoire']);
  assert.deepEqual(ordreAxes('histoire'), ['histoire', 'patrimoine', 'personnalites']);
});

test('un axe inconnu retombe sur patrimoine', () => {
  assert.equal(lireAxe('histoire'), 'histoire');
  assert.equal(lireAxe(undefined), 'patrimoine');
  assert.equal(lireAxe('n’importe quoi'), 'patrimoine');
});

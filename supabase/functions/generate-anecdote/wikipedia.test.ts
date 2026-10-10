// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/wikipedia.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estRacontable, lireAxe, occurrences, ordreAxes } from './wikipedia.ts';

test('les axes tournent à partir de celui du lot', () => {
  assert.deepEqual(ordreAxes('patrimoine'), ['patrimoine', 'personnalites', 'histoire', 'mentions']);
  assert.deepEqual(ordreAxes('histoire'), ['histoire', 'mentions', 'patrimoine', 'personnalites']);
});

test('un axe inconnu retombe sur patrimoine', () => {
  assert.equal(lireAxe('histoire'), 'histoire');
  assert.equal(lireAxe(undefined), 'patrimoine');
  assert.equal(lireAxe('n’importe quoi'), 'patrimoine');
});

test('compte la ville sans tenir compte des accents ni des tirets', () => {
  assert.equal(occurrences('Saint-Jean-de-Luz, puis saint jean de luz, puis Saint-Jean-de-Luz.', 'Saint-Jean-de-Luz'), 3);
});

test('une fiche descriptive ne raconte rien', () => {
  const fiche =
    'Le casino de Saint-Jean-de-Luz compte 120 machines à sous et deux tables. ' +
    'Il est ouvert de 10 h à 3 h. Le casino de Saint-Jean-de-Luz est rénové en 2015. ' +
    'Saint-Jean-de-Luz en est propriétaire.';
  assert.equal(estRacontable(fiche, 'Saint-Jean-de-Luz'), false);
});

test('une histoire datée qui se passe dans la ville est racontable', () => {
  const histoire =
    'Le casino ouvre à Saint-Jean-de-Luz en 1928. Il fait faillite en 1934, ' +
    'sert d’hôpital en 1940 et rouvre en 1952. Saint-Jean-de-Luz le rachète, ' +
    'et Saint-Jean-de-Luz en confie la gestion à un groupe.';
  assert.equal(estRacontable(histoire, 'Saint-Jean-de-Luz'), true);
});

test('un article qui cite la ville une fois parle d’autre chose', () => {
  const ailleurs = 'Né en 1901 à Bayonne, il joue en 1920, 1921 et 1925, dont une fois à Saint-Jean-de-Luz.';
  assert.equal(estRacontable(ailleurs, 'Saint-Jean-de-Luz'), false);
});

test('une autre commune qui cite la ville n’est pas retenue', () => {
  const voisine =
    'Ciboure est une commune française située dans le département des Pyrénées-Atlantiques. ' +
    'En 1627, 1650, 1660 et 1700, Saint-Jean-de-Luz, Saint-Jean-de-Luz et Saint-Jean-de-Luz.';
  assert.equal(estRacontable(voisine, 'Saint-Jean-de-Luz'), false);
});

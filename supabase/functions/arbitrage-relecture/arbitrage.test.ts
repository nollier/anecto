// node --experimental-strip-types --test \
//   supabase/functions/arbitrage-relecture/arbitrage.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireArbitrage, reprochesDe } from './arbitrage.ts';

test('retire la ligne de verdict et le préfixe des reproches', () => {
  assert.deepEqual(
    reprochesDe(['Vérification : verdict doute, confiance haute.', 'Fond : date absente.']),
    ['date absente.']
  );
});

test('une réponse illisible ne décide rien', () => {
  assert.equal(lireArbitrage(null), null);
  assert.equal(lireArbitrage({ decision: 'valider' }), null);
});

test('publie quand aucun reproche n’est fondé', () => {
  const a = lireArbitrage({
    decision: 'publier',
    reproches: [{ reproche: 'distance', fonde: false, explication: 'dans le dossier' }],
    motif: 'Reproches infondés.',
  });
  assert.equal(a?.decision, 'publier');
});

test('un reproche fondé interdit de publier en l’état', () => {
  const a = lireArbitrage({
    decision: 'publier',
    reproches: [{ reproche: 'conclusion inventée', fonde: true, explication: '' }],
  });
  assert.equal(a?.decision, 'corriger');
  assert.equal(a?.consignes.length, 1);
});

test('un récit hors sujet se rejette', () => {
  const a = lireArbitrage({ decision: 'publier', hors_sujet: true, reproches: [] });
  assert.equal(a?.decision, 'rejeter');
  assert.match(a!.motif, /Hors sujet/);
});

test('corriger sans consigne ni reproche fondé ne décide rien', () => {
  assert.equal(lireArbitrage({ decision: 'corriger', reproches: [] }), null);
});

test('après une correction, il ne reste que publier ou rejeter', () => {
  const a = lireArbitrage(
    { decision: 'corriger', reproches: [{ reproche: 'x', fonde: true }], consignes: ['y'] },
    true
  );
  assert.equal(a?.decision, 'rejeter');
  assert.deepEqual(a?.consignes, []);
});

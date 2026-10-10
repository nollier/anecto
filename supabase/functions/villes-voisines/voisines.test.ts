// node --experimental-strip-types --test \
//   supabase/functions/villes-voisines/voisines.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sansLaVille, simplifier } from './voisines.ts';

test('retire la ville de sa propre liste de voisines', () => {
  const communes = [
    { insee: 'A', nom: 'Saint-Jean-de-Luz', departement: '64', population: 10000, distance_km: 0.4 },
    { insee: 'B', nom: 'Ciboure', departement: '64', population: 5000, distance_km: 1.2 },
  ];
  assert.deepEqual(sansLaVille(communes, 'Saint-Jean-de-Luz').map((c) => c.nom), ['Ciboure']);
});

test('compare les noms sans accents ni tirets', () => {
  assert.equal(simplifier('Saint-Pée-sur-Nivelle'), simplifier('saint pee sur nivelle'));
});

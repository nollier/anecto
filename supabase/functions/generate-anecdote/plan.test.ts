// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/plan.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numerosDoublons, trierPropositions, type DocPlan } from './plan.ts';
import type { Existante } from './doublons.ts';

const remplissage = ' Le reste de la notice décrit le bâtiment et son mobilier.'.repeat(40);

const DOCS: DocPlan[] = [
  {
    title: 'Aqueduc du Gier',
    extract: `L'aqueduc du Gier alimentait Lugdunum en eau. Sa construction remonte au règne d'Hadrien.${remplissage}`,
  },
  {
    title: 'Halle de Saint-Chamond',
    extract: `La halle fut reconstruite en 1867 après un incendie qui détruisit la charpente.${remplissage}`,
  },
  {
    title: 'Saint-Chamond',
    extract: `En 1820, la ville compte quarante moulins à lacets. La première foire est créée en 1430 par le seigneur.${remplissage}`,
  },
  { title: 'Chapelle courte', extract: 'La chapelle fut bénie en 1702 par l’évêque de Lyon.' },
];

const prop = (article: string, sujet: string, citation: string) => ({
  article,
  sujet,
  angle: `Ce que raconte ${sujet}`,
  faits: ['1867', 'incendie', 'charpente'],
  citation,
});

test('retient un sujet dont la phrase est dans son article', () => {
  const { retenus, ecartes } = trierPropositions(
    [prop('Halle de Saint-Chamond', 'La halle', 'La halle fut reconstruite en 1867 après un incendie')],
    DOCS,
    [],
    'Saint-Chamond'
  );
  assert.equal(retenus.length, 1, ecartes.join('\n'));
  assert.equal(retenus[0].article, 'Halle de Saint-Chamond');
});

test("écarte une phrase absente de l'article désigné, même présente ailleurs", () => {
  const { retenus } = trierPropositions(
    [prop('Aqueduc du Gier', 'La halle', 'La halle fut reconstruite en 1867 après un incendie')],
    DOCS,
    [],
    'Saint-Chamond'
  );
  assert.equal(retenus.length, 0);
});

test('écarte un article absent du dossier', () => {
  const { retenus } = trierPropositions(
    [prop('Château imaginaire', 'Le château', 'La halle fut reconstruite en 1867 après un incendie')],
    DOCS,
    [],
    'Saint-Chamond'
  );
  assert.equal(retenus.length, 0);
});

test('écarte un article trop court pour un récit', () => {
  const { retenus } = trierPropositions(
    [prop('Chapelle courte', 'La chapelle', 'La chapelle fut bénie en 1702 par l’évêque de Lyon')],
    DOCS,
    [],
    'Saint-Chamond'
  );
  assert.equal(retenus.length, 0);
});

test('écarte un article spécifique déjà exploité', () => {
  const existantes: Existante[] = [{ titre: "L'aqueduc oublié", accroche: null, articles: ['Aqueduc du Gier'] }];
  const { retenus, ecartes } = trierPropositions(
    [prop('Aqueduc du Gier', "L'aqueduc", "Sa construction remonte au règne d'Hadrien")],
    DOCS,
    existantes,
    'Saint-Chamond'
  );
  assert.equal(retenus.length, 0);
  assert.match(ecartes[0], /déjà servi/);
});

test("un article spécifique ne donne qu'un sujet, l'article de la ville plusieurs", () => {
  const { retenus } = trierPropositions(
    [
      prop('Halle de Saint-Chamond', 'La halle', 'La halle fut reconstruite en 1867 après un incendie'),
      prop('Halle de Saint-Chamond', "L'incendie", 'La halle fut reconstruite en 1867 après un incendie'),
      prop('Saint-Chamond', 'Les moulins à lacets', 'En 1820, la ville compte quarante moulins à lacets'),
      prop('Saint-Chamond', 'La foire', 'La première foire est créée en 1430 par le seigneur'),
    ],
    DOCS,
    [],
    'Saint-Chamond'
  );
  assert.deepEqual(
    retenus.map((r) => r.sujet),
    ['La halle', 'Les moulins à lacets', 'La foire']
  );
});

test('une réponse malformée ne retient rien', () => {
  assert.equal(trierPropositions(null, DOCS, [], 'Saint-Chamond').retenus.length, 0);
  assert.equal(trierPropositions([null, 3, 'x'], DOCS, [], 'Saint-Chamond').retenus.length, 0);
});

test('numerosDoublons ignore les numéros hors liste', () => {
  const n = numerosDoublons({ doublons: [{ numero: 2 }, { numero: 9 }, { numero: 'x' }] }, 3);
  assert.deepEqual([...n], [2]);
  assert.equal(numerosDoublons(null, 3).size, 0);
});

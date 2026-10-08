// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/plan.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentDe, dossierPlan, numerosDoublons, trierPropositions, type DocPlan } from './plan.ts';
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

test('documentDe : le numéro prime sur le titre', () => {
  assert.equal(documentDe({ document: 2, article: 'Aqueduc du Gier' }, DOCS)?.title, 'Halle de Saint-Chamond');
  assert.equal(documentDe({ document: 99, article: 'Aqueduc du Gier' }, DOCS)?.title, 'Aqueduc du Gier');
});

// Ce que le modèle a réellement rendu le 8 octobre pour Lille.
test("documentDe tolère l'en-tête complet recopié par le modèle", () => {
  const docs: DocPlan[] = [
    { title: 'Hôtel Petipas de Walle', extract: 'x' },
    { title: 'Centre hospitalier régional (C.H.R.)', extract: 'x' },
    { title: 'Lille', extract: 'x' },
  ];
  assert.equal(
    documentDe({ article: 'Hôtel Petipas de Walle — Wikipédia (https://fr.wikipedia.org/wiki/H%C3%B4tel_Petipas_de_Walle)' }, docs)?.title,
    'Hôtel Petipas de Walle'
  );
  assert.equal(
    documentDe(
      { article: 'Centre hospitalier régional (C.H.R.) — Base Mérimée — ministère de la Culture (https://www.pop.culture.gouv.fr/notice/merimee/ACR0000624)' },
      docs
    )?.title,
    'Centre hospitalier régional (C.H.R.)'
  );
  assert.equal(documentDe({ article: 'DOCUMENT 3 : Lille' }, docs)?.title, 'Lille');
  // « Lille » ne doit pas capter « Lillebonne ».
  assert.equal(documentDe({ article: 'Lillebonne' }, docs), undefined);
});

test('dossierPlan numérote les documents à partir de 1', () => {
  assert.match(dossierPlan(DOCS), /^=== DOCUMENT 1 : Aqueduc du Gier ===/);
  assert.match(dossierPlan(DOCS), /=== DOCUMENT 2 : Halle de Saint-Chamond ===/);
});

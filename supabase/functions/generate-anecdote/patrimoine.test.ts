// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/patrimoine.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectionnerNotices } from './patrimoine.ts';

const LONG = 'La villa est construite en 1926-28 par Albert Laprade. '.repeat(10);

function notice(ref: string, tico: string, com: string, insee: string, hist = LONG) {
  return {
    REF: ref,
    TICO: tico,
    COM: [com],
    INSEE: `["${insee}"]`,
    HIST: hist,
    DESC: '',
    // Journal des modifications dans la v2 : ne doit jamais sortir.
    HISTORIQUE: '[{"nom": "Agent", "email": "agent@culture.gouv.fr"}]',
  };
}

test('garde les notices de la commune, les plus riches d’abord', () => {
  const docs = selectionnerNotices(
    [
      notice('PA1', 'Chapelle', 'Bénodet', '29006', LONG),
      notice('PA2', 'Villa le Minaret', 'Bénodet', '29006', LONG + LONG),
      notice('PA3', 'Menhir', 'Bénodet', '29006', 'Trop court.'),
    ],
    'Bénodet'
  );
  assert.deepEqual(
    docs.map((d) => d.title),
    ['Villa le Minaret', 'Chapelle']
  );
  assert.equal(docs[0].url, 'https://www.pop.culture.gouv.fr/notice/merimee/PA2');
  assert.equal(docs[0].origine, 'merimee');
});

test('n’inclut jamais le journal HISTORIQUE', () => {
  const [doc] = selectionnerNotices([notice('PA1', 'Chapelle', 'Bénodet', '29006')], 'Bénodet');
  assert.ok(!doc.extract.includes('culture.gouv.fr'));
});

test('ignore les accents et la casse sur la commune', () => {
  const docs = selectionnerNotices([notice('PA1', 'Chapelle', 'Bénodet', '29006')], 'benodet');
  assert.equal(docs.length, 1);
});

test('écarte une commune homonyme dans plusieurs départements', () => {
  const docs = selectionnerNotices(
    [
      notice('PA1', 'Cimetière marin', 'Saint-Paul', '97415'),
      notice('PA2', 'Église', 'Saint-Paul', '60591'),
    ],
    'Saint-Paul'
  );
  assert.deepEqual(docs, []);
});

test('écarte les notices d’une autre commune', () => {
  const docs = selectionnerNotices(
    [notice('PA1', 'Aqueduc', 'Genilac', '42225'), notice('PA2', 'Église', 'Saint-Chamond', '42207')],
    'Saint-Chamond'
  );
  assert.deepEqual(docs.map((d) => d.title), ['Église']);
});

test('écarte les notices déjà exploitées', () => {
  const docs = selectionnerNotices(
    [notice('PA1', 'Église Saint-Pierre', 'Saint-Chamond', '42207')],
    'Saint-Chamond',
    ['église saint-pierre']
  );
  assert.deepEqual(docs, []);
});

// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/verification.test.ts
//
// Ce fichier, et pas le dossier : viser le dossier ferait charger index.ts,
// dont les imports `npm:` et `Deno.env` n'existent pas sous Node.
//
// Ces cas décrivent ce que le garde-fou doit laisser passer et ce qu'il doit
// arrêter. Ceux sur les millésimes sont les plus importants : c'est l'erreur
// qui coûte le plus cher au produit — un récit vrai avec une date fabriquée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controler, normalize, MIN_CITATIONS } from './verification.ts';

const SOURCE = `Saint-Malo est une commune française située dans le département d'Ille-et-Vilaine.
Du XIIe au XVIIIe siècle, une meute de mâtins était lâchée chaque soir sur la grève afin de garder
les navires échoués à marée basse. Cette coutume, dite des chiens du guet, fut abolie en 1770 après
la mort d'un jeune officier de marine. Les remparts furent élevés à partir de 1155 par l'évêque
Jean de Châtillon.`;

/** Trois citations exactes, de quoi satisfaire le minimum sans bruit. */
const CITATIONS_VALIDES = [
  'une meute de mâtins était lâchée chaque soir sur la grève',
  'Cette coutume, dite des chiens du guet, fut abolie en 1770',
  'Les remparts furent élevés à partir de 1155',
];

test('accepte des citations exactes et des millésimes présents dans la source', () => {
  const res = controler(
    {
      corps: 'Chaque soir, une meute est lâchée sur la grève. La coutume est abolie en 1770.',
      citations: CITATIONS_VALIDES,
    },
    SOURCE
  );
  assert.equal(res.ok, true);
  assert.equal(res.citationsValides.length, 3);
});

test('tolère les accents perdus et les apostrophes typographiques', () => {
  const res = controler(
    {
      corps: 'La coutume est abolie en 1770.',
      citations: [
        'une meute de matins etait lachee chaque soir sur la greve',
        "Cette coutume, dite des chiens du guet, fut abolie en 1770",
        'Les remparts furent eleves a partir de 1155',
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, true);
});

test('rejette des citations introuvables dans la source', () => {
  const res = controler(
    {
      corps: 'Les marchands ne pouvaient vendre le sel le dimanche.',
      citations: [
        'le conseil municipal interdit aux marchands de vendre du sel',
        'une ordonnance royale confirma cette interdiction',
        'les contrevenants étaient bannis de la ville pour un an',
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /0\/3 citation/);
});

test('rejette un millésime fabriqué, même avec des citations valides', () => {
  const res = controler(
    {
      corps: 'La coutume, née au XIIe siècle, disparaît en 1789 après un drame.',
      citations: CITATIONS_VALIDES,
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /1789/);
});

test("contrôle aussi les millésimes de l'accroche, pas seulement ceux du corps", () => {
  const res = controler(
    {
      accroche: 'Sur la grève de Saint-Malo, une meute de chiens montait la garde jusqu’en 1789',
      corps: 'La coutume est abolie après la mort d’un officier.',
      citations: CITATIONS_VALIDES,
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /1789/);
});

test('accepte une accroche dont les millésimes figurent dans la source', () => {
  const res = controler(
    {
      accroche: 'Sur la grève de Saint-Malo, une meute de chiens montait la garde jusqu’en 1770',
      corps: 'La coutume est abolie après la mort d’un officier.',
      citations: CITATIONS_VALIDES,
    },
    SOURCE
  );
  assert.equal(res.ok, true);
});

test('exige trois citations valides, pas deux', () => {
  const res = controler(
    {
      corps: 'Les remparts sont élevés à partir de 1155.',
      citations: [
        'Les remparts furent élevés à partir de 1155',
        'une meute de mâtins était lâchée chaque soir sur la grève',
        'construits par les marchands corsaires de la ville',
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /2\/3 citation/);
  assert.equal(MIN_CITATIONS, 3);
});

test('ignore les citations trop courtes pour prouver quoi que ce soit', () => {
  const res = controler(
    { corps: 'Une coutume ancienne.', citations: ['la grève', 'les chiens', 'le guet'] },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.equal(res.citationsValides.length, 0);
});

test('supporte un champ citations absent ou du mauvais type', () => {
  assert.equal(controler({ corps: 'x', citations: undefined }, SOURCE).ok, false);
  assert.equal(controler({ corps: 'x', citations: 'une chaîne' }, SOURCE).ok, false);
  assert.equal(controler({ corps: 'x', citations: [42, null] }, SOURCE).ok, false);
});

test('normalize uniformise la casse, les accents et les blancs', () => {
  assert.equal(normalize('  Été   PLUVIEUX\n'), 'ete pluvieux');
  assert.equal(normalize('l’écluse'), "l'ecluse");
  assert.equal(normalize('1770–1789'), '1770-1789');
});

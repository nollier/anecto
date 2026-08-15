// node --experimental-strip-types --test supabase/functions/generate-anecdote/
//
// Ces cas décrivent ce que le garde-fou doit laisser passer et ce qu'il doit
// arrêter. Le quatrième est le plus important : c'est l'erreur qui coûte le
// plus cher au produit — un récit vrai avec une date fabriquée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controler, normalize } from './verification.ts';

const SOURCE = `Saint-Malo est une commune française située dans le département d'Ille-et-Vilaine.
Du XIIe au XVIIIe siècle, une meute de mâtins était lâchée chaque soir sur la grève afin de garder
les navires échoués à marée basse. Cette coutume, dite des chiens du guet, fut abolie en 1770 après
la mort d'un jeune officier de marine. Les remparts furent élevés à partir de 1155 par l'évêque
Jean de Châtillon.`;

test('accepte des citations exactes et des millésimes présents dans la source', () => {
  const res = controler(
    {
      corps: 'Chaque soir, une meute est lâchée sur la grève. La coutume est abolie en 1770.',
      citations: [
        'une meute de mâtins était lâchée chaque soir sur la grève',
        'Cette coutume, dite des chiens du guet, fut abolie en 1770',
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, true);
  assert.equal(res.citationsValides.length, 2);
});

test('tolère les accents perdus et les apostrophes typographiques', () => {
  const res = controler(
    {
      corps: 'La coutume est abolie en 1770.',
      citations: [
        'une meute de matins etait lachee chaque soir sur la greve',
        "Cette coutume, dite des chiens du guet, fut abolie en 1770",
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
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /0\/2 citation/);
});

test('rejette un millésime fabriqué, même avec des citations valides', () => {
  const res = controler(
    {
      corps: 'La coutume, née au XIIe siècle, disparaît en 1789 après un drame.',
      citations: [
        'une meute de mâtins était lâchée chaque soir sur la grève',
        'Les remparts furent élevés à partir de 1155',
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /1789/);
});

test('exige deux citations valides, pas une', () => {
  const res = controler(
    {
      corps: 'Les remparts sont élevés à partir de 1155.',
      citations: [
        'Les remparts furent élevés à partir de 1155',
        'construits par les marchands corsaires de la ville',
      ],
    },
    SOURCE
  );
  assert.equal(res.ok, false);
  assert.match(res.reason!, /1\/2 citation/);
});

test('ignore les citations trop courtes pour prouver quoi que ce soit', () => {
  const res = controler({ corps: 'Une coutume ancienne.', citations: ['la grève', 'les chiens'] }, SOURCE);
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

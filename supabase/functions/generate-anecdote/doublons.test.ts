// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/doublons.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleDejaTraite,
  articlesSpecifiques,
  estArticleGeneral,
  type Existante,
} from './doublons.ts';

const EXISTANTES: Existante[] = [
  { titre: "L'aqueduc oublié", accroche: null, articles: ['Aqueduc du Gier'] },
  { titre: 'Le lacet qui fit la ville', accroche: null, articles: ['Saint-Chamond'] },
];

test("l'article de la ville et celui de son histoire sont généraux", () => {
  assert.equal(estArticleGeneral('Saint-Chamond', 'Saint-Chamond'), true);
  assert.equal(estArticleGeneral('Saint-Paul (La Réunion)', 'Saint-Paul'), true);
  assert.equal(estArticleGeneral('Histoire de Lille', 'Lille'), true);
  assert.equal(estArticleGeneral('Bénodet', 'Benodet'), true);
  assert.equal(estArticleGeneral('Aqueduc du Gier', 'Saint-Chamond'), false);
  assert.equal(estArticleGeneral('Saint-Chamond (homonymie)', 'Saint-Chamond'), true);
});

test('un article de monument déjà exploité bloque la candidate', () => {
  const res = articleDejaTraite(['Aqueduc du Gier'], EXISTANTES, 'Saint-Chamond');
  assert.deepEqual(res, { article: 'Aqueduc du Gier', titre: "L'aqueduc oublié" });
});

test('la comparaison ignore la casse et les accents', () => {
  const res = articleDejaTraite(['aqueduc du gier'], EXISTANTES, 'Saint-Chamond');
  assert.equal(res?.titre, "L'aqueduc oublié");
});

test("l'article général de la ville ne bloque pas", () => {
  assert.equal(articleDejaTraite(['Saint-Chamond'], EXISTANTES, 'Saint-Chamond'), null);
});

test('un article neuf passe', () => {
  assert.equal(
    articleDejaTraite(['Gare de Saint-Chamond'], EXISTANTES, 'Saint-Chamond'),
    null
  );
});

test("un doublon n'épuise que ses articles spécifiques, jamais ceux de la ville", () => {
  assert.deepEqual(
    articlesSpecifiques(['Lille', 'Histoire de Lille', 'Hôpital Sainte-Eugénie de Lille'], 'Lille'),
    ['Hôpital Sainte-Eugénie de Lille']
  );
  assert.deepEqual(articlesSpecifiques(['Saint-Malo'], 'Saint-Malo'), []);
});

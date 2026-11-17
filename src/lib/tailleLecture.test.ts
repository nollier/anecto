// node --experimental-strip-types --test src/lib/tailleLecture.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTORISER_POLICE_SYSTEME,
  PALIERS,
  INDICE_DEFAUT,
  TAILLE_BOUTON_QUIZ,
  TEXTES_QUIZ,
  agrandir,
  empilerBoutonsQuiz,
  facteur,
  indiceDepuisStockage,
  interligneSuffisant,
  mesureCorps,
  mesureTitre,
  peutAgrandir,
  peutReduire,
  reduire,
  texteDuTitre,
} from './tailleLecture.ts';

test('cinq paliers, de la taille actuelle jusqu’à +60 %', () => {
  assert.equal(PALIERS.length, 5);
  assert.equal(PALIERS[0], 1);
  assert.equal(PALIERS[PALIERS.length - 1], 1.6);
  for (let i = 1; i < PALIERS.length; i++) {
    assert.ok(PALIERS[i] > PALIERS[i - 1]);
  }
});

test('le palier par défaut est la taille actuelle de l’anecdote', () => {
  assert.equal(INDICE_DEFAUT, 0);
  assert.equal(facteur(INDICE_DEFAUT), 1);
  assert.deepEqual(mesureTitre(0), { fontSize: 21, lineHeight: 28 });
  assert.deepEqual(mesureCorps(0), { fontSize: 16, lineHeight: 26 });
  assert.equal(peutReduire(0), false);
  assert.equal(peutAgrandir(0), true);
});

test('l’interligne reste proportionnel à chaque palier', () => {
  for (let i = 0; i < PALIERS.length; i++) {
    const titre = mesureTitre(i);
    const corps = mesureCorps(i);
    assert.equal(titre.fontSize, 21 * facteur(i));
    assert.equal(corps.fontSize, 16 * facteur(i));
    assert.ok(Math.abs(titre.lineHeight / titre.fontSize - 28 / 21) < 1e-10);
    assert.ok(Math.abs(corps.lineHeight / corps.fontSize - 26 / 16) < 1e-10);
    assert.equal(interligneSuffisant(titre.fontSize, titre.lineHeight), true);
    assert.equal(interligneSuffisant(corps.fontSize, corps.lineHeight), true);
  }
});

test('quatre appuis sur A+ mènent à +60 %, pas au-delà', () => {
  let i = INDICE_DEFAUT;
  for (let n = 0; n < 4; n++) i = agrandir(i);
  assert.equal(i, 4);
  assert.equal(facteur(i), 1.6);
  assert.equal(mesureTitre(i).fontSize, 21 * 1.6);
  assert.equal(mesureCorps(i).lineHeight, 26 * 1.6);
  assert.equal(agrandir(i), i);
  assert.equal(peutAgrandir(i), false);
  assert.equal(peutReduire(i), true);
});

test('A- s’arrête sur la taille actuelle', () => {
  assert.equal(reduire(0), 0);
  assert.equal(reduire(1), 0);
  assert.equal(reduire(3), 2);
  assert.equal(peutReduire(reduire(1)), false);
});

test('l’accroche et le titre court partagent la même taille', () => {
  assert.equal(texteDuTitre({ hook: 'Une accroche longue', title: 'Titre court' }), 'Une accroche longue');
  assert.equal(texteDuTitre({ hook: null, title: 'Titre court' }), 'Titre court');
  assert.equal(texteDuTitre({ hook: '', title: 'Titre court' }), 'Titre court');
  assert.deepEqual(mesureTitre(2), mesureTitre(2));
});

test('une valeur stockée illisible revient au palier par défaut', () => {
  assert.equal(indiceDepuisStockage(null), 0);
  assert.equal(indiceDepuisStockage(''), 0);
  assert.equal(indiceDepuisStockage('  '), 0);
  assert.equal(indiceDepuisStockage('2'), 2);
  assert.equal(indiceDepuisStockage(' 4 '), 4);
  assert.equal(indiceDepuisStockage('9'), 0);
  assert.equal(indiceDepuisStockage('-1'), 0);
  assert.equal(indiceDepuisStockage('1.5'), 0);
  assert.equal(indiceDepuisStockage('foo'), 0);
});

test('la police système reste autorisée', () => {
  assert.equal(AUTORISER_POLICE_SYSTEME, true);
});

test('les textes du quiz ont un interligne qui ne coupe pas le glyphe', () => {
  for (const [nom, mesure] of Object.entries(TEXTES_QUIZ)) {
    assert.equal(interligneSuffisant(mesure.fontSize, mesure.lineHeight), true, nom);
  }
  assert.equal(TAILLE_BOUTON_QUIZ, TEXTES_QUIZ.bouton.fontSize);
});

test('« Vrai » et « Faux » s’empilent quand la police système les ferait déborder', () => {
  const libelles = ['Vrai', 'Faux'] as const;
  // iPhone SE, police normale : côte à côte.
  assert.equal(empilerBoutonsQuiz(320 - 40, 1, libelles), false);
  // Même téléphone, très grande police : l’un sous l’autre.
  assert.equal(empilerBoutonsQuiz(320 - 40, 2, libelles), true);
  assert.equal(empilerBoutonsQuiz(320 - 40, 3, libelles), true);
  // Grand téléphone, police un peu agrandie : toujours côte à côte.
  assert.equal(empilerBoutonsQuiz(390 - 40, 1.3, libelles), false);
  // Un libellé long ne tient plus dans la moitié de l’écran.
  assert.equal(empilerBoutonsQuiz(280, 1, ['Vrai', 'Absolument']), true);
  // Largeur inconnue : on empile, pour ne pas déborder.
  assert.equal(empilerBoutonsQuiz(0, 1, libelles), true);
});
